import { Octokit } from "octokit";

type FileMap = Map<string, Buffer | string>;

// Files that should never be pushed
const EXCLUDED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
]);

function shouldExclude(path: string): boolean {
  const filename = path.split("/").pop() ?? path;
  if (EXCLUDED_FILES.has(filename)) return true;
  if (filename.startsWith(".env.") && !filename.endsWith(".example")) {
    return true;
  }
  return false;
}

export async function pushCode(
  token: string,
  owner: string,
  repo: string,
  files: FileMap,
  defaultBranch: string = "main"
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  // Get latest commit SHA
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });

  const baseSha = ref.object.sha;

  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });

  // Filter files and create blobs
  const treeItems: Array<{
    path: string;
    mode: "100644" | "100755" | "040000" | "160000" | "120000";
    type: "blob" | "tree" | "commit";
    sha: string;
  }> = [];

  const filteredFiles: [string, Buffer | string][] = [];
  for (const [path, content] of files) {
    if (!shouldExclude(path)) {
      filteredFiles.push([path, content]);
    }
  }

  // Create blobs in batches to avoid rate limiting
  const BATCH_SIZE = 20;
  for (let i = 0; i < filteredFiles.length; i += BATCH_SIZE) {
    const batch = filteredFiles.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ([path, content]) => {
        const isBinary =
          content instanceof Buffer &&
          isBinaryContent(content);

        let blobContent: string;
        let encoding: "base64" | "utf-8";

        if (content instanceof Buffer) {
          blobContent = content.toString("base64");
          encoding = "base64";
        } else {
          // Check if it looks like it might have non-UTF-8 chars
          blobContent = content as string;
          encoding = "utf-8";
        }

        try {
          const { data: blob } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content: isBinary
              ? (content as Buffer).toString("base64")
              : blobContent,
            encoding: isBinary ? "base64" : encoding,
          });

          treeItems.push({
            path,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          });
        } catch {
          // Skip files that fail (e.g., binary files that are too large)
        }
      })
    );
  }

  if (treeItems.length === 0) {
    throw new Error("No files to push after filtering");
  }

  // Create tree
  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: treeItems,
  });

  // Create commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: "feat: initial deployment via AppRescue",
    tree: tree.sha,
    parents: [baseSha],
  });

  // Update branch ref
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
    sha: newCommit.sha,
    force: true,
  });
}

function isBinaryContent(buffer: Buffer): boolean {
  // Check first 512 bytes for null bytes (a common binary indicator)
  const sampleSize = Math.min(512, buffer.length);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}
