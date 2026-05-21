import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

interface VercelWebhookPayload {
  type: string;
  payload: {
    deployment?: {
      id: string;
      url?: string;
      readyState?: string;
      meta?: Record<string, unknown>;
    };
  };
  createdAt: number;
}

function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  try {
    const hmac = createHmac("sha1", secret);
    hmac.update(body);
    const computed = hmac.digest("hex");
    const sigBuffer = Buffer.from(signature.replace("sha1=", ""), "hex");
    const computedBuffer = Buffer.from(computed, "hex");
    if (sigBuffer.length !== computedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, computedBuffer);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-vercel-signature") ?? "";

  // Verify webhook signature if secret is configured
  const webhookSecret = process.env.VERCEL_WEBHOOK_SECRET;
  if (webhookSecret && signature) {
    if (!verifyWebhookSignature(body, signature, webhookSecret)) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: VercelWebhookPayload;
  try {
    payload = JSON.parse(body) as VercelWebhookPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, payload: eventPayload } = payload;

  // Handle deployment status updates
  if (type.startsWith("deployment.")) {
    const deployment = eventPayload.deployment;
    if (!deployment?.id) {
      return Response.json({ received: true });
    }

    const vercelDeployId = deployment.id;
    const readyState = deployment.readyState?.toUpperCase();

    // Find our deployment by vercel deploy ID
    const dbDeployment = await prisma.deployment.findFirst({
      where: { vercelDeployId },
    });

    if (!dbDeployment) {
      return Response.json({ received: true });
    }

    if (readyState === "READY" || type === "deployment.succeeded") {
      await prisma.deployment.update({
        where: { id: dbDeployment.id },
        data: {
          status: "LIVE",
          vercelUrl: deployment.url ? `https://${deployment.url}` : null,
        },
      });
    } else if (
      readyState === "ERROR" ||
      type === "deployment.error" ||
      type === "deployment.canceled"
    ) {
      await prisma.deployment.update({
        where: { id: dbDeployment.id },
        data: {
          status: "FAILED",
          error: `Vercel deployment ${type}`,
        },
      });
    }
  }

  return Response.json({ received: true });
}
