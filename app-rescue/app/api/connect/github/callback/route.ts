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
  const storedState = cookieStore.get("connect_github_state")?.value;
  cookieStore.delete("connect_github_state");

  if (!code || !state || !storedState) redirect("/?connect_error=github");

  const [nonce, storedHmac] = storedState.split(".");
  const expectedHmac = createHmac("sha256", process.env.AUTH_SECRET!).update(nonce).digest("hex");
  if (state !== nonce || storedHmac !== expectedHmac) redirect("/?connect_error=github");

  const redirectUri = `${origin}/api/connect/github/callback`;

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GITHUB_ID!,
      client_secret: process.env.AUTH_GITHUB_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) redirect("/?connect_error=github");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "app-rescue" },
  });
  const githubUser = await userRes.json();

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      githubId: String(githubUser.id),
      githubToken: encrypt(tokenData.access_token),
    },
  });

  redirect("/");
}
