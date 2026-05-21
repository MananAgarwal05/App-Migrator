const VERCEL_API = "https://api.vercel.com";

// Map our framework names to Vercel framework presets
const FRAMEWORK_PRESET_MAP: Record<string, string> = {
  nextjs: "nextjs",
  "react-vite": "vite",
  "react-cra": "create-react-app",
  vue: "vue",
  "vue-vite": "vite",
  sveltekit: "sveltekit",
  astro: "astro",
  nuxt: "nuxtjs",
  angular: "angular",
  vite: "vite",
  static: "other",
  node: "other",
  react: "create-react-app",
};

export interface CreateProjectResult {
  projectId: string;
  projectName: string;
}

export interface ProjectConfig {
  framework: string;
  buildCommand: string | null;
  outputDirectory: string | null;
  installCommand: string | null;
  nodeVersion: string | null;
  repoFullName: string;
  defaultBranch?: string;
}

export async function createVercelProject(
  token: string,
  config: ProjectConfig
): Promise<CreateProjectResult> {
  const frameworkPreset = FRAMEWORK_PRESET_MAP[config.framework] ?? "other";

  // Create project
  const createBody: Record<string, unknown> = {
    name: `app-${Date.now()}`,
    framework: frameworkPreset,
    gitRepository: {
      type: "github",
      repo: config.repoFullName,
    },
  };

  if (config.buildCommand) createBody.buildCommand = config.buildCommand;
  if (config.outputDirectory) createBody.outputDirectory = config.outputDirectory;
  if (config.installCommand) createBody.installCommand = config.installCommand;
  if (config.nodeVersion) createBody.nodeVersion = config.nodeVersion;

  const createRes = await fetch(`${VERCEL_API}/v10/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createBody),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Failed to create Vercel project: ${createRes.status} ${errorText}`);
  }

  const project = (await createRes.json()) as { id: string; name: string };

  return {
    projectId: project.id,
    projectName: project.name,
  };
}
