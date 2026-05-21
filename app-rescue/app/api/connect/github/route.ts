import { auth } from "@/auth";
import { randomBytes, createHmac } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const base = new URL(request.url).origin;
  const redirectUri = `${base}/api/connect/github/callback`;

  const state = randomBytes(16).toString("hex");
  const hmac = createHmac("sha256", process.env.AUTH_SECRET!).update(state).digest("hex");

  const cookieStore = await cookies();
  cookieStore.set("connect_github_state", `${state}.${hmac}`, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.AUTH_GITHUB_ID!,
    redirect_uri: redirectUri,
    scope: "repo read:user user:email",
    state,
  });

  redirect(`https://github.com/login/oauth/authorize?${params}`);
}
