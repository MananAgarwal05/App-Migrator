import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("connect_vercel_state")?.value;
  const codeVerifier = cookieStore.get("connect_vercel_pkce")?.value;
  cookieStore.delete("connect_vercel_state");
  cookieStore.delete("connect_vercel_pkce");

  if (!code || !state || !storedState || !codeVerifier) redirect("/");

  const [nonce, storedHmac] = storedState.split(".");
  const expectedHmac = createHmac("sha256", process.env.AUTH_SECRET!).update(nonce).digest("hex");
  if (state !== nonce || storedHmac !== expectedHmac) redirect("/");

  const redirectUri = `${origin}/api/connect/vercel/callback`;

  const tokenRes = await fetch("https://api.vercel.com/login/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_VERCEL_ID!,
      client_secret: process.env.AUTH_VERCEL_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error("[connect/vercel/callback] token error →", tokenData);
    redirect("/");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { vercelToken: encrypt(tokenData.access_token) },
  });

  redirect("/");
}
