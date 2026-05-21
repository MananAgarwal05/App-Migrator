# AppRescue — ZIP to Vercel Deployment Platform

## Product Spec v1.0

---

## Overview

A Next.js web application that accepts a ZIP file upload containing an exported web project, automatically detects the framework and configuration, deploys it to Vercel via their API, and returns a live URL. Designed initially for Mocha refugees but applicable to any AI-generated or exported codebase.

---

## Core User Flow

```
Upload ZIP → Analyze Project → Connect GitHub + Vercel → Deploy → Live URL
```

1. User lands on the app, drags/drops or selects a ZIP file.
2. The backend extracts and analyzes the ZIP contents.
3. User connects their GitHub account (OAuth) and Vercel account (OAuth).
4. The app creates a GitHub repo, pushes the code, and triggers a Vercel deployment.
5. User receives the live `.vercel.app` URL.
6. (Upsell) User can convert the live site into an Android/iOS app via WebToNative.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Full-stack, API routes, server actions |
| Language | TypeScript | Type safety across the codebase |
| Styling | Tailwind CSS | Fast UI development |
| File handling | `unzipper` or `adm-zip` | Server-side ZIP extraction |
| GitHub API | `octokit` | Repo creation, file push |
| Vercel API | REST (fetch) | Project creation, deployment |
| Database | PostgreSQL via Prisma | Track deployments, users, jobs |
| Auth | NextAuth.js v5 | GitHub + Vercel OAuth in one flow |
| Queue/Jobs | BullMQ + Redis (or Inngest) | Async deployment pipeline |
| Storage | S3-compatible (temp ZIP storage) | Uploaded ZIPs before extraction |
| Hosting | Vercel | Dogfooding the deploy target |

---

## Pages & Routes

### Frontend Pages

| Route | Purpose |
|---|---|
| `/` | Landing page with upload dropzone |
| `/analyze/[jobId]` | Analysis results, env var editor, deploy button |
| `/deploy/[jobId]` | Deployment progress (real-time status) |
| `/dashboard` | User's past deployments, links, status |
| `/auth/signin` | OAuth sign-in (GitHub + Vercel) |

### API Routes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/upload` | POST | Accept ZIP, store it, start analysis job |
| `/api/analyze/[jobId]` | GET | Return analysis results |
| `/api/deploy/[jobId]` | POST | Trigger GitHub repo creation + Vercel deploy |
| `/api/deploy/[jobId]/status` | GET | Poll deployment status |
| `/api/deploy/[jobId]/env` | PUT | Update environment variables before deploy |
| `/api/auth/[...nextauth]` | * | NextAuth handler |
| `/api/webhooks/vercel` | POST | Vercel deployment status webhook |

---

## Module 1: ZIP Upload & Storage

### Upload Flow

- Accept `.zip` files up to 500 MB.
- Validate MIME type and file extension on client and server.
- Store temporarily in S3 (or `/tmp` for MVP) with a TTL of 24 hours.
- Return a `jobId` (UUID) to the client immediately.
- Trigger the analysis pipeline asynchronously.

### Client-Side Upload UI

- Full-page dropzone with drag-and-drop support.
- Progress bar during upload.
- Accepts only `.zip`.
- Shows file name, size, and estimated upload time.

### Constraints

- Max file size: 500 MB (configurable via env var).
- Single file per upload.
- No nested ZIPs.
- Reject files that extract to more than 50,000 files or 2 GB uncompressed.

---

## Module 2: Project Analyzer

The analyzer runs server-side after ZIP extraction. It produces a structured report.

### Detection Logic (in priority order)

```
1. Check for `package.json` → Node.js project
2. Check `dependencies` / `devDependencies`:
   - `next`           → Next.js
   - `react` (no next) → React (CRA or Vite)
   - `vue`            → Vue
   - `svelte`         → SvelteKit
   - `astro`          → Astro
   - `nuxt`           → Nuxt
3. Check for config files:
   - `next.config.*`  → Next.js
   - `vite.config.*`  → Vite
   - `astro.config.*` → Astro
   - `svelte.config.*`→ SvelteKit
   - `angular.json`   → Angular
4. Check for `index.html` at root (no package.json) → Static site
5. Check for `requirements.txt` / `Pipfile` → Python (unsupported, warn)
6. Check for `Dockerfile` → Docker (unsupported initially, warn)
```

### Analysis Output Schema

