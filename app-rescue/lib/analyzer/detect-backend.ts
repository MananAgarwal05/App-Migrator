export interface BackendDetectionResult {
  hasBackend: boolean;
  backendType: string | null;
  databaseDetected: string | null;
}

type FileMap = Map<string, string>;

function hasFile(files: FileMap, pattern: string): boolean {
  for (const key of files.keys()) {
    if (key === pattern || key.endsWith(`/${pattern}`)) return true;
  }
  return false;
}

function hasPathPattern(files: FileMap, pattern: string): boolean {
  for (const key of files.keys()) {
    if (key.includes(pattern)) return true;
  }
  return false;
}

function getPackageJson(files: FileMap): Record<string, unknown> | null {
  const content = files.get("package.json");
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasDep(pkg: Record<string, unknown>, dep: string): boolean {
  const deps = (pkg.dependencies as Record<string, string>) ?? {};
  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
  return dep in deps || dep in devDeps;
}

export function detectBackend(files: FileMap): BackendDetectionResult {
  const pkg = getPackageJson(files);

  let hasBackend = false;
  let backendType: string | null = null;
  let databaseDetected: string | null = null;

  if (pkg) {
    // Next.js API routes
    if (hasDep(pkg, "next")) {
      // Check for app/api or pages/api directories
      if (
        hasPathPattern(files, "/api/") ||
        hasPathPattern(files, "app/api") ||
        hasPathPattern(files, "pages/api")
      ) {
        hasBackend = true;
        backendType = "api-routes";
      }
    }

    // Express
    if (hasDep(pkg, "express")) {
      hasBackend = true;
      backendType = "express";
    }

    // Fastify
    if (hasDep(pkg, "fastify")) {
      hasBackend = true;
      backendType = backendType ? `${backendType},fastify` : "fastify";
    }

    // Hono
    if (hasDep(pkg, "hono")) {
      hasBackend = true;
      backendType = backendType ? `${backendType},hono` : "hono";
    }

    // Database detection
    if (hasDep(pkg, "@prisma/client") || hasFile(files, "schema.prisma")) {
      databaseDetected = "prisma";
    } else if (hasDep(pkg, "drizzle-orm")) {
      databaseDetected = "drizzle";
    } else if (hasDep(pkg, "@supabase/supabase-js")) {
      databaseDetected = "supabase";
    } else if (hasDep(pkg, "mongoose") || hasDep(pkg, "mongodb")) {
      databaseDetected = "mongodb";
    } else if (hasDep(pkg, "pg") || hasDep(pkg, "postgres")) {
      databaseDetected = "postgres";
    } else if (hasDep(pkg, "mysql2") || hasDep(pkg, "mysql")) {
      databaseDetected = "mysql";
    } else if (hasDep(pkg, "better-sqlite3") || hasDep(pkg, "sqlite3")) {
      databaseDetected = "sqlite";
    }

    // Supabase as backend (not just DB)
    if (hasDep(pkg, "@supabase/supabase-js")) {
      hasBackend = true;
      if (!backendType) backendType = "supabase";
    }
  }

  // Check for server files outside package.json deps
  if (!hasBackend) {
    if (
      hasFile(files, "server.js") ||
      hasFile(files, "server.ts") ||
      hasFile(files, "index.js") ||
      hasFile(files, "app.js")
    ) {
      hasBackend = true;
      backendType = backendType ?? "node-server";
    }
  }

  return { hasBackend, backendType, databaseDetected };
}
