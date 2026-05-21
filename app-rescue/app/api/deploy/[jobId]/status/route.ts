import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const STEP_ORDER = [
  "ANALYZING",
  "ANALYZED",
  "CREATING_REPO",
  "PUSHING_CODE",
  "CREATING_PROJECT",
  "DEPLOYING",
  "LIVE",
];

type StepStatus = "complete" | "in-progress" | "pending" | "failed";

interface StepInfo {
  name: string;
  status: StepStatus;
  githubUrl?: string;
  completedAt?: string;
}

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
      return Response.json({ error: "Deployment not found" }, { status: 404 });
    }

    const currentStepIndex = STEP_ORDER.indexOf(deployment.status);

    const steps: StepInfo[] = STEP_ORDER.map((step, index) => {
      let stepStatus: StepStatus;

      if (deployment.status === "FAILED" && deployment.currentStep === step) {
        stepStatus = "failed";
      } else if (deployment.status === "FAILED" && index < currentStepIndex) {
        stepStatus = "complete";
      } else if (index < currentStepIndex) {
        stepStatus = "complete";
      } else if (index === currentStepIndex) {
        stepStatus = deployment.status === "LIVE" ? "complete" : "in-progress";
      } else {
        stepStatus = "pending";
      }

      const info: StepInfo = {
        name: step,
        status: stepStatus,
      };

      if (step === "CREATING_REPO" && deployment.githubRepoUrl) {
        info.githubUrl = deployment.githubRepoUrl;
        if (stepStatus === "complete") {
          info.completedAt = deployment.updatedAt.toISOString();
        }
      }

      return info;
    });

    return Response.json({
      jobId,
      status: deployment.status,
      currentStep: deployment.currentStep,
      steps,
      url: deployment.vercelUrl,
      githubUrl: deployment.githubRepoUrl,
      error: deployment.error,
      buildLogs: deployment.buildLogs,
      updatedAt: deployment.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("Status fetch error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
