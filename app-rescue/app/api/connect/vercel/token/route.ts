import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { token } = await request.json();
  if (!token?.trim()) {
    return Response.json({ error: "Token is required" }, { status: 400 });
  }

  // Validate the token against Vercel API
  const res = await fetch("https://api.vercel.com/v2/user", {
    headers: { Authorization: `Bearer ${token.trim()}` },
  });

  if (!res.ok) {
    return Response.json({ error: "Invalid Vercel token" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { vercelToken: encrypt(token.trim()) },
  });

  return Response.json({ ok: true });
}
