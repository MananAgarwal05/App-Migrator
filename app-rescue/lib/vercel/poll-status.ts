const VERCEL_API = "https://api.vercel.com";

export type VercelDeploymentState =
  | "QUEUED"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED";

export interface DeploymentStatus {
  state: VercelDeploymentState;
  url: string | null;
  buildLogs: string | null;
  uiState: "pending" | "building" | "success" | "failed" | "canceled";
  uiMessage: string;
}

const STATE_MAP: Record<
  VercelDeploymentState,
  { uiState: DeploymentStatus["uiState"]; uiMessage: string }
> = {
  QUEUED: { uiState: "pending", uiMessage: "Waiting in build queue..." },
  BUILDING: { uiState: "building", uiMessage: "Building your app..." },
  READY: { uiState: "success", uiMessage: "Your app is live!" },
  ERROR: { uiState: "failed", uiMessage: "Build failed. Check logs." },
  CANCELED: { uiState: "canceled", uiMessage: "Deployment was canceled." },
};

interface VercelDeploymentResponse {
  id: string;
  state: string;
  url: string;
  alias?: string[];
  readyState?: string;
}

export async function pollDeploymentStatus(
  token: string,
  deploymentId: string
): Promise<DeploymentStatus> {
  const res = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch deployment status: ${res.status}`);
  }

  const deployment = (await res.json()) as VercelDeploymentResponse;
  const state = (deployment.readyState ?? deployment.state ?? "QUEUED").toUpperCase() as VercelDeploymentState;
  const mapped = STATE_MAP[state] ?? STATE_MAP.QUEUED;

  const deploymentUrl = deployment.alias?.[0]
    ? `https://${deployment.alias[0]}`
    : deployment.url
    ? `https://${deployment.url}`
    : null;

  let buildLogs: string | null = null;

  // Fetch build logs on failure
  if (state === "ERROR") {
    try {
      const logsRes = await fetch(
        `${VERCEL_API}/v6/deployments/${deploymentId}/events`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (logsRes.ok) {
        const events = (await logsRes.json()) as Array<{
          type?: string;
          payload?: { text?: string };
        }>;
        buildLogs = events
          .filter((e) => e.type === "stdout" || e.type === "stderr")
          .map((e) => e.payload?.text ?? "")
          .join("\n")
          .slice(0, 10000); // limit to 10KB
      }
    } catch {
      // Non-critical
    }
  }

  return {
    state,
    url: deploymentUrl,
    buildLogs,
    uiState: mapped.uiState,
    uiMessage: mapped.uiMessage,
  };
}

/**
 * Poll until deployment reaches a terminal state.
 * Returns the final status.
 */
export async function waitForDeployment(
  token: string,
  deploymentId: string,
  maxAttempts = 60,
  intervalMs = 5000
): Promise<DeploymentStatus> {
  const TERMINAL_STATES = new Set<VercelDeploymentState>([
    "READY",
    "ERROR",
    "CANCELED",
  ]);

  for (let i = 0; i < maxAttempts; i++) {
    const status = await pollDeploymentStatus(token, deploymentId);
    if (TERMINAL_STATES.has(status.state)) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    state: "ERROR",
    url: null,
    buildLogs: "Deployment timed out after waiting too long.",
    uiState: "failed",
    uiMessage: "Deployment timed out.",
  };
}
