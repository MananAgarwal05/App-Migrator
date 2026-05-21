"use client";

import { useParams, useRouter } from "next/navigation";
import { DeployProgress } from "@/components/deploy-progress";

export default function DeployPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Deploying Your App</h1>
        <p className="text-sm text-slate-400 mt-1">
          Job ID: <code className="font-mono text-slate-300">{jobId}</code>
        </p>
      </div>

      <DeployProgress
        jobId={jobId}
        onRetry={() => router.push(`/analyze/${jobId}`)}
      />
    </div>
  );
}
