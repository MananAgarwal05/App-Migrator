export interface EnvVar {
  key: string;
  source: string;
  required: boolean;
  value: string | null;
  sensitive: boolean;
}

type FileMap = Map<string, string>;

const SENSITIVE_PATTERNS = [
  /secret/i,
  /password/i,
  /token/i,
  /key/i,
  /api_key/i,
  /apikey/i,
  /auth/i,
  /credential/i,
  /private/i,
  /jwt/i,
  /webhook/i,
];

function isSensitive(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

function parseEnvFile(content: string): Map<string, string | null> {
  const vars = new Map<string, string | null>();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const rawValue = trimmed.slice(eqIdx + 1).trim();

    if (!key || !/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;

    // Strip surrounding quotes
    let value: string | null = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars.set(key, value || null);
  }

  return vars;
}

function scanCodeForEnvVars(content: string): string[] {
  const keys = new Set<string>();

  // process.env.VAR_NAME
  const processEnvRegex = /process\.env\.([A-Z_][A-Z0-9_]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = processEnvRegex.exec(content)) !== null) {
    keys.add(match[1].toUpperCase());
  }

  // process.env['VAR_NAME'] or process.env["VAR_NAME"]
  const processEnvBracketRegex = /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]]/gi;
  while ((match = processEnvBracketRegex.exec(content)) !== null) {
    keys.add(match[1].toUpperCase());
  }

  // import.meta.env.VAR_NAME
  const importMetaEnvRegex = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/gi;
  while ((match = importMetaEnvRegex.exec(content)) !== null) {
    keys.add(match[1].toUpperCase());
  }

  return Array.from(keys);
}

function scanPrismaSchema(content: string): string[] {
  const keys: string[] = [];
  const envRegex = /env\(["']([^"']+)["']\)/g;
  let match: RegExpExecArray | null;
  while ((match = envRegex.exec(content)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

function scanVercelJson(content: string): string[] {
  try {
    const json = JSON.parse(content) as { env?: Record<string, string> };
    return Object.keys(json.env ?? {});
  } catch {
    return [];
  }
}

export function detectEnvVars(files: FileMap): EnvVar[] {
  const allVars = new Map<string, EnvVar>();

  function addVar(
    key: string,
    source: string,
    value: string | null,
    required: boolean
  ) {
    if (!key) return;
    const existing = allVars.get(key);
    if (!existing) {
      allVars.set(key, {
        key,
        source,
        required,
        value,
        sensitive: isSensitive(key),
      });
    } else {
      // Merge: prefer non-null value, mark required if any source says required
      if (value !== null && existing.value === null) {
        existing.value = value;
      }
      if (required) existing.required = true;
    }
  }

  // 1. Parse .env.example, .env.sample, .env.template (these are templates — values are hints)
  for (const filename of [".env.example", ".env.sample", ".env.template"]) {
    for (const [path, content] of files) {
      if (path === filename || path.endsWith(`/${filename}`)) {
        const vars = parseEnvFile(content);
        for (const [key] of vars) {
          addVar(key, filename, null, true);
        }
      }
    }
  }

  // 2. Parse .env, .env.local, .env.production (present but values should NOT be stored in logs)
  for (const filename of [".env", ".env.local", ".env.production", ".env.development"]) {
    for (const [path, content] of files) {
      if (path === filename || path.endsWith(`/${filename}`)) {
        const vars = parseEnvFile(content);
        for (const [key] of vars) {
          // Never store actual values from uploaded .env files
          addVar(key, filename, null, false);
        }
      }
    }
  }

  // 3. Code scan
  const codeExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  for (const [path, content] of files) {
    const ext = path.slice(path.lastIndexOf("."));
    if (codeExtensions.includes(ext)) {
      const keys = scanCodeForEnvVars(content);
      for (const key of keys) {
        addVar(key, "code-scan", null, false);
      }
    }
  }

  // 4. Prisma schema
  for (const [path, content] of files) {
    if (path.endsWith("schema.prisma")) {
      const keys = scanPrismaSchema(content);
      for (const key of keys) {
        addVar(key, "prisma-schema", null, true);
      }
    }
  }

  // 5. vercel.json
  for (const [path, content] of files) {
    if (path === "vercel.json" || path.endsWith("/vercel.json")) {
      const keys = scanVercelJson(content);
      for (const key of keys) {
        addVar(key, "vercel.json", null, true);
      }
    }
  }

  return Array.from(allVars.values());
}
