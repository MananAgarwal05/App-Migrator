import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { encrypt } from "@/lib/encryption";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { envVars: Record<string, string> };
    const { envVars } = body;

    if (!envVars || typeof envVars !== "object") {
      return Response.json({ error: "envVars must be an object" }, { status: 400 });
    }

    const deployment = await prisma.deployment.findUnique({
      where: { id: jobId },
    });

    if (!deployment) {
      return Response.json({ error: "Deployment not found" }, { status: 404 });
    }

    // Encrypt and store env vars
    const encryptedEnvVars = encrypt(JSON.stringify(envVars));

    await prisma.deployment.update({
      where: { id: jobId },
      data: { envVars: encryptedEnvVars },
    });

    return Response.json({ jobId, message: "Environment variables updated" });
  } catch (err) {
    console.error("Env update error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}
