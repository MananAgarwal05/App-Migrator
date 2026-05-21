import { NextRequest } from "next/server";
import AdmZip from "adm-zip";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { decrypt, encrypt } from "@/lib/encryption";
import { createGitHubRepo } from "@/lib/github/create-repo";
import { pushCode } from "@/lib/github/push-code";
import { createVercelProject } from "@/lib/vercel/create-project";
import { setEnvVars } from "@/lib/vercel/set-env-vars";
import { triggerDeploy } from "@/lib/vercel/deploy";
import { waitForDeployment } from "@/lib/vercel/poll-status";
import type { AnalysisResult } from "@/lib/analyzer";
import { detectMochaExport, remapMochaFiles } from "@/lib/mocha/detect";
import { transformMochaFiles } from "@/lib/mocha/transform";
import {
  detectTargetDbType,
  runD1MigrationOnPostgres,
} from "@/lib/mocha/migrate-db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const body = (await request.json()) as {
      envVars?: Record<string, string>;
      targetDbUrl?: string;
    };
    const envVars = body.envVars ?? {};
    const targetDbUrl = body.targetDbUrl?.trim() ?? "";

    const deployment = await prisma.deployment.findUnique({
      where: { id: jobId },
    });

    if (!deployment) {
      return Response.json({ error: "Deployment not found" }, { status: 404 });
    }

    if (!["ANALYZED", "UPLOADED", "FAILED"].includes(deployment.status)) {
      return Response.json(
        { error: "Deployment is already in progress or completed" },
        { status: 409 }
      );
    }

    // Fetch user tokens
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.githubToken) {
      return Response.json(
        { error: "GitHub account not connected. Please sign in with GitHub." },
        { status: 400 }
      );
    }
    if (!user?.vercelToken) {
      return Response.json(
        { error: "Vercel account not connected. Please sign in with Vercel." },
        { status: 400 }
      );
    }

    const githubToken = decrypt(user.githubToken);
    const vercelToken = decrypt(user.vercelToken);

    // Link deployment to user
    await prisma.deployment.update({
      where: { id: jobId },
      data: {
        userId,
        status: "CREATING_REPO",
        currentStep: "CREATING_REPO",
        error: null,
        envVars: Object.keys(envVars).length > 0
          ? encrypt(JSON.stringify(envVars))
          : null,
      },
    });

    // Run pipeline asynchronously
    runDeploymentPipeline({
      jobId,
      deployment,
      githubToken,
      vercelToken,
      envVars,
      targetDbUrl,
    });

    return Response.json(
      {
        jobId,
        status: "CREATING_REPO",
        message: "Starting deployment pipeline...",
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("Deploy route error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Deploy failed" },
      { status: 500 }
    );
  }
}

