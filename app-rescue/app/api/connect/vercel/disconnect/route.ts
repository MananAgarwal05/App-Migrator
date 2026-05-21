import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { vercelToken: null },
  });

  redirect("/");
}
