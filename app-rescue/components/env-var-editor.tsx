"use client";

import { useState } from "react";
import type { EnvVar } from "@/lib/analyzer";

interface Props {
  envVars: EnvVar[];
  onSubmit: (values: Record<string, string>) => void;
  isSubmitting?: boolean;
}

export function EnvVarEditor({ envVars, onSubmit, isSubmitting }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of envVars) {
      initial[v.key] = v.value ?? "";
    }
    return initial;
  });

  const [showSensitive, setShowSensitive] = useState<Set<string>>(new Set());

  const toggleSensitive = (key: string) => {
    setShowSensitive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value.trim()) filtered[key] = value.trim();
    }
    onSubmit(filtered);
  };

  if (envVars.length === 0) {
    return (
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6 text-center">
        <p className="text-slate-400 text-sm">
          No environment variables detected in this project.
        </p>
        <button
          type="button"
          onClick={() => onSubmit({})}
          disabled={isSubmitting}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? "Starting..." : "Deploy Now"}
        </button>
      </div>
    );
  }

  const required = envVars.filter((v) => v.required);
  const optional = envVars.filter((v) => !v.required);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {required.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Required Variables
          </h3>
          <div className="space-y-3">
            {required.map((envVar) => (
              <EnvVarRow
                key={envVar.key}
                envVar={envVar}
                value={values[envVar.key] ?? ""}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [envVar.key]: v }))
                }
                showValue={showSensitive.has(envVar.key)}
                onToggleShow={() => toggleSensitive(envVar.key)}
              />
            ))}
          </div>
        </section>
      )}

      {optional.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Optional Variables
          </h3>
          <div className="space-y-3">
            {optional.map((envVar) => (
              <EnvVarRow
                key={envVar.key}
                envVar={envVar}
                value={values[envVar.key] ?? ""}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [envVar.key]: v }))
                }
                showValue={showSensitive.has(envVar.key)}
                onToggleShow={() => toggleSensitive(envVar.key)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Deploying...
            </>
          ) : (
            "Deploy Now"
          )}
        </button>
      </div>
    </form>
  );
}

interface EnvVarRowProps {
  envVar: EnvVar;
  value: string;
  onChange: (v: string) => void;
  showValue: boolean;
  onToggleShow: () => void;
}

function EnvVarRow({
  envVar,
  value,
  onChange,
  showValue,
  onToggleShow,
}: EnvVarRowProps) {
  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-slate-100">{envVar.key}</code>
          {envVar.sensitive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/50 border border-amber-800/50 px-2 py-0.5 text-xs text-amber-400">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z"
                  clipRule="evenodd"
                />
              </svg>
              sensitive
            </span>
          )}
          {envVar.required && (
            <span className="rounded-full bg-red-950/50 border border-red-800/50 px-2 py-0.5 text-xs text-red-400">
              required
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">{envVar.source}</span>
      </div>

      <div className="relative">
        <input
          type={envVar.sensitive && !showValue ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={envVar.required ? "Required — enter value" : "Optional"}
          className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 pr-10"
        />
        {envVar.sensitive && (
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {showValue ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
