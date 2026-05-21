import Link from "next/link";

const STATUS_STYLES: Record<string, string> = {
  LIVE: "bg-green-950/50 border-green-800 text-green-400",
  FAILED: "bg-red-950/50 border-red-800 text-red-400",
  DEPLOYING: "bg-blue-950/50 border-blue-800 text-blue-400",
  BUILDING: "bg-blue-950/50 border-blue-800 text-blue-400",
  CREATING_PROJECT: "bg-blue-950/50 border-blue-800 text-blue-400",
  PUSHING_CODE: "bg-blue-950/50 border-blue-800 text-blue-400",
  CREATING_REPO: "bg-blue-950/50 border-blue-800 text-blue-400",
  ANALYZING: "bg-yellow-950/50 border-yellow-800 text-yellow-400",
  ANALYZED: "bg-yellow-950/50 border-yellow-800 text-yellow-400",
  UPLOADED: "bg-slate-800 border-slate-700 text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  LIVE: "Live",
  FAILED: "Failed",
  DEPLOYING: "Building",
  BUILDING: "Building",
  CREATING_PROJECT: "In Progress",
  PUSHING_CODE: "In Progress",
  CREATING_REPO: "In Progress",
  ANALYZING: "Analyzing",
  ANALYZED: "Ready",
  UPLOADED: "Uploaded",
};

const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: "Next.js",
  "react-vite": "React + Vite",
  "react-cra": "React (CRA)",
  react: "React",
  vue: "Vue",
  "vue-vite": "Vue + Vite",
  sveltekit: "SvelteKit",
  astro: "Astro",
  nuxt: "Nuxt",
  angular: "Angular",
  vite: "Vite",
  static: "Static",
  node: "Node.js",
};

interface DeploymentCardProps {
  id: string;
  originalFilename: string;
  framework: string | null;
  status: string;
  vercelUrl: string | null;
  githubRepoUrl: string | null;
  createdAt: Date;
}

export function DeploymentCard({
  id,
  originalFilename,
  framework,
  status,
  vercelUrl,
  githubRepoUrl,
  createdAt,
}: DeploymentCardProps) {
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.UPLOADED;
  const statusLabel = STATUS_LABELS[status] ?? status;
  const frameworkLabel = framework
    ? (FRAMEWORK_LABELS[framework] ?? framework)
    : "Unknown";

  const isInProgress =
    !["LIVE", "FAILED", "ANALYZED", "UPLOADED"].includes(status);

  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-5 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white truncate">
            {originalFilename.replace(/\.zip$/i, "")}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {framework && (
              <span className="text-xs text-slate-400">{frameworkLabel}</span>
            )}
            <span className="text-xs text-slate-600">·</span>
            <time className="text-xs text-slate-500" dateTime={createdAt.toISOString()}>
              {formatDate(createdAt)}
            </time>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle}`}
        >
          {isInProgress && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          )}
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        {status === "LIVE" && vercelUrl ? (
          <a
            href={vercelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors font-mono truncate max-w-[200px]"
          >
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {vercelUrl.replace("https://", "")}
          </a>
        ) : (
          <Link
            href={`/deploy/${id}`}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            View progress →
          </Link>
        )}

        {githubRepoUrl && (
          <a
            href={githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            Repo
          </a>
        )}
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}