```typescript
interface AnalysisResult {
  jobId: string;
  status: "success" | "warning" | "unsupported";
  framework: {
    name: string;          // "nextjs" | "react-vite" | "vue" | "static" | ...
    version: string | null;
    confidence: number;    // 0-1
  };
  buildCommand: string | null;    // e.g. "npm run build"
  outputDirectory: string | null; // e.g. ".next", "dist", "build"
  installCommand: string | null;  // e.g. "npm install"
  nodeVersion: string | null;     // e.g. "18.x"
  envVars: EnvVar[];
  warnings: Warning[];
  fileCount: number;
  totalSize: number;               // bytes
  hasBackend: boolean;
  backendType: string | null;      // "api-routes" | "express" | "supabase" | null
  databaseDetected: string | null; // "prisma" | "drizzle" | "supabase" | null
  deployable: boolean;
  suggestedFixes: string[];
}

interface EnvVar {
  key: string;
  source: string;          // ".env.example", ".env.local", "code-scan"
  required: boolean;
  value: string | null;    // null = user must provide
  sensitive: boolean;      // true for API keys, secrets
}

interface Warning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  suggestion: string;
}
```

### Environment Variable Detection

Scan these sources in order:

1. `.env.example`, `.env.sample`, `.env.template` → parse key names.
2. `.env`, `.env.local`, `.env.production` → parse keys (never store values from user uploads in logs).
3. Code scan: grep for `process.env.` and `import.meta.env.` across all `.ts`, `.tsx`, `.js`, `.jsx` files.
4. Prisma schema: check `env("DATABASE_URL")`.
5. `vercel.json`: check `env` block.

Deduplicate and present to the user for filling in.

### Warning Examples

| Condition | Warning |
|---|---|
| No `build` script in `package.json` | "No build script found. Vercel may not know how to build this project." |
| `prisma` in deps but no `DATABASE_URL` in env | "Prisma detected but no DATABASE_URL configured. The app will fail to connect to a database." |
| `.env` file contains real secrets | "We detected what appear to be real API keys in your upload. We've excluded them from storage for security. Please re-enter them manually." |
| Python/Docker detected | "This project type isn't supported for auto-deployment yet." |
| Monorepo detected (`workspaces` or `lerna.json`) | "Monorepo detected. Please specify which package to deploy." |
| No `package-lock.json` or `yarn.lock` | "No lockfile found. Build may use unpredictable dependency versions." |

---

## Module 3: GitHub Integration

### OAuth Scopes Required

- `repo` — create repos, push code
- `read:user` — identify the user

### Repo Creation Flow

1. User authorizes via GitHub OAuth.
2. App creates a **private** repo under the user's account.
3. Repo name: `deployed-{sanitized-project-name}-{short-hash}` (e.g., `deployed-my-app-a3f2`).
4. Push all extracted files in a single commit.
5. Add a `.gitignore` if one doesn't exist (use the Node.js template).
6. Do NOT push `.env` files — only `.env.example`.

### Implementation Notes

- Use `octokit.rest.repos.createForAuthenticatedUser()` for repo creation.
- Use the Git Database API (trees + blobs + commits) for a single-commit push of all files. This is faster and more reliable than individual file creation for large projects.
- Handle rate limits with exponential backoff.
- Store the repo URL in the deployment record.

---

## Module 4: Vercel Integration

### OAuth Scopes Required

- Vercel OAuth token with project creation + deployment permissions.

### Deployment Flow

1. User authorizes via Vercel OAuth.
2. Create a Vercel project linked to the GitHub repo.
3. Set the detected framework preset (Next.js, Vite, etc.).
4. Set environment variables (from user input).
5. Set build command, output directory, install command overrides if needed.
6. Trigger deployment.
7. Poll for deployment status or receive via webhook.
8. Return the production URL.

### Vercel API Calls (in order)

```
1. POST /v10/projects          → Create project
2. PATCH /v10/projects/:id     → Set framework, build settings
3. POST /v10/projects/:id/env  → Set env vars (each one)
4. POST /v13/deployments       → Trigger deploy from git
5. GET  /v13/deployments/:id   → Poll status
```

### Deployment Status States

```
QUEUED → BUILDING → READY | ERROR | CANCELED
```

Map these to user-facing states:

| Vercel Status | UI State | UI Message |
|---|---|---|
| QUEUED | pending | "Waiting in build queue..." |
| BUILDING | building | "Building your app..." |
| READY | success | "Your app is live!" |
| ERROR | failed | "Build failed. Check logs." |
| CANCELED | canceled | "Deployment was canceled." |

### Error Handling

- If build fails, fetch build logs via `GET /v6/deployments/:id/events` and display to the user.
- Common failures to detect and surface helpfully: missing env vars, build script errors, dependency resolution failures, Node version incompatibility.

---

## Module 5: Real-Time Deployment UI

### `/deploy/[jobId]` Page

A step-by-step progress view.

```
Step 1: Analyzing project        ✅ Complete
Step 2: Creating GitHub repo     ✅ Complete
Step 3: Pushing code             ✅ Complete
Step 4: Creating Vercel project  ✅ Complete
Step 5: Building                 🔄 In progress...
Step 6: Live!                    ⏳ Waiting
```

### Implementation