async function runDeploymentPipeline({
  jobId,
  deployment,
  githubToken,
  vercelToken,
  envVars,
  targetDbUrl,
}: {
  jobId: string;
  deployment: { zipPath: string | null; originalFilename: string; analysisResult: unknown };
  githubToken: string;
  vercelToken: string;
  envVars: Record<string, string>;
  targetDbUrl: string;
}) {
  const analysisResult = deployment.analysisResult as AnalysisResult | null;
  const projectName =
    deployment.originalFilename.replace(/\.zip$/i, "") || "my-app";

  try {
    // Step 1: Load file map from ZIP (binary buffers for push)
    const zipPath = deployment.zipPath ?? path.join("/tmp", jobId, "upload.zip");
    const buffer = await readFile(zipPath);
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let fileMap = new Map<string, Buffer | string>();
    // Also build a text-only map for Mocha detection
    const textMap = new Map<string, string>();

    const topFolder = detectTopLevelFolder(entries.map((e) => e.entryName));

    for (const entry of entries) {
      if (!entry.isDirectory) {
        const entryName = stripTopFolder(entry.entryName, topFolder);
        fileMap.set(entryName, entry.getData());
        try { textMap.set(entryName, entry.getData().toString("utf8")); } catch { /* binary */ }
      }
    }

    // Apply Mocha transformations if needed
    const mochaInfo = detectMochaExport(textMap);
    if (mochaInfo.isMochaExport) {
      // Remap: keep only code/* files, strip to root
      const remappedText = remapMochaFiles(textMap);
      const transformedText = transformMochaFiles(remappedText);

      // Rebuild binary file map from the transformed text map
      const remappedBinary = new Map<string, Buffer | string>();
      for (const [p, buf] of fileMap) {
        const stripped = p.startsWith("code/") ? p.slice("code/".length) : null;
        if (!stripped) continue;
        // Use transformed content if available (e.g. vite.config.ts was rewritten)
        const transformed = transformedText.get(stripped);
        remappedBinary.set(stripped, transformed !== undefined ? transformed : buf);
      }
      fileMap = remappedBinary;
    }

    const hasGitignore = fileMap.has(".gitignore");

    // Inject legacy-peer-deps to handle common npm dependency conflicts
    if (fileMap.has("package.json")) {
      if (!fileMap.has(".npmrc")) {
        fileMap.set(".npmrc", "legacy-peer-deps=true\n");
      } else {
        const existing = fileMap.get(".npmrc")!.toString();
        if (!existing.includes("legacy-peer-deps")) {
          fileMap.set(".npmrc", existing + "\nlegacy-peer-deps=true\n");
        }
      }
    }

    // Patch tsconfig files to skip strict type checking (migrated code may have TS errors)
    for (const [filePath, content] of fileMap) {
      if (/tsconfig(\.[^/]+)?\.json$/i.test(filePath)) {
        const patched = patchTsConfig(content.toString());
        if (patched !== content.toString()) fileMap.set(filePath, patched);
      }
    }

    // Patch package.json build script to remove tsc type-check step
    if (fileMap.has("package.json")) {
      const patched = patchPackageJson(fileMap.get("package.json")!.toString());
      fileMap.set("package.json", patched);
    }

    // Step 1b: Run D1 → target DB migration if user provided a URL
    const mergedEnvVars = { ...envVars };
    if (mochaInfo.isMochaExport && mochaInfo.hasDatabase && targetDbUrl) {
      const dbType = detectTargetDbType(targetDbUrl);
      const d1Sql = textMap.get("d1_dump.sql") ?? "";

      if (dbType === "postgresql" && d1Sql) {
        await updateStatus(jobId, "MIGRATING_DB");
        const migrationResult = await runD1MigrationOnPostgres(d1Sql, targetDbUrl);
        if (!migrationResult.success) {
          // Non-fatal: log and continue — user can fix manually
          console.warn(`D1 migration failed: ${migrationResult.error}`);
        }
      }

      // Always inject the URL as DATABASE_URL (or MONGODB_URI for Mongo) so the app can connect
      if (dbType === "mongodb") {
        mergedEnvVars["MONGODB_URI"] ??= targetDbUrl;
      } else {
        mergedEnvVars["DATABASE_URL"] ??= targetDbUrl;
      }
    }

    // Step 2: Create GitHub repo
    await updateStatus(jobId, "CREATING_REPO");
    const repoResult = await createGitHubRepo(
      githubToken,
      projectName,
      hasGitignore
    );

    await prisma.deployment.update({
      where: { id: jobId },
      data: {
        githubRepoUrl: repoResult.repoUrl,
        githubRepoName: repoResult.repoName,
      },
    });

    // Step 3: Push code
    await updateStatus(jobId, "PUSHING_CODE");
    const [owner] = repoResult.fullName.split("/");
    await pushCode(
      githubToken,
      owner,
      repoResult.repoName,
      fileMap,
      "main"
    );

    // Step 4: Create Vercel project
    await updateStatus(jobId, "CREATING_PROJECT");
    const projectConfig = {
      framework: analysisResult?.framework?.name ?? "other",
      buildCommand: analysisResult?.buildCommand ?? null,
      outputDirectory: analysisResult?.outputDirectory ?? null,
      installCommand: analysisResult?.installCommand ?? null,
      nodeVersion: analysisResult?.nodeVersion ?? null,
      repoFullName: repoResult.fullName,
    };

    const vercelProject = await createVercelProject(vercelToken, projectConfig);

    await prisma.deployment.update({
      where: { id: jobId },
      data: { vercelProjectId: vercelProject.projectId },
    });

    // Set env vars if provided
    if (Object.keys(mergedEnvVars).length > 0) {
      await setEnvVars(vercelToken, vercelProject.projectId, mergedEnvVars);
    }

    // Step 5: Trigger deployment via GitHub
    await updateStatus(jobId, "DEPLOYING");
    const deployResult = await triggerDeploy(
      vercelToken,
      vercelProject.projectId,
      repoResult.fullName,
      "main"
    );

    await prisma.deployment.update({
      where: { id: jobId },
      data: { vercelDeployId: deployResult.deploymentId },
    });

    // Step 6: Wait for deployment
    const finalStatus = await waitForDeployment(
      vercelToken,
      deployResult.deploymentId
    );

    if (finalStatus.uiState === "success") {
      await prisma.deployment.update({
        where: { id: jobId },
        data: {
          status: "LIVE",
          currentStep: "LIVE",
          vercelUrl: finalStatus.url ?? deployResult.deploymentUrl,
          buildLogs: finalStatus.buildLogs,
        },
      });
    } else {
      await prisma.deployment.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          currentStep: "DEPLOYING",
          error: finalStatus.uiMessage,
          buildLogs: finalStatus.buildLogs,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deployment failed";
    const current = await prisma.deployment.findUnique({ where: { id: jobId } });

    await prisma.deployment.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        currentStep: current?.currentStep ?? null,
        error: message,
      },
    });
  }
}

