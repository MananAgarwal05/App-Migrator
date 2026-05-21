/**
 * Transforms Mocha/Cloudflare-specific files so the project builds on Vercel.
 *
 * Mocha apps run on Cloudflare Workers. The build uses @cloudflare/vite-plugin
 * which bundles both the React frontend AND the Hono Worker together.
 * For Vercel we strip the Cloudflare plugin so Vite only builds the frontend.
 * The Hono Worker backend cannot be deployed to Vercel without further migration.
 */

type FileMap = Map<string, string>;

const MOCHA_DEVDEPS = new Set([
  "@cloudflare/vite-plugin",
  "@getmocha/vite-plugins",
  "@getmocha/users-service",
  "wrangler",
]);

const CLOUDFLARE_SCRIPTS = new Set(["cf-typegen", "check"]);

export function transformMochaFiles(files: FileMap): FileMap {
  const transformed = new Map(files);

  transformViteConfig(transformed);
  transformPackageJson(transformed);

  // wrangler.json is Cloudflare-only; delete it so Vercel doesn't try to interpret it
  transformed.delete("wrangler.json");

  return transformed;
}

function transformViteConfig(files: FileMap) {
  for (const name of ["vite.config.ts", "vite.config.js"]) {
    const content = files.get(name);
    if (!content) continue;

    let updated = content;

    // Remove Cloudflare + Mocha plugin imports
    updated = updated.replace(/^import\s+\{[^}]+\}\s+from\s+["']@cloudflare\/vite-plugin["'];?\s*\n?/gm, "");
    updated = updated.replace(/^import\s+\{[^}]+\}\s+from\s+["']@getmocha\/vite-plugins["'];?\s*\n?/gm, "");

    // Replace plugins array: remove cloudflare() and mochaPlugins(...)
    // Handle the common pattern: plugins: [...mochaPlugins(...), react(), cloudflare()]
    updated = updated.replace(/\[\.\.\.mochaPlugins\([^)]*\),?\s*/g, "[");
    updated = updated.replace(/,?\s*cloudflare\(\)/g, "");

    files.set(name, updated);
    break;
  }
}

function transformPackageJson(files: FileMap) {
  const content = files.get("package.json");
  if (!content) return;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return;
  }

  // Remove Cloudflare/Mocha devDependencies
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  if (devDeps) {
    for (const dep of MOCHA_DEVDEPS) delete devDeps[dep];
  }

  // Remove Cloudflare/Mocha dependencies too (if present)
  const deps = pkg.dependencies as Record<string, string> | undefined;
  if (deps) {
    for (const dep of MOCHA_DEVDEPS) delete deps[dep];
  }

  // Remove Cloudflare-specific scripts
  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (scripts) {
    for (const script of CLOUDFLARE_SCRIPTS) delete scripts[script];

    // Fix build script: remove Worker-specific steps, keep frontend build
    // Cloudflare build: "tsc -b && vite build" — this still works for frontend-only
    // Leave the build script as-is; without the Cloudflare plugin it'll build frontend only
  }

  // Remove the `main` field if it points to the Worker entry
  const main = pkg.main as string | undefined;
  if (main?.includes("worker") || main?.includes("src/worker")) {
    delete pkg.main;
  }

  files.set("package.json", JSON.stringify(pkg, null, 2) + "\n");
}
