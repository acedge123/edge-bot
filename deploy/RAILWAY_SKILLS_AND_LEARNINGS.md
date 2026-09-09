# Getting Local Skills & Learnings to Railway

Your hosted agent needs the same capabilities as your local agent. Here's what to do.

**Production topology (volumes, mount paths, domains):** maintain **[`RAILWAY_RUNTIME.md`](./RAILWAY_RUNTIME.md)** so agents and teammates do not assume ephemeral disk. Railway volumes are not expressed in `railway.json`.

## 1. Environment Variables (Required)

Add these to Railway so the agent can access external services:

| Variable | Purpose |
|----------|---------|
| `AGENT_VAULT_URL` | Supabase Edge Function URL for agent-vault (e.g. `https://<project>.supabase.co/functions/v1/agent-vault`) |
| `AGENT_EDGE_KEY` | Bearer token for agent-vault (learnings, contacts, tasks). Same value as in Supabase secrets. |
| `platform_key` | Platform/tenant API key for CIQ Manage API (from signup/onboarding, e.g. `ciq_xxx`). The manage router fetches CIQ credentials server-side — do not use raw CreatorIQ API key. |
| `GITHUB_TOKEN` | Optional. GitHub PAT (or machine-user token) with read access to repos the agent should clone/pull. See **docs/GITHUB_ACCESS_FOR_AGENT.md**. |
| `GOOGLE_MAPS_API_KEY` | Optional. **Places API (New)** for **`google-places`** / **`sponsors-database`** skills (venue search, sponsor enrichment). |

**Note:** `AGENT_EDGE_KEY` is for Agent Vault (learnings). `AGENT_HOSTED_EDGE_KEY` is for Echelon (agent-next/agent-ack). They can be different.

## 2. Skills in the Repo

**Workspace skills** (`workspace/skills/`) are already in the repo and deploy with the image:

- `agent-learnings` — posts learnings to Agent Vault (needs AGENT_VAULT_URL, AGENT_EDGE_KEY)
- `ciq-manage-api` — CIQ Manage API reference (needs platform_key)
- `agentic-control-plane`, `echelon-signup`, `leadscoring` — etc.

These are copied by the Dockerfile. No extra steps unless you add new skills.

## 3. Learnings (Agent Vault)

Your learnings about "how to use CIQ Automations" are likely in **Supabase `agent_learnings`** (Agent Vault). If you set `AGENT_VAULT_URL` and `AGENT_EDGE_KEY` in Railway, the agent can query them via the agent-learnings skill.

No need to copy files — learnings are already in Supabase.

## 4. Redeploys wipe the filesystem (important)

**By default, a Railway redeploy replaces the container.** The new container starts from the image — any files the agent wrote at runtime (e.g. `MEMORY.md`, `memory/*`, cloned `repos/`, workspace edits) are **gone** on paths that are **not** backed by a volume.

**This deployment uses a persistent Railway volume** for the OpenClaw workspace path — see **[`RAILWAY_RUNTIME.md`](./RAILWAY_RUNTIME.md)** for the canonical mount path and last-verified date. Without a volume (or if the mount path differs), treat disk as ephemeral.

- **Ephemeral (default):** Agent can write files and clone repos; they exist until the next redeploy (or container restart, depending on Railway’s behavior).
- **Durable memory:** Use **Agent Vault** (Supabase) so learnings persist regardless of redeploys, or attach a Railway volume to the workspace path if you want on-disk memory to survive redeploys.

## 5. Memory Files (Local Only)

`memory/` and `workspace/memory/` are gitignored. They don't deploy.

**Options:**

- **A) Rely on Agent Vault** — If learnings are in Supabase, they're shared. No action.
- **B) Curate into docs** — Copy important learnings into `workspace/docs/` (e.g. `workspace/docs/CIQ_LEARNINGS.md`) and commit. The agent can read these.
- **C) package-runtime.sh** — Run `./deploy/package-runtime.sh` to create `deploy/runtime/` from `~/.openclaw/` (includes skills, memory, identity). Then `deploy/runtime/` would need to be committed — but it's gitignored because it can contain secrets. **Not recommended** for Railway Git deploy.

## 6. Quick Checklist

| Item | Action |
|------|--------|
| AGENT_VAULT_URL | Set in Railway (your agent-vault Supabase URL) |
| AGENT_EDGE_KEY | Set in Railway (same as Supabase agent-vault secret) |
| platform_key | Set in Railway (platform key from signup/onboarding) |
| Learnings | Already in Supabase — agent queries via agent-learnings |
| Skills | Already in repo — deploy automatically |
| CIQ how-to | Add `workspace/docs/CIQ_LEARNINGS.md` if you want extra context |

