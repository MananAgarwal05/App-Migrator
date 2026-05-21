import { createHash } from "crypto";

const VERCEL_API = "https://api.vercel.com";

export interface DeployFilesResult {
  deploymentId: string;
  deploymentUrl: string;
}

export async function deployFiles(
  token: string,
  projectId: string,
  projectName: string,
  fileMap: Map<string, Buffer | string>
): Promise<DeployFilesResult> {
  // Build file list with SHA1 hashes
  const files: Array<{ file: string; sha: string; size: number; buf: Buffer }> = [];
  for (const [filePath, content] of fileMap) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const sha = createHash("sha1").update(buf).digest("hex");
    files.push({ file: filePath, sha, size: buf.length, buf });
  }

  // Upload files in batches of 20
  const BATCH = 20;
  for (let i = 0; i < files.length; i += BATCH) {
    await Promise.all(
      files.slice(i, i + BATCH).map(async ({ sha, size, buf }) => {
        const res = await fetch(`${VERCEL_API}/v2/files`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
            "x-now-digest": sha,
            "Content-Length": String(size),
          },
          body: buf,
        });
        // 200 = already cached, 201 = newly uploaded — both fine
        if (!res.ok && res.status !== 200 && res.status !== 201) {
          throw new Error(`File upload failed: ${res.status} ${await res.text()}`);
        }
      })
    );
  }

  // Create deployment with uploaded file list
  const res = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      files: files.map(({ file, sha, size }) => ({ file, sha, size })),
      projectId,
      target: "production",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create Vercel deployment: ${res.status} ${errorText}`);
  }

  const deployment = (await res.json()) as { id: string; url: string; alias?: string[] };
  return {
    deploymentId: deployment.id,
    deploymentUrl: deployment.alias?.[0]
      ? `https://${deployment.alias[0]}`
      : `https://${deployment.url}`,
  };
}
