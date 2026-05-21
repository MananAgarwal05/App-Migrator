import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: jobId },
    });

    if (!deployment) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    if (deployment.status === "ANALYZING") {
      return Response.json(
        {
          jobId,
          status: "ANALYZING",
          message: "Analysis in progress...",
        },
        { status: 202 }
      );
    }

    if (deployment.status === "FAILED" && !deployment.analysisResult) {
      return Response.json(
        {
          jobId,
          status: "FAILED",
          error: deployment.error ?? "Analysis failed",
        },
        { status: 500 }
      );
    }

    return Response.json({
      jobId,
      ...(deployment.analysisResult as Record<string, unknown>),
    });
  } catch (err) {
    console.error("Analyze fetch error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
