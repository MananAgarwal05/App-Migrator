import { auth } from "@/auth";
import { randomBytes, createHash, createHmac } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const base = new URL(request.url).origin;
  const redirectUri = `${base}/api/connect/vercel/callback`;

  const state = randomBytes(16).toString("hex");
  const hmac = createHmac("sha256", process.env.AUTH_SECRET!).update(state).digest("hex");

  // PKCE — Vercel requires S256 code challenge
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const cookieStore = await cookies();
  cookieStore.set("connect_vercel_state", `${state}.${hmac}`, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("connect_vercel_pkce", codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.AUTH_VERCEL_ID!,
    redirect_uri: redirectUri,
    scope: "openid email profile",
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  redirect(`https://vercel.com/oauth/authorize?${params}`);
}
