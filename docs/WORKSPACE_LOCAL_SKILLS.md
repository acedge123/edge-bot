# Workspace-local skills: where they live and how the agent finds them

## The issue

If the agent only sees **built-in** OpenClaw skills (e.g. `healthcheck`, `skill-creator` under `/usr/local/lib/node_modules/openclaw/skills/`) and reports **no workspace-local skills**, OpenClaw’s **workspace directory** is either missing the `skills/` tree or pointing at a different path than this repo’s workspace.

## Where workspace-local skills live in this repo

In the **edge-bot** repo, all workspace-local skills are under:

- **`workspace/skills/`** (relative to the repo root)

Each skill has a `SKILL.md` and supporting files, for example:

- `workspace/skills/secure-gmail/` — Gmail via Composio
- `workspace/skills/ciq-manage-api/` — CIQ Manage API
- `workspace/skills/ciq-automations/` — CIQ Automations
- `workspace/skills/agentic-control-plane/` — ACP kit
- `workspace/skills/cursor-agent/`, `workspace/skills/brave-search/`, `workspace/skills/slack/`, `workspace/skills/supabase/`, etc.

So the path OpenClaw needs to see is: **`<workspace-root>/skills/`** with those directories and their `SKILL.md` files.

## How OpenClaw resolves the workspace

- OpenClaw uses a **state directory** (e.g. `~/.openclaw` or `OPENCLAW_STATE_DIR`).
- The **workspace** is the **`workspace/`** subdirectory of that state dir (e.g. `~/.openclaw/workspace` or `/root/.openclaw/workspace`).
- Workspace-local skills are loaded from **`<state-dir>/workspace/skills/`**.

So if the state dir is `/root/.openclaw`, OpenClaw looks for skills in **`/root/.openclaw/workspace/skills/`**. If that path doesn’t exist or is empty, the agent will only see built-in skills.

## Fix: make the agent see workspace-local skills

You need the **workspace directory** (e.g. `/root/.openclaw/workspace`) to contain the **`skills/`** tree from this repo (and optionally the rest of the repo’s workspace files).

### Option A — Copy this repo’s `workspace/skills` into OpenClaw’s workspace

From the machine where OpenClaw runs (and where you have or can clone the edge-bot repo):

```bash
# Set OpenClaw’s workspace dir (adjust if your state dir is different)
OPENCLAW_WORKSPACE="/root/.openclaw/workspace"
REPO_WORKSPACE="/path/to/edge-bot/workspace"

# Create skills dir and copy
mkdir -p "$OPENCLAW_WORKSPACE/skills"
cp -r "$REPO_WORKSPACE/skills/"* "$OPENCLAW_WORKSPACE/skills/"
```

Then restart the gateway (e.g. `openclaw gateway restart` or restart your process). The agent should now see workspace-local skills.

### Option B — Copy the entire repo workspace

If you prefer the OpenClaw workspace to match the repo’s workspace (CONFIG.md, HEARTBEAT.md, scripts, docs, etc.):

```bash
OPENCLAW_WORKSPACE="/root/.openclaw/workspace"
REPO_WORKSPACE="/path/to/edge-bot/workspace"

# Backup existing workspace if you care about AGENTS.md, IDENTITY.md, etc.
# Then copy repo workspace over (or merge manually)
cp -r "$REPO_WORKSPACE/"* "$OPENCLAW_WORKSPACE/"
```

Again, restart the gateway after updating files.

### Option C — Symlink `skills` (if you have the repo on the same host)

```bash
OPENCLAW_WORKSPACE="/root/.openclaw/workspace"
REPO_WORKSPACE="/path/to/edge-bot/workspace"

mkdir -p "$OPENCLAW_WORKSPACE"
ln -sfn "$REPO_WORKSPACE/skills" "$OPENCLAW_WORKSPACE/skills"
```

Restart the gateway so it picks up the symlinked `skills/`.

## Docker / Railway

When you build the image with this repo’s **Dockerfile**, the repo’s **`workspace/`** (including **`workspace/skills/`**) is copied into the image at **`/app/.openclaw/workspace/`**. So inside the container:

- Workspace root = **`/app/.openclaw/workspace/`**
- Skills = **`/app/.openclaw/workspace/skills/`**

If you were checking **`/root/.openclaw/workspace`**, that is a different path (e.g. host or another install). In the Docker image produced by this repo, use **`/app/.openclaw/workspace/`** and you should see **`skills/`** there.

## Verify

- List workspace contents:  
  `ls -la /root/.openclaw/workspace/`  
  You should see a **`skills/`** directory.
- List skills:  
  `ls -la /root/.openclaw/workspace/skills/`  
  You should see subdirs like `secure-gmail`, `ciq-manage-api`, etc., each with a **`SKILL.md`**.
- If OpenClaw provides a CLI:  
  `openclaw skills list`  
  (or similar) and check that workspace skills appear.

## Summary

| What you want | Where it lives |
|---------------|----------------|
| Workspace-local skills in this repo | **`workspace/skills/`** (repo root) |
| Where OpenClaw looks (e.g. state dir `~/.openclaw`) | **`~/.openclaw/workspace/skills/`** (or `/root/.openclaw/workspace/skills/`) |
| In Docker image from this repo | **`/app/.openclaw/workspace/skills/`** |

Copy or symlink the repo’s **`workspace/skills/`** into OpenClaw’s **workspace** directory so that path exists and contains the skill folders; then restart the gateway so the agent can find workspace-local skills.
