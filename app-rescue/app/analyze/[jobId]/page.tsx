"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnalysisReport } from "@/components/analysis-report";
import { EnvVarEditor } from "@/components/env-var-editor";
import type { AnalysisResult } from "@/lib/analyzer";

type PageState =
  | { phase: "loading" }
  | { phase: "analyzing" }
  | { phase: "ready"; result: AnalysisResult }
  | { phase: "unsupported"; result: AnalysisResult }
  | { phase: "error"; message: string };

export default function AnalyzePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [isDeploying, setIsDeploying] = useState(false);
  const [targetDbUrl, setTargetDbUrl] = useState("");

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze/${jobId}`);
      const data = (await res.json()) as AnalysisResult & {
        status?: string;
        error?: string;
        message?: string;
      };

      if (res.status === 202) {
        setState({ phase: "analyzing" });
        return false; // keep polling
      }

      if (!res.ok) {
        setState({ phase: "error", message: data.error ?? "Analysis failed" });
        return true;
      }

      if (data.status === "unsupported") {
        setState({ phase: "unsupported", result: data as AnalysisResult });
      } else {
        setState({ phase: "ready", result: data as AnalysisResult });
      }
      return true; // done
    } catch {
      setState({ phase: "error", message: "Network error" });
      return true;
    }
  }, [jobId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const run = async () => {
      const done = await poll();
      if (!done) {
        timer = setTimeout(run, 2000);
      }
    };

    run();
    return () => clearTimeout(timer);
  }, [poll]);

  const handleDeploy = async (envVars: Record<string, string>) => {
    setIsDeploying(true);
    try {
      const res = await fetch(`/api/deploy/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          envVars,
          ...(targetDbUrl.trim() ? { targetDbUrl: targetDbUrl.trim() } : {}),
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/auth/signin?callbackUrl=/analyze/${jobId}`);
          return;
        }
        setState({ phase: "error", message: data.error ?? "Deploy failed" });
        return;
      }

      router.push(`/deploy/${jobId}`);
    } catch {
      setState({ phase: "error", message: "Network error while starting deployment" });
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Analysis Results</h1>
        <p className="text-sm text-slate-400 mt-1">Job ID: <code className="font-mono text-slate-300">{jobId}</code></p>
      </div>

      {state.phase === "loading" || state.phase === "analyzing" ? (
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-12 text-center">
          <svg className="mx-auto h-8 w-8 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-4 text-slate-300 font-medium">Analyzing your project...</p>
          <p className="mt-1 text-sm text-slate-500">Detecting framework, scanning env vars, checking dependencies</p>
        </div>
      ) : state.phase === "error" ? (
        <div className="rounded-xl bg-red-950/50 border border-red-800 p-6">
          <p className="text-red-300 font-medium">Analysis failed</p>
          <p className="mt-1 text-sm text-red-400">{state.message}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Try another file
          </button>
        </div>
      ) : state.phase === "unsupported" ? (
        <div className="space-y-6">
          <AnalysisReport result={state.result} />
          <div className="rounded-xl bg-amber-950/50 border border-amber-800 p-6">
            <p className="text-amber-300 font-medium">Project type not supported</p>
            <p className="mt-1 text-sm text-amber-400">
              This project type cannot be automatically deployed. See warnings above for details.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 text-sm text-slate-400 hover:text-white transition-colors"
            >
              ← Upload a different project
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <AnalysisReport result={state.result} />

          {state.result.isMochaExport && state.result.databaseDetected && (
            <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">
                Migrate Database
              </h2>
              <p className="text-sm text-slate-400 mb-4">
                Your Mocha app has a Cloudflare D1 (SQLite) database. Paste a PostgreSQL URL
                (e.g. Neon or Supabase) to migrate the schema and data automatically.
                Leave blank to skip — the app will deploy without a database.
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Target Database URL
                  <span className="ml-2 font-normal normal-case text-slate-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={targetDbUrl}
                  onChange={(e) => setTargetDbUrl(e.target.value)}
                  placeholder="postgres://user:password@host/dbname"
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-slate-500">
                  Supported: PostgreSQL (Neon, Supabase, Railway, etc.).
                  MongoDB and MySQL URLs are accepted and will be set as an env var, but data won&apos;t be migrated automatically.
                </p>
              </div>
            </div>
          )}

          {state.result.deployable && (
            <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-2">
                Configure &amp; Deploy
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                {state.result.envVars.length > 0
                  ? "Fill in the required environment variables, then click Deploy."
                  : "No environment variables needed. Click Deploy to continue."}
              </p>
              <EnvVarEditor
                envVars={state.result.envVars}
                onSubmit={handleDeploy}
                isSubmitting={isDeploying}
              />
            </div>
          )}

          {!state.result.deployable && (
            <div className="rounded-xl bg-amber-950/50 border border-amber-800 p-6">
              <p className="text-amber-300 font-medium">Cannot deploy</p>
              <p className="mt-1 text-sm text-amber-400">
                Resolve the errors above before deploying.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