- Use Server-Sent Events (SSE) or polling (every 3 seconds) to update the UI.
- Each step updates a `deployments` table row with status + timestamps.
- The client polls `/api/deploy/[jobId]/status`.

### On Success

Display prominently:

- The live URL (clickable, opens in new tab).
- A "Copy URL" button.
- The GitHub repo link.
- A CTA: "Convert to mobile app with WebToNative →"

### On Failure

Display:

- Which step failed.
- The error message / build log snippet.
- Suggested fixes (from the analyzer warnings + build error parsing).
- A "Retry" button that re-triggers from the failed step.

---

## Module 6: Dashboard

### `/dashboard` Page

Shows all of the user's deployments.

| Column | Description |
|---|---|
| Project name | From `package.json` name or folder name |
| Framework | Detected framework icon + name |
| Status | Live / Failed / Building |
| URL | Clickable link to `.vercel.app` |
| Created | Timestamp |
| Actions | Redeploy, Delete, Convert to Mobile |

---

## Database Schema (Prisma)

```prisma
model User {
  id              String       @id @default(cuid())
  email           String?      @unique
  githubId        String       @unique
  githubToken     String       // encrypted
  vercelToken     String?      // encrypted
  createdAt       DateTime     @default(now())
  deployments     Deployment[]
}

model Deployment {
  id              String       @id @default(cuid())
  userId          String
  user            User         @relation(fields: [userId], references: [id])
  
  // Upload
  originalFilename String
  zipPath          String?     // temp S3 path
  
  // Analysis
  framework        String?
  buildCommand     String?
  outputDir        String?
  installCommand   String?
  nodeVersion      String?
  analysisResult   Json?       // full AnalysisResult
  
  // GitHub
  githubRepoUrl    String?
  githubRepoName   String?
  
  // Vercel
  vercelProjectId  String?
  vercelDeployId   String?
  vercelUrl        String?     // the live URL
  
  // Status
  status           DeploymentStatus @default(UPLOADED)
  currentStep      String?
  error            String?
  buildLogs        String?
  
  // Env vars (encrypted JSON)
  envVars          String?     // encrypted JSON blob
  
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
}

enum DeploymentStatus {
  UPLOADED
  ANALYZING
  ANALYZED
  CREATING_REPO
  PUSHING_CODE
  CREATING_PROJECT
  DEPLOYING
  LIVE
  FAILED
}
```

---

## Security Considerations

1. **Secrets encryption**: All OAuth tokens and user-provided env vars must be encrypted at rest (use `aes-256-gcm` with a key from env).
2. **ZIP bomb protection**: Check uncompressed size before extracting. Reject if ratio > 100:1 or uncompressed > 2 GB.
3. **Path traversal**: When extracting ZIP, reject any entries with `..` in the path or absolute paths.
4. **Malicious code**: Do NOT execute any code from the uploaded ZIP on your server. Analysis is read-only (file detection, text parsing).
5. **Token scoping**: Request minimum OAuth scopes. Store tokens encrypted. Support token revocation.
6. **Upload cleanup**: Delete extracted files and ZIPs within 24 hours of upload.
7. **Rate limiting**: Max 10 deployments per user per day. Max 3 concurrent uploads.

---

## Environment Variables (for AppRescue itself)

```env
# App
NEXT_PUBLIC_APP_URL=https://apprescue.webtonative.com
NODE_ENV=production

# Database
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://apprescue.webtonative.com

# GitHub OAuth App
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Vercel OAuth Integration
VERCEL_CLIENT_ID=...
VERCEL_CLIENT_SECRET=...

# Storage (for ZIP uploads)
S3_BUCKET=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_REGION=...

# Encryption
ENCRYPTION_KEY=... # 32-byte hex string for AES-256-GCM
```

---

## MVP Scope (Phase 1)

Ship only this:

- ZIP upload + extraction.
- Framework detection (Next.js, React/Vite, static sites only).
- Env var detection and manual entry UI.
- GitHub repo creation + code push.
- Vercel project creation + deployment.
- Real-time status page.
- Success page with live URL.
- Basic dashboard.

### Explicitly Out of Scope for Phase 1

- Database provisioning (Supabase/Neon/PlanetScale setup).
- Backend-only projects (Express, Fastify without frontend).
- Docker-based deployments.
- Custom domain configuration.
- Team/org accounts.
- WebToNative integration (manual link/CTA is fine).
- Monorepo support.
- Automatic env var value detection from Mocha exports.

---

## Phase 2 (Post-MVP)

- Database provisioning: auto-create Supabase/Neon project and inject `DATABASE_URL`.
- Prisma migration runner: detect `prisma/migrations` folder and run them post-deploy.
- WebToNative deep integration: one-click Android/iOS app generation from deployed URL.
- Custom domain setup via Vercel API.
- Mocha-specific export parser (if export format is discovered from real user uploads).
- Deployment analytics (uptime, build times, error rates).
- "Fix with AI" button: send build errors to an LLM to suggest code patches.

