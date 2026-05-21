import type { AnalysisResult } from "@/lib/analyzer";

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
  static: "Static Site",
  node: "Node.js",
  python: "Python",
  docker: "Docker",
  unknown: "Unknown",
};

const FRAMEWORK_COLORS: Record<string, string> = {
  nextjs: "bg-black text-white",
  "react-vite": "bg-cyan-900 text-cyan-200",
  "react-cra": "bg-cyan-900 text-cyan-200",
  react: "bg-cyan-900 text-cyan-200",
  vue: "bg-emerald-900 text-emerald-200",
  "vue-vite": "bg-emerald-900 text-emerald-200",
  sveltekit: "bg-orange-900 text-orange-200",
  astro: "bg-purple-900 text-purple-200",
  nuxt: "bg-emerald-900 text-emerald-200",
  angular: "bg-red-900 text-red-200",
  static: "bg-slate-700 text-slate-200",
  vite: "bg-yellow-900 text-yellow-200",
  node: "bg-green-900 text-green-200",
};

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-blue-950/50 border-blue-800 text-blue-300",
  warning: "bg-yellow-950/50 border-yellow-800 text-yellow-300",
  error: "bg-red-950/50 border-red-800 text-red-300",
};

const SEVERITY_ICONS: Record<string, string> = {
  info: "ℹ",
  warning: "⚠",
  error: "✕",
};

interface Props {
  result: AnalysisResult;
}

export function AnalysisReport({ result }: Props) {
  const frameworkLabel =
    FRAMEWORK_LABELS[result.framework.name] ?? result.framework.name;
  const frameworkColor =
    FRAMEWORK_COLORS[result.framework.name] ?? "bg-slate-700 text-slate-200";

  const confidencePercent = Math.round(result.framework.confidence * 100);

  return (
    <div className="space-y-6">
      {/* Framework Summary */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
          Detected Framework
        </h2>
        <div className="flex items-center gap-4 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${frameworkColor}`}
          >
            {frameworkLabel}
            {result.framework.version && (
              <span className="ml-2 opacity-70">v{result.framework.version}</span>
            )}
          </span>
          <span className="text-sm text-slate-400">
            {confidencePercent}% confidence
          </span>
        </div>

        {/* Build info */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {result.buildCommand && (
            <InfoCell label="Build Command" value={result.buildCommand} />
          )}
          {result.outputDirectory && (
            <InfoCell label="Output Dir" value={result.outputDirectory} />
          )}
          {result.installCommand && (
            <InfoCell label="Install" value={result.installCommand} />
          )}
          {result.nodeVersion && (
            <InfoCell label="Node Version" value={result.nodeVersion} />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Files" value={result.fileCount.toLocaleString()} />
        <StatCard
          label="Total Size"
          value={formatBytes(result.totalSize)}
        />
        <StatCard
          label="Backend"
          value={result.hasBackend ? result.backendType ?? "Yes" : "No"}
        />
        <StatCard
          label="Database"
          value={result.databaseDetected ?? "None"}
        />
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Warnings ({result.warnings.length})
          </h2>
          <div className="space-y-2">
            {result.warnings.map((warning, i) => (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 ${SEVERITY_STYLES[warning.severity]}`}
              >
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">
                    {SEVERITY_ICONS[warning.severity]}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{warning.message}</p>
                    <p className="text-xs opacity-75 mt-1">{warning.suggestion}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Env vars summary */}
      {result.envVars.length > 0 && (
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Environment Variables ({result.envVars.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {result.envVars.map((envVar) => (
              <span
                key={envVar.key}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono ${
                  envVar.sensitive
                    ? "bg-amber-950/50 text-amber-300 border border-amber-800/50"
                    : "bg-slate-700 text-slate-300"
                }`}
              >
                {envVar.sensitive && (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {envVar.key}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Sensitive keys (with lock icon) will be stored as secrets.
          </p>
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-700/50 px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-mono text-slate-200 truncate">{value}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700 px-4 py-3">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-white mt-1 capitalize">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
