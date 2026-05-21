import { NextRequest } from "next/server";
import AdmZip from "adm-zip";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { validateZip } from "@/lib/analyzer/validate-zip";
import { analyzeProject, type FileMap } from "@/lib/analyzer";
import { detectMochaExport, remapMochaFiles } from "@/lib/mocha/detect";
import { transformMochaFiles } from "@/lib/mocha/transform";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json(
        { error: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".zip")) {
      return Response.json(
        { error: "Only ZIP files are accepted" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: `File exceeds maximum size of 500 MB` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate ZIP security
    const validation = validateZip(buffer);
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    const jobId = randomUUID();
    const tmpDir = path.join("/tmp", jobId);
    await mkdir(tmpDir, { recursive: true });

    // Save ZIP to disk
    const zipPath = path.join(tmpDir, "upload.zip");
    await writeFile(zipPath, buffer);

    // Extract ZIP and build raw file map (text files only)
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let files: FileMap = new Map();
    const topFolder = detectTopLevelFolder(entries.map((e) => e.entryName));

    for (const entry of entries) {
      if (!entry.isDirectory) {
        try {
          const entryName = stripTopFolder(entry.entryName, topFolder);
          const content = entry.getData().toString("utf8");
          files.set(entryName, content);
        } catch {
          // Skip binary files for the text map
        }
      }
    }

    // Detect and handle Mocha exports
    const mochaInfo = detectMochaExport(files);
    if (mochaInfo.isMochaExport) {
      // Remap code/* → * and strip non-code metadata files
      files = remapMochaFiles(files);
      // Strip Cloudflare/Mocha-specific build tooling so Vercel can build it
      files = transformMochaFiles(files);
    }

    // Create deployment record
    const deployment = await prisma.deployment.create({
      data: {
        id: jobId,
        originalFilename: file.name,
        zipPath: zipPath,
        status: "ANALYZING",
      },
    });

    // Run analysis asynchronously
    setTimeout(async () => {
      try {
        const result = analyzeProject(jobId, files, mochaInfo);

        await prisma.deployment.update({
          where: { id: jobId },
          data: {
            status: "ANALYZED",
            framework: result.framework.name,
            buildCommand: result.buildCommand,
            outputDir: result.outputDirectory,
            installCommand: result.installCommand,
            nodeVersion: result.nodeVersion,
            analysisResult: JSON.parse(JSON.stringify(result)),
          },
        });
      } catch (err) {
        await prisma.deployment.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : "Analysis failed",
          },
        });
      }
    }, 0);

    return Response.json(
      {
        jobId: deployment.id,
        status: "ANALYZING",
        message: "Upload received. Analyzing project...",
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("Upload error:", err);
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}

function detectTopLevelFolder(entryNames: string[]): string | null {
  const firstSegments = new Set(
    entryNames.map((n) => n.split("/")[0]).filter(Boolean)
  );
  if (firstSegments.size !== 1) return null;
  const folder = [...firstSegments][0];
  // Only treat it as a wrapper folder if at least one entry is nested inside it
  return entryNames.some((n) => n.startsWith(folder + "/")) ? folder : null;
}

function stripTopFolder(entryName: string, topFolder: string | null): string {
  if (!topFolder) return entryName;
  if (entryName.startsWith(topFolder + "/")) {
    return entryName.slice(topFolder.length + 1);
  }
  return entryName;
}
