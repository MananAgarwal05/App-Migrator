export interface MochaExportInfo {
  isMochaExport: boolean;
  appName: string | null;
  appId: string | null;
  subdomain: string | null;
  deployedUrl: string | null;
  exportedAt: string | null;
  hasDatabase: boolean;
  hasUsers: boolean;
  hasAssets: boolean;
  envVarsFromExport: Record<string, string>;
}

type FileMap = Map<string, string>;

export function detectMochaExport(files: FileMap): MochaExportInfo {
  const empty: MochaExportInfo = {
    isMochaExport: false,
    appName: null,
    appId: null,
    subdomain: null,
    deployedUrl: null,
    exportedAt: null,
    hasDatabase: false,
    hasUsers: false,
    hasAssets: false,
    envVarsFromExport: {},
  };

  // A Mocha export has: d1_dump.sql and users.json at root, plus code/ directory
  const hasD1 = files.has("d1_dump.sql");
  const hasUsers = files.has("users.json");
  const hasCodeDir = Array.from(files.keys()).some((k) => k.startsWith("code/"));

  if (!hasD1 && !hasUsers && !hasCodeDir) return empty;
  // Need at least two of the three signals to be confident
  const signals = [hasD1, hasUsers, hasCodeDir].filter(Boolean).length;
  if (signals < 2) return empty;

  const result: MochaExportInfo = {
    isMochaExport: true,
    appName: null,
    appId: null,
    subdomain: null,
    deployedUrl: null,
    exportedAt: null,
    hasDatabase: hasD1,
    hasUsers,
    hasAssets: files.has("public_asset_links.json"),
    envVarsFromExport: {},
  };

  // Parse README.md for metadata
  const readme = files.get("README.md");
  if (readme) {
    const nameMatch = readme.match(/- App name:\s*(.+)/);
    const idMatch = readme.match(/- App id:\s*(.+)/);
    const subdomainMatch = readme.match(/- Subdomain:\s*(.+)/);
    const urlMatch = readme.match(/- Deployed URL:\s*(.+)/);
    const exportedAtMatch = readme.match(/- Exported at:\s*(.+)/);

    if (nameMatch) result.appName = nameMatch[1].trim();
    if (idMatch) result.appId = idMatch[1].trim();
    if (subdomainMatch) result.subdomain = subdomainMatch[1].trim();
    if (urlMatch) result.deployedUrl = urlMatch[1].trim();
    if (exportedAtMatch) result.exportedAt = exportedAtMatch[1].trim();
  }

  // Parse root .env for variable names (never store values in logs/db)
  const envContent = files.get(".env");
  if (envContent) {
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key) result.envVarsFromExport[key] = value;
    }
  }

  return result;
}

/**
 * Re-maps a Mocha export file map so that `code/*` entries become the root.
 * Skips non-code Mocha metadata files (d1_dump.sql, users.json, etc.).
 */
export function remapMochaFiles(files: FileMap): FileMap {
  const remapped: FileMap = new Map();
  const SKIP = new Set(["d1_dump.sql", "users.json", "public_asset_links.json", "README.md", ".env"]);

  for (const [path, content] of files) {
    if (SKIP.has(path)) continue;
    if (path.startsWith("code/")) {
      const newPath = path.slice("code/".length);
      if (newPath) remapped.set(newPath, content);
    }
    // Skip anything else at root level that isn't part of the code
  }

  return remapped;
}
