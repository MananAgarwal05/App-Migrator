const VERCEL_API = "https://api.vercel.com";

const SENSITIVE_PATTERNS = [
  /secret/i,
  /password/i,
  /token/i,
  /key/i,
  /auth/i,
  /credential/i,
  /private/i,
  /jwt/i,
];

function isSensitive(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

export async function setEnvVars(
  token: string,
  projectId: string,
  envVars: Record<string, string>
): Promise<void> {
  const entries = Object.entries(envVars).filter(([, v]) => v !== undefined && v !== "");

  if (entries.length === 0) return;

  // Vercel accepts an array of env vars
  const payload = entries.map(([key, value]) => ({
    key,
    value,
    target: ["production", "preview", "development"],
    type: isSensitive(key) ? "secret" : "plain",
  }));

  const res = await fetch(`${VERCEL_API}/v10/projects/${projectId}/env`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to set env vars on Vercel: ${res.status} ${errorText}`);
  }
}