async function updateStatus(jobId: string, status: string) {
  await prisma.deployment.update({
    where: { id: jobId },
    data: {
      status: status as Parameters<typeof prisma.deployment.update>[0]["data"]["status"],
      currentStep: status,
    },
  });
}

function detectTopLevelFolder(entryNames: string[]): string | null {
  const firstSegments = new Set(
    entryNames.map((n) => n.split("/")[0]).filter(Boolean)
  );
  if (firstSegments.size !== 1) return null;
  const folder = [...firstSegments][0];
  return entryNames.some((n) => n.startsWith(folder + "/")) ? folder : null;
}

function stripTopFolder(entryName: string, topFolder: string | null): string {
  if (!topFolder) return entryName;
  if (entryName.startsWith(topFolder + "/")) {
    return entryName.slice(topFolder.length + 1);
  }
  return entryName;
}

function patchTsConfig(content: string): string {
  try {
    const config = JSON.parse(content);
    config.compilerOptions = config.compilerOptions ?? {};
    // Skip type checking for lib files — common in migrated code
    config.compilerOptions.skipLibCheck = true;
    // Remove references to local .d.ts files that may not exist (e.g. generated worker types)
    if (Array.isArray(config.compilerOptions.types)) {
      config.compilerOptions.types = config.compilerOptions.types.filter(
        (t: string) => !t.startsWith("./")
      );
      if (config.compilerOptions.types.length === 0) {
        delete config.compilerOptions.types;
      }
    }
    return JSON.stringify(config, null, 2);
  } catch {
    return content;
  }
}

function patchPackageJson(content: string): string {
  try {
    const pkg = JSON.parse(content);
    if (typeof pkg.scripts?.build === "string") {
      // Remove standalone tsc type-check invocations before the real build tool
      // e.g. "tsc -b && vite build"  →  "vite build"
      // e.g. "tsc && vite build"     →  "vite build"
      pkg.scripts.build = pkg.scripts.build
        .replace(/^tsc(\s+[^&|;]+)?\s*&&\s*/, "")
        .replace(/^tsc(\s+[^&|;]+)?\s*;\s*/, "");
    }
    return JSON.stringify(pkg, null, 2);
  } catch {
    return content;
  }
}
