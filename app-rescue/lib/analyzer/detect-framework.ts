export interface FrameworkDetectionResult {
  name: string;
  version: string | null;
  confidence: number;
  buildCommand: string | null;
  outputDirectory: string | null;
  installCommand: string | null;
  nodeVersion: string | null;
}

type FileMap = Map<string, string>;

function getPackageJson(files: FileMap): Record<string, unknown> | null {
  const content = files.get("package.json");
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getDepVersion(
  pkg: Record<string, unknown>,
  dep: string
): string | null {
  const deps = (pkg.dependencies as Record<string, string>) ?? {};
  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
  const version = deps[dep] ?? devDeps[dep] ?? null;
  if (!version) return null;
  // Clean semver prefix
  return version.replace(/^[\^~>=<]/, "").split(" ")[0];
}

function hasDep(pkg: Record<string, unknown>, dep: string): boolean {
  return getDepVersion(pkg, dep) !== null;
}

function hasFile(files: FileMap, pattern: string): boolean {
  for (const key of files.keys()) {
    if (key === pattern || key.endsWith(`/${pattern}`)) return true;
  }
  return false;
}

function hasFilePattern(files: FileMap, prefix: string): boolean {
  for (const key of files.keys()) {
    const base = key.split("/").pop() ?? "";
    if (base.startsWith(prefix)) return true;
  }
  return false;
}

export function detectFramework(files: FileMap): FrameworkDetectionResult {
  const pkg = getPackageJson(files);

  // No package.json — check for static/python/docker
  if (!pkg) {
    if (hasFile(files, "index.html")) {
      return {
        name: "static",
        version: null,
        confidence: 0.9,
        buildCommand: null,
        outputDirectory: null,
        installCommand: null,
        nodeVersion: null,
      };
    }
    if (hasFile(files, "requirements.txt") || hasFile(files, "Pipfile")) {
      return {
        name: "python",
        version: null,
        confidence: 0.95,
        buildCommand: null,
        outputDirectory: null,
        installCommand: null,
        nodeVersion: null,
      };
    }
    if (hasFile(files, "Dockerfile")) {
      return {
        name: "docker",
        version: null,
        confidence: 0.95,
        buildCommand: null,
        outputDirectory: null,
        installCommand: null,
        nodeVersion: null,
      };
    }
    return {
      name: "unknown",
      version: null,
      confidence: 0,
      buildCommand: null,
      outputDirectory: null,
      installCommand: null,
      nodeVersion: null,
    };
  }

  const scripts = (pkg.scripts as Record<string, string>) ?? {};
  const engines = (pkg.engines as Record<string, string>) ?? {};
  const nodeVersion = engines.node ?? null;

  // Determine install command
  let installCommand = "npm install";
  if (hasFile(files, "yarn.lock")) installCommand = "yarn";
  else if (hasFile(files, "pnpm-lock.yaml")) installCommand = "pnpm install";
  else if (hasFile(files, "bun.lockb")) installCommand = "bun install";

  // Next.js detection
  if (hasDep(pkg, "next") || hasFilePattern(files, "next.config")) {
    const version = getDepVersion(pkg, "next");
    return {
      name: "nextjs",
      version,
      confidence: hasDep(pkg, "next") && hasFilePattern(files, "next.config") ? 0.99 : 0.95,
      buildCommand: scripts.build ?? "npm run build",
      outputDirectory: ".next",
      installCommand,
      nodeVersion,
    };
  }

  // Nuxt detection
  if (hasDep(pkg, "nuxt") || hasFilePattern(files, "nuxt.config")) {
    const version = getDepVersion(pkg, "nuxt");
    return {
      name: "nuxt",
      version,
      confidence: 0.97,
      buildCommand: scripts.build ?? "npm run build",
      outputDirectory: ".output",
      installCommand,
      nodeVersion,
    };
  }

  // SvelteKit detection
  if (hasDep(pkg, "@sveltejs/kit") || hasFilePattern(files, "svelte.config")) {
    const version = getDepVersion(pkg, "@sveltejs/kit");
    return {
      name: "sveltekit",
      version,
      confidence: 0.97,
      buildCommand: scripts.build ?? "npm run build",
      outputDirectory: ".svelte-kit",
      installCommand,
      nodeVersion,
    };
  }

  // Astro detection
  if (hasDep(pkg, "astro") || hasFilePattern(files, "astro.config")) {
    const version = getDepVersion(pkg, "astro");
    return {
      name: "astro",
      version,
      confidence: 0.97,
      buildCommand: scripts.build ?? "npm run build",
      outputDirectory: "dist",
      installCommand,
      nodeVersion,
    };
  }

  // Angular detection
  if (hasDep(pkg, "@angular/core") || hasFile(files, "angular.json")) {
    const version = getDepVersion(pkg, "@angular/core");
    return {
      name: "angular",
      version,
      confidence: 0.97,
      buildCommand: scripts.build ?? "ng build",
      outputDirectory: "dist",
      installCommand,
      nodeVersion,
    };
  }

  // Vue detection (without Nuxt)
  if (hasDep(pkg, "vue")) {
    const version = getDepVersion(pkg, "vue");
    // Vite + Vue
    if (hasDep(pkg, "vite") || hasFilePattern(files, "vite.config")) {
      return {
        name: "vue-vite",
        version,
        confidence: 0.95,
        buildCommand: scripts.build ?? "npm run build",
        outputDirectory: "dist",
        installCommand,
        nodeVersion,
      };
    }
    return {
      name: "vue",
      version,
      confidence: 0.9,
      buildCommand: scripts.build ?? "npm run build",
      outputDirectory: "dist",
      installCommand,
      nodeVersion,
    };
  }

  // Vite detection (React + Vite)
  if (hasDep(pkg, "vite") || hasFilePattern(files, "vite.config")) {
    if (hasDep(pkg, "react")) {
      return {
        name: "react-vite",
        version: getDepVersion(pkg, "react"),
        confidence: 0.95,
        buildCommand: scripts.build ?? "npm run build",
        outputDirectory: "dist",
        installCommand,
        nodeVersion,
      };
    }
    return {
      name: "vite",
      version: getDepVersion(pkg, "vite"),
      confidence: 0.9,
      buildCommand: scripts.build ?? "npm run build",
      outputDirectory: "dist",
      installCommand,
      nodeVersion,
    };
  }

  // CRA (Create React App)
  if (hasDep(pkg, "react-scripts")) {
    return {
      name: "react-cra",
      version: getDepVersion(pkg, "react"),
      confidence: 0.97,
      buildCommand: scripts.build ?? "npm run build",
      outputDirectory: "build",
      installCommand,
      nodeVersion,
    };
  }

  // Plain React
  if (hasDep(pkg, "react")) {
    return {
      name: "react",
      version: getDepVersion(pkg, "react"),
      confidence: 0.75,
      buildCommand: scripts.build ?? null,
      outputDirectory: null,
      installCommand,
      nodeVersion,
    };
  }

  // Static (has package.json but no framework)
  if (hasFile(files, "index.html")) {
    return {
      name: "static",
      version: null,
      confidence: 0.7,
      buildCommand: scripts.build ?? null,
      outputDirectory: null,
      installCommand,
      nodeVersion,
    };
  }

  return {
    name: "node",
    version: null,
    confidence: 0.5,
    buildCommand: scripts.build ?? null,
    outputDirectory: null,
    installCommand,
    nodeVersion,
  };
}
