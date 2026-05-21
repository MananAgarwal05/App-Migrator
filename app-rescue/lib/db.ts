import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/app/generated/prisma";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma local dev proxy encodes the real postgres URL in the api_key query param as base64 JSON.
function resolvePostgresUrl(rawUrl: string): string {
  if (!rawUrl.startsWith("prisma+postgres://")) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const apiKey = url.searchParams.get("api_key");
    if (!apiKey) return rawUrl;
    const decoded = JSON.parse(
      Buffer.from(apiKey, "base64").toString("utf8")
    ) as { databaseUrl: string };
    return decoded.databaseUrl;
  } catch {
    return rawUrl;
  }
}

function createPrismaClient() {
  const connectionString = resolvePostgresUrl(process.env.DATABASE_URL!);
  // rejectUnauthorized: false is required for hosted providers (Aiven, etc.)
  // that use a private CA not in the system trust store.
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
