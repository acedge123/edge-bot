# Getting Local Skills & Learnings to Railway

Your hosted agent needs the same capabilities as your local agent. Here's what to do.

## 1. Environment Variables (Required)

Add these to Railway so the agent can access external services:

| Variable | Purpose |
|----------|---------|
| `AGENT_VAULT_URL` | Supabase Edge Function URL for agent-vault (e.g. `https://<project>.supabase.co/functions/v1/agent-vault`) |
| `AGENT_EDGE_KEY` | Bearer token for agent-vault (learnings, contacts, tasks). Same value as in Supabase secrets. |
| `platform_key` | Platform/tenant API key for CIQ Manage API (from signup/onboarding, e.g. `ciq_xxx`). The manage router fetches CIQ credentials server-side — do not use raw CreatorIQ API key. |

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

## 4. Memory Files (Local Only)

`memory/` and `workspace/memory/` are gitignored. They don't deploy.

**Options:**

- **A) Rely on Agent Vault** — If learnings are in Supabase, they're shared. No action.
- **B) Curate into docs** — Copy important learnings into `workspace/docs/` (e.g. `workspace/docs/CIQ_LEARNINGS.md`) and commit. The agent can read these.
- **C) package-runtime.sh** — Run `./deploy/package-runtime.sh` to create `deploy/runtime/` from `~/.openclaw/` (includes skills, memory, identity). Then `deploy/runtime/` would need to be committed — but it's gitignored because it can contain secrets. **Not recommended** for Railway Git deploy.

## 5. Quick Checklist

| Item | Action |
|------|--------|
| AGENT_VAULT_URL | Set in Railway (your agent-vault Supabase URL) |
| AGENT_EDGE_KEY | Set in Railway (same as Supabase agent-vault secret) |
| platform_key | Set in Railway (platform key from signup/onboarding) |
| Learnings | Already in Supabase — agent queries via agent-learnings |
| Skills | Already in repo — deploy automatically |
| CIQ how-to | Add `workspace/docs/CIQ_LEARNINGS.md` if you want extra context |

## 6. Verify

After deploy, send a message like "Find a creator who likes fitness and add to a list" in the Hosted Agent UI. If the agent can query learnings and use CIQ, it should work. If not, check Railway logs for missing env vars or auth errors.
