const VERCEL_API = "https://api.vercel.com";

export interface TriggerDeployResult {
  deploymentId: string;
  deploymentUrl: string;
}

export async function triggerDeploy(
  token: string,
  projectId: string,
  repoFullName: string,
  branch: string = "main"
): Promise<TriggerDeployResult> {
  const [owner, repo] = repoFullName.split("/");

  const body = {
    name: repo,
    gitSource: {
      type: "github",
      repoId: repoFullName,
      ref: branch,
      org: owner,
      repo: repo,
    },
    target: "production",
  };

  const res = await fetch(`${VERCEL_API}/v13/deployments?projectId=${projectId}&skipAutoDetectionConfirmation=1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to trigger Vercel deployment: ${res.status} ${errorText}`);
  }

  const deployment = (await res.json()) as {
    id: string;
    url: string;
    alias?: string[];
  };

  return {
    deploymentId: deployment.id,
    deploymentUrl: deployment.alias?.[0]
      ? `https://${deployment.alias[0]}`
      : `https://${deployment.url}`,
  };
}
