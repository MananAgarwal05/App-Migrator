"use client";

import { useEffect, useState } from "react";
import { UrlDisplay } from "./url-display";

const STEPS = [
  { key: "ANALYZING", label: "Analyzing project" },
  { key: "CREATING_REPO", label: "Creating GitHub repo" },
  { key: "PUSHING_CODE", label: "Pushing code" },
  { key: "CREATING_PROJECT", label: "Creating Vercel project" },
  { key: "DEPLOYING", label: "Building & deploying" },
  { key: "LIVE", label: "Live!" },
];

interface StepInfo {
  name: string;
  status: "complete" | "in-progress" | "pending" | "failed";
  githubUrl?: string;
  completedAt?: string;
}

interface StatusResponse {
  jobId: string;
  status: string;
  currentStep: string | null;
  steps: StepInfo[];
  url: string | null;
  githubUrl: string | null;
  error: string | null;
  buildLogs: string | null;
  updatedAt: string;
}

interface Props {
  jobId: string;
  onRetry?: () => void;
}

export function DeployProgress({ jobId, onRetry }: Props) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/deploy/${jobId}/status`);
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          setError(err.error ?? "Failed to fetch status");
          return;
        }
        const json = (await res.json()) as StatusResponse;
        setData(json);

        // Stop polling when terminal
        if (json.status === "LIVE" || json.status === "FAILED") {
          clearInterval(interval);
        }
      } catch {
        setError("Network error while polling status");
        clearInterval(interval);
      }
    };

    poll();
    interval = setInterval(poll, 3000);

    return () => clearInterval(interval);
  }, [jobId]);

  if (error) {
    return (
      <div className="rounded-xl bg-red-950/50 border border-red-800 p-6 text-center">
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="h-6 w-6 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="ml-3 text-slate-400">Loading...</span>
      </div>
    );
  }

  const isSuccess = data.status === "LIVE";
  const isFailed = data.status === "FAILED";

  return (
    <div className="space-y-8">
      {/* Steps */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-6">
          Deployment Progress
        </h2>
        <div className="space-y-4">
          {STEPS.map((step) => {
            const stepData = data.steps?.find((s) => s.name === step.key);
            const status = stepData?.status ?? "pending";

            return (
              <div key={step.key} className="flex items-center gap-4">
                <StepIcon status={status} />
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-sm font-medium ${
                      status === "complete"
                        ? "text-green-400"
                        : status === "in-progress"
                        ? "text-blue-400"
                        : status === "failed"
                        ? "text-red-400"
                        : "text-slate-500"
                    }`}
                  >
                    {step.label}
                  </span>
                  {status === "complete" && stepData?.githubUrl && (
                    <a
                      href={stepData.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-3 text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      View repo
                    </a>
                  )}
                </div>
                {status === "in-progress" && (
                  <svg
                    className="h-4 w-4 shrink-0 animate-spin text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Success */}
      {isSuccess && data.url && (
        <div className="rounded-xl bg-green-950/30 border border-green-800 p-6 space-y-4">
          <div className="flex items-center gap-2 text-green-400">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <h3 className="font-semibold">Your app is live!</h3>
          </div>

          <UrlDisplay url={data.url} />

          {data.githubUrl && (
            <a
              href={data.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              GitHub Repository
            </a>
          )}

          <div className="pt-2 border-t border-slate-700">
            <p className="text-sm text-slate-400">
              Want to convert this to a mobile app?{" "}
              <a
                href="https://webtonative.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                Try WebToNative →
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Failure */}
      {isFailed && (
        <div className="rounded-xl bg-red-950/30 border border-red-800 p-6 space-y-4">
          <div className="flex items-center gap-2 text-red-400">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <h3 className="font-semibold">Deployment failed</h3>
          </div>

          {data.error && (
            <p className="text-sm text-red-300">{data.error}</p>
          )}

          {data.buildLogs && (
            <details className="mt-2">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-200">
                View build logs
              </summary>
              <pre className="mt-2 rounded-lg bg-slate-900 p-4 text-xs font-mono text-slate-300 overflow-auto max-h-64 whitespace-pre-wrap">
                {data.buildLogs}
              </pre>
            </details>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 transition-colors"
            >
              Retry Deployment
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <div className="h-6 w-6 rounded-full bg-green-600 flex items-center justify-center shrink-0">
        <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }

  if (status === "in-progress") {
    return (
      <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
        <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="h-6 w-6 rounded-full bg-red-600 flex items-center justify-center shrink-0">
        <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="h-6 w-6 rounded-full border-2 border-slate-600 flex items-center justify-center shrink-0" />
  );
}
