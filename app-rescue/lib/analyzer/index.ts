import { detectFramework } from "./detect-framework";
import { detectEnvVars, type EnvVar } from "./detect-env-vars";
import { detectBackend } from "./detect-backend";
import type { MochaExportInfo } from "@/lib/mocha/detect";

export interface Warning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  suggestion: string;
}

export interface AnalysisResult {
  jobId: string;
  status: "success" | "warning" | "unsupported";
  framework: {
    name: string;
    version: string | null;
    confidence: number;
  };
  buildCommand: string | null;
  outputDirectory: string | null;
  installCommand: string | null;
  nodeVersion: string | null;
  envVars: EnvVar[];
  warnings: Warning[];
  fileCount: number;
  totalSize: number;
  hasBackend: boolean;
  backendType: string | null;
  databaseDetected: string | null;
  deployable: boolean;
  suggestedFixes: string[];
  isMochaExport?: boolean;
  mochaAppName?: string | null;
}

export type FileMap = Map<string, string>;

export function analyzeProject(
  jobId: string,
  files: FileMap,
  mochaInfo?: MochaExportInfo
): AnalysisResult {
  const framework = detectFramework(files);
  const envVars = detectEnvVars(files);
  const backend = detectBackend(files);

  const warnings: Warning[] = [];
  const suggestedFixes: string[] = [];

  // Unsupported frameworks
  if (framework.name === "python" || framework.name === "docker") {
    warnings.push({
      code: "UNSUPPORTED_FRAMEWORK",
      severity: "error",
      message: `This project type (${framework.name}) isn't supported for auto-deployment yet.`,
      suggestion:
        "Only Next.js, React (Vite/CRA), Vue, SvelteKit, Astro, and static sites are supported.",
    });
    return {
      jobId,
      status: "unsupported",
      framework: {
        name: framework.name,
        version: framework.version,
        confidence: framework.confidence,
      },
      buildCommand: null,
      outputDirectory: null,
      installCommand: null,
      nodeVersion: null,
      envVars,
      warnings,
      fileCount: files.size,
      totalSize: getTotalSize(files),
      hasBackend: backend.hasBackend,
      backendType: backend.backendType,
      databaseDetected: backend.databaseDetected,
      deployable: false,
      suggestedFixes,
    };
  }

  // No build script
  let packageJson: Record<string, unknown> | null = null;
  const pkgContent = files.get("package.json");
  if (pkgContent) {
    try {
      packageJson = JSON.parse(pkgContent) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  if (packageJson) {
    const scripts = (packageJson.scripts as Record<string, string>) ?? {};
    if (!scripts.build) {
      warnings.push({
        code: "NO_BUILD_SCRIPT",
        severity: "warning",
        message: "No build script found in package.json.",
        suggestion:
          'Add a "build" script to your package.json, e.g. "build": "next build".',
      });
      suggestedFixes.push('Add a "build" script to package.json');
    }

    // No lockfile
    const hasLockfile =
      files.has("package-lock.json") ||
      files.has("yarn.lock") ||
      files.has("pnpm-lock.yaml") ||
      files.has("bun.lockb");

    if (!hasLockfile) {
      warnings.push({
        code: "NO_LOCKFILE",
        severity: "warning",
        message: "No lockfile found (package-lock.json, yarn.lock, etc.).",
        suggestion:
          "Run your package manager install locally and commit the lockfile for reproducible builds.",
      });
    }

    // Monorepo detection
    const workspaces = packageJson.workspaces;
    const hasLerna = files.has("lerna.json");
    if (workspaces || hasLerna) {
      warnings.push({
        code: "MONOREPO_DETECTED",
        severity: "warning",
        message:
          "Monorepo detected. Automatic deployment may not work correctly.",
        suggestion:
          "Specify which package to deploy in Vercel project settings.",
      });
    }
  }

  // Prisma without DATABASE_URL
  if (backend.databaseDetected === "prisma") {
    const hasDatabaseUrl = envVars.some((v) => v.key === "DATABASE_URL");
    if (!hasDatabaseUrl) {
      warnings.push({
        code: "PRISMA_NO_DATABASE_URL",
        severity: "error",
        message:
          "Prisma detected but no DATABASE_URL environment variable found.",
        suggestion:
          "Add DATABASE_URL to your environment variables pointing to a PostgreSQL database.",
      });
      suggestedFixes.push("Provide DATABASE_URL environment variable");
    }
  }

  // .env file with potential secrets
  const hasRealEnv =
    files.has(".env") ||
    files.has(".env.local") ||
    files.has(".env.production");
  if (hasRealEnv) {
    warnings.push({
      code: "ENV_FILE_DETECTED",
      severity: "warning",
      message:
        "We detected .env files in your upload. We've excluded them from storage for security.",
      suggestion:
        "Please re-enter any required environment variable values manually.",
    });
  }

  // Mocha-specific warnings
  if (mochaInfo?.isMochaExport) {
    warnings.push({
      code: "MOCHA_FRONTEND_ONLY",
      severity: "warning",
      message:
        "This is a Mocha export. The React frontend will be deployed to Vercel. " +
        "The Hono backend (Cloudflare Worker) cannot run on Vercel — it will need separate migration.",
      suggestion:
        "The live Vercel URL will serve your frontend. API calls to the backend will not work until you redeploy the worker separately on Cloudflare.",
    });

    if (mochaInfo.hasDatabase) {
      warnings.push({
        code: "MOCHA_D1_DATABASE",
        severity: "warning",
        message:
          "A Cloudflare D1 (SQLite) database dump was found (d1_dump.sql). " +
          "Your app will not have a working database on Vercel.",
        suggestion:
          "To restore data: create a new Cloudflare D1 database and run `wrangler d1 execute <db> --file=d1_dump.sql`, " +
          "or migrate to Neon/Supabase by converting the SQL dump.",
      });
    }

    if (mochaInfo.hasUsers) {
      warnings.push({
        code: "MOCHA_AUTH",
        severity: "warning",
        message:
          "User authentication was handled by Mocha's platform. Sign-in will not work on the deployed Vercel app.",
        suggestion:
          "Replace @getmocha/users-service with a provider like Clerk, Auth.js, or Supabase Auth.",
      });
    }

    if (mochaInfo.hasAssets) {
      warnings.push({
        code: "MOCHA_ASSETS",
        severity: "info",
        message:
          "Your app references files stored in Mocha's R2 storage (public_asset_links.json). " +
          "These links will stop working after Mocha shuts down.",
        suggestion:
          "Download and re-upload the assets from public_asset_links.json to your own storage before Mocha shuts down.",
      });
    }

    // Inject env vars from the Mocha .env into the detected list
    for (const [key, value] of Object.entries(mochaInfo.envVarsFromExport)) {
      const alreadyPresent = envVars.some((v) => v.key === key);
      if (!alreadyPresent) {
        envVars.push({
          key,
          source: ".env (Mocha export)",
          required: true,
          value: null, // never pre-fill from export
          sensitive: isSensitiveKey(key),
        });
      }
    }
  }

  const status =
    warnings.some((w) => w.severity === "error") ? "warning" : "success";

  // Mocha exports are always deployable (frontend is a known React/Vite app even if framework
  // detection returns "unknown" due to stripped config files)
  const deployable =
    (framework.name !== "unknown" || mochaInfo?.isMochaExport === true) &&
    framework.name !== "python" &&
    framework.name !== "docker" &&
    !warnings.some((w) => w.severity === "error" && w.code !== "ENV_FILE_DETECTED" && w.code !== "MOCHA_FRONTEND_ONLY" && w.code !== "MOCHA_D1_DATABASE" && w.code !== "MOCHA_AUTH" && w.code !== "MOCHA_ASSETS");

  return {
    jobId,
    status,
    framework: {
      name: framework.name,
      version: framework.version,
      confidence: framework.confidence,
    },
    buildCommand: framework.buildCommand,
    outputDirectory: framework.outputDirectory,
    installCommand: framework.installCommand,
    nodeVersion: framework.nodeVersion,
    envVars,
    warnings,
    fileCount: files.size,
    totalSize: getTotalSize(files),
    hasBackend: backend.hasBackend,
    backendType: backend.backendType,
    databaseDetected: backend.databaseDetected,
    deployable,
    suggestedFixes,
    isMochaExport: mochaInfo?.isMochaExport ?? false,
    mochaAppName: mochaInfo?.appName ?? null,
  };
}

function isSensitiveKey(key: string): boolean {
  return /secret|password|token|key|auth|credential|private|jwt/i.test(key);
}

function getTotalSize(files: FileMap): number {
  let total = 0;
  for (const content of files.values()) {
    total += Buffer.byteLength(content, "utf8");
  }
  return total;
}

export type { EnvVar };
