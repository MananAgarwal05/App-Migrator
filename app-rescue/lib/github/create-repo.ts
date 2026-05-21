import { Octokit } from "octokit";
import { createHash } from "crypto";

const NODE_GITIGNORE = `# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Next.js
.next/
out/

# Production builds
build/
dist/

# Environment files
.env
.env.local
.env.*.local

# Vercel
.vercel

# Misc
.DS_Store
*.pem
Thumbs.db
`;

function sanitizeRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 6);
}

export interface CreateRepoResult {
  repoUrl: string;
  repoName: string;
  fullName: string;
}

export async function createGitHubRepo(
  token: string,
  projectName: string,
  hasGitignore: boolean
): Promise<CreateRepoResult> {
  const octokit = new Octokit({ auth: token });
  const sanitized = sanitizeRepoName(projectName);
  const hash = shortHash(`${sanitized}-${Date.now()}`);
  const repoName = `deployed-${sanitized}-${hash}`;

  // Create the repo
  const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
    name: repoName,
    private: true,
    auto_init: true, // Initialize with a README so we have a base commit
    description: `Deployed via AppRescue — ${projectName}`,
  });

  // If no .gitignore in the project, add the Node.js one
  if (!hasGitignore) {
    // Get the current commit SHA for main/master
    const defaultBranch = repo.default_branch;

    try {
      const { data: ref } = await octokit.rest.git.getRef({
        owner: repo.owner.login,
        repo: repoName,
        ref: `heads/${defaultBranch}`,
      });

      const { data: commit } = await octokit.rest.git.getCommit({
        owner: repo.owner.login,
        repo: repoName,
        commit_sha: ref.object.sha,
      });

      // Create blob for .gitignore
      const { data: blob } = await octokit.rest.git.createBlob({
        owner: repo.owner.login,
        repo: repoName,
        content: Buffer.from(NODE_GITIGNORE).toString("base64"),
        encoding: "base64",
      });

      // Create tree with .gitignore
      const { data: tree } = await octokit.rest.git.createTree({
        owner: repo.owner.login,
        repo: repoName,
        base_tree: commit.tree.sha,
        tree: [
          {
            path: ".gitignore",
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          },
        ],
      });

      // Create commit
      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner: repo.owner.login,
        repo: repoName,
        message: "chore: add .gitignore",
        tree: tree.sha,
        parents: [ref.object.sha],
      });

      // Update ref
      await octokit.rest.git.updateRef({
        owner: repo.owner.login,
        repo: repoName,
        ref: `heads/${defaultBranch}`,
        sha: newCommit.sha,
      });
    } catch {
      // Non-critical — continue even if gitignore creation fails
    }
  }

  return {
    repoUrl: repo.html_url,
    repoName,
    fullName: repo.full_name,
  };
}