---

## File Structure (Suggested)

```
app-rescue/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Landing + upload
│   ├── analyze/
│   │   └── [jobId]/
│   │       └── page.tsx            # Analysis results + env var editor
│   ├── deploy/
│   │   └── [jobId]/
│   │       └── page.tsx            # Deployment progress
│   ├── dashboard/
│   │   └── page.tsx                # User deployments
│   └── api/
│       ├── upload/
│       │   └── route.ts
│       ├── analyze/
│       │   └── [jobId]/
│       │       └── route.ts
│       ├── deploy/
│       │   └── [jobId]/
│       │       ├── route.ts        # Trigger deploy
│       │       ├── status/
│       │       │   └── route.ts    # Poll status
│       │       └── env/
│       │           └── route.ts    # Update env vars
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts
│       └── webhooks/
│           └── vercel/
│               └── route.ts
├── lib/
│   ├── analyzer/
│   │   ├── index.ts                # Main analyzer orchestrator
│   │   ├── detect-framework.ts     # Framework detection logic
│   │   ├── detect-env-vars.ts      # Env var scanner
│   │   ├── detect-backend.ts       # Backend/DB detection
│   │   └── validate-zip.ts         # Security checks
│   ├── github/
│   │   ├── create-repo.ts
│   │   └── push-code.ts
│   ├── vercel/
│   │   ├── create-project.ts
│   │   ├── set-env-vars.ts
│   │   ├── deploy.ts
│   │   └── poll-status.ts
│   ├── encryption.ts               # AES-256-GCM helpers
│   ├── storage.ts                  # S3 upload/download/delete
│   └── db.ts                       # Prisma client
├── components/
│   ├── upload-dropzone.tsx
│   ├── analysis-report.tsx
│   ├── env-var-editor.tsx
│   ├── deploy-progress.tsx
│   ├── deployment-card.tsx
│   └── url-display.tsx
├── prisma/
│   └── schema.prisma
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── .env.example
```

---

## Key Dependencies

```json
{
  "dependencies": {
    "next": "^14.2",
    "react": "^18",
    "typescript": "^5",
    "tailwindcss": "^3.4",
    "@prisma/client": "^5",
    "next-auth": "^5",
    "octokit": "^4",
    "adm-zip": "^0.5",
    "@aws-sdk/client-s3": "^3",
    "zod": "^3"
  },
  "devDependencies": {
    "prisma": "^5",
    "@types/adm-zip": "^0.5"
  }
}
```

---

## API Contract Examples

### POST `/api/upload`

**Request**: `multipart/form-data` with `file` field (ZIP).

**Response** (202 Accepted):
```json
{
  "jobId": "clx9abc123",
  "status": "ANALYZING",
  "message": "Upload received. Analyzing project..."
}
```

### GET `/api/analyze/[jobId]`

**Response** (200):
```json
{
  "jobId": "clx9abc123",
  "status": "success",
  "framework": { "name": "nextjs", "version": "14.2.3", "confidence": 0.98 },
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "envVars": [
    { "key": "DATABASE_URL", "source": ".env.example", "required": true, "value": null, "sensitive": true },
    { "key": "NEXT_PUBLIC_APP_NAME", "source": "code-scan", "required": false, "value": null, "sensitive": false }
  ],
  "warnings": [
    { "code": "NO_LOCKFILE", "severity": "warning", "message": "No lockfile found.", "suggestion": "Run npm install locally and commit package-lock.json." }
  ],
  "deployable": true,
  "fileCount": 247,
  "totalSize": 8432100
}
```

### POST `/api/deploy/[jobId]`

**Request**:
```json
{
  "envVars": {
    "DATABASE_URL": "postgresql://...",
    "NEXT_PUBLIC_APP_NAME": "My App"
  }
}
```

**Response** (202):
```json
{
  "jobId": "clx9abc123",
  "status": "CREATING_REPO",
  "message": "Starting deployment pipeline..."
}
```

### GET `/api/deploy/[jobId]/status`

**Response** (200):
```json
{
  "jobId": "clx9abc123",
  "status": "LIVE",
  "currentStep": "DEPLOYING",
  "steps": [
    { "name": "ANALYZING", "status": "complete", "completedAt": "..." },
    { "name": "CREATING_REPO", "status": "complete", "githubUrl": "https://github.com/user/deployed-my-app-a3f2" },
    { "name": "PUSHING_CODE", "status": "complete" },
    { "name": "CREATING_PROJECT", "status": "complete" },
    { "name": "DEPLOYING", "status": "complete" }
  ],
  "url": "https://deployed-my-app-a3f2.vercel.app",
  "githubUrl": "https://github.com/user/deployed-my-app-a3f2"
}
```