## 7. Verify

After deploy, send a message like "Find a creator who likes fitness and add to a list" in the Hosted Agent UI. If the agent can query learnings and use CIQ, it should work. If not, check Railway logs for missing env vars or auth errors.

## 8. OpenClaw gateway cron (why it disappears on redeploy)

**What you observed is expected** if cron jobs live only in the container’s OpenClaw state dir (`/app/.openclaw/cron/`, often `jobs.json`).

- **Ephemeral disk:** Each Railway redeploy starts a **new** container from the image. Anything written under `/app/.openclaw` **except** what is on a **persistent volume** is reset.
- **Repo does not ship cron by default:** `.gitignore` excludes `cron/` under the workspace; `deploy/runtime-template/` has **no** cron bundle. The Docker image only includes cron if `deploy/package-runtime.sh` copied it from your laptop’s `~/.openclaw/cron` **and** that folder was present in `deploy/runtime/` at build time (and `deploy/runtime/` itself is usually not committed).
- **Entrypoint** (`deploy/entrypoint.sh`) re-syncs workspace `scripts/` and `skills/` from the image **and** ensures **`/app/.openclaw/cron` → `/app/.openclaw/workspace/cron`** (symlink) so OpenClaw’s scheduler reads `jobs.json` from the **volume-backed** `workspace/cron/` directory. Without that symlink, a workspace-only volume leaves the canonical **`cron/`** on ephemeral disk and jobs disappear on redeploy.

**Ways to make cron “permanent”**

| Approach | Behavior |
|----------|----------|
| **Workspace volume + entrypoint symlink (this repo)** | Mount the volume on **`/app/.openclaw/workspace`**. `entrypoint.sh` creates `workspace/cron` and symlinks **`${OPENCLAW_STATE_DIR}/cron`** → **`workspace/cron`** on every boot. |
| **Railway volume on `/app/.openclaw`** | Entire state tree on disk; cron survives without a symlink. Heavier migration if you started with workspace-only. |
| **Version cron in the image** | Check in a **template** under the repo (e.g. extend `deploy/runtime-template/` or a new `deploy/openclaw-cron/` tree) and **COPY** it in the Dockerfile into `/app/.openclaw/cron/` after the runtime copy. Rebuild on every job change. (Confirm exact filenames with your OpenClaw version.) |
| **External scheduler** | GitHub Actions `schedule`, Railway’s cron add-on, or another service **POSTs** to your gateway (e.g. wake/hook) on a cadence. No dependency on OpenClaw’s internal `cron list`. |

**Docs vs reality:** Notes in `MEMORY.md` or `HEARTBEAT.md` that cite a specific cron **job id** are often **stale** after a new container or empty cron. Prefer describing the **intended schedule and payload** in committed docs, not UUIDs that change per environment.

**Relation to memory:** Pre-compaction flush (`openclaw-mem`) is **not** cron; it runs around session compaction. Daily “save memory” still needs one of: internal OpenClaw cron (persistent as above), external cron, or reliance on **Agent Vault** for durable facts so disk cron is less critical.

## 9. Troubleshooting common log messages

| Log | Cause | What to do |
|-----|--------|------------|
| **Gateway binding to non-loopback** | Expected on Railway (must bind 0.0.0.0). | Ignore if auth (e.g. token) is configured. |
| **Timeout waiting for agent response** | Agent took >5 min (e.g. tool failures, slow model, or blocked on missing curl/python). | Ensure Docker image has `curl` and `python3` (see Dockerfile). If the agent is trying to read paths like `repos/api-docs-template/…`, those repos may not exist in the container — agent should use workspace paths only. |
| **read failed: … /app/.opencl/workspace/…** | Typo: path uses `.opencl` instead of `.openclaw`. | Fix any skill or memory that references `.opencl`. Workspace path in the container is `/app/.openclaw/workspace`. |
| **curl: not found** / **python3: not found** | Agent ran a tool that uses curl or Python; base image didn’t include them. | The Dockerfile now installs `curl` and `python3`. Redeploy so the new image is used. |
| **agent-next 502** | Echelon (Supabase) edge function returned Bad Gateway. | Transient or Echelon-side. Retry; check Supabase function logs and health. |
