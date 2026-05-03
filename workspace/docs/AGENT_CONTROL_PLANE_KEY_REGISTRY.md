# Agent control plane — key & env registry (names only)

**Canonical source (humans):** The authoritative registry and architecture narrative live in the TGA **`overall-architecture`** repository (or your org’s equivalent “architecture / platform” repo). Edit naming and trust boundaries there first.

**This copy (agents + operators):** Checked into **edge-bot** under `workspace/docs/` so **hosted OpenClaw** agents and Railway operators can read it from the workspace on every deploy. It may lag the canonical doc.

**Precedence:** If this file and the canonical doc **diverge**, the **canonical** doc wins until someone syncs this copy. Do not treat this file alone as legal/compliance authority.

**Secrets:** Never put secret **values** in this file. Names and routing notes only.

---

## How to update (workflow)

| Step | Who | Action |
|------|-----|--------|
| 1 | Human | Change **canonical** doc in `overall-architecture` when naming or systems change. |
| 2 | Human or CI | **Sync** this file from canonical (or merge intentionally). |
| 3 | Agent (optional) | May append rows or footnotes for **discovered** integrations, **aliases** seen in code, or **missing** envs — use status **`Needs fill-in`**; do **not** promote guesses to **`Canonical`** without human review. |
| 4 | Human | Review agent additions; promote to canonical; then refresh this copy. |

**Agent guardrail:** If uncertain, add a row or note marked **`Needs fill-in`** (or `TBD`) instead of stating unverified facts as settled.

---

## Naming principles (target state)

- **One prefix per system** where possible (e.g. `REPOC_` for Repo C, `ECHELON_` for Echelon edge, `ACP_` for Governance Hub, `OPENCLAW_` for gateway).
- **One bearer per trust domain:** separate **Echelon job runner** credentials from **Agent Vault** credentials even if both are “Supabase”.
- **Deprecate aliases** in code and dashboards over time; document old names in the **Aliases / legacy** column until removed.

---

## Registry (env var names — no values)

| Status | Canonical name (preferred) | Purpose | Used by (typical) | Aliases / legacy (migrate off) |
|--------|------------------------------|---------|-------------------|--------------------------------|
| Synced | `OPENAI_API_KEY` | OpenAI API | OpenClaw gateway | — |
| Synced | `OPENCLAW_GATEWAY_TOKEN` | Gateway HTTP auth | Clients → gateway | — |
| Synced | `OPENCLAW_HOOK_TOKEN` | Webhooks (`/hooks/wake`, etc.) | Workers → gateway | Must differ from `OPENCLAW_GATEWAY_TOKEN` |
| Synced | `OPENCLAW_WORKSPACE` | Workspace root path | Gateway, workers | Default `/app/.openclaw/workspace` on Railway |
| Synced | `OPENCLAW_STATE_DIR` | OpenClaw state dir | Gateway | e.g. `/app/.openclaw` |
| Synced | `PORT` | HTTP listen port | Railway, gateway | — |
| Synced | `ECHELON_EDGE_URL` | Echelon `functions/v1` base | `echelon-agent-worker.mjs` | `ECHELON_URL` (legacy; avoid) |
| Synced | `AGENT_HOSTED_EDGE_KEY` | Bearer for Echelon edge (`agent-next`, `agent-ack`, `slack-reply`) | Hosted worker | Overlaps in name with vault key — see row below |
| Synced | `AGENT_VAULT_URL` | Agent Vault / jobs function base | `jobs-worker.mjs`, learnings | `SUPABASE_EDGE_SECRETS_URL` (legacy) |
| Synced | `AGENT_EDGE_KEY` | Bearer for Agent Vault / jobs | `jobs-worker.mjs` | `SUPABASE_EDGE_SECRETS_AUTH` (legacy) |
| Needs fill-in | `REPOC_SUPABASE_URL` (proposed) | Repo C project URL | `internal-execute` callers | Today: `CIA_URL`, `REPO_C_URL` — **pick one canonical** |
| Needs fill-in | `REPOC_SUPABASE_ANON_KEY` (proposed) | Repo C anon key | Same | Today: `CIA_ANON_KEY`, `REPO_C_ANON_KEY` |
| Needs fill-in | `REPOC_EXECUTOR_SECRET` (proposed) | Bearer for `internal-execute` | Same | Today: `EXECUTOR_SECRET`, `REPO_C_EXECUTOR_SECRET` |
| Synced | `ACP_BASE_URL` | Governance Hub edge base | `governance-runtime` skill | — |
| Synced | `ACP_KERNEL_ID` | Kernel id in payloads | Governance runtime | — |
| Synced | `ACP_KERNEL_KEY` | Kernel bearer (`acp_kernel_…`) | `heartbeat`, `authorize`, `audit-ingest` | — |
| Synced | `TENANT_API_KEY` | Tenant lane (`X-API-Key`) | `whoami`, tenant `policy-propose` | Not for kernel-only endpoints |
| Synced | `SLACK_BOT_TOKEN` | Slack Web API | Echelon `slack-reply` (secrets on Echelon) | Not required on Railway for reply path |
| Synced | `SLACK_SIGNING_SECRET` | Slack Events HMAC | Echelon `slack-inbound` | — |
| Needs fill-in | `SLACK_USER_TOKEN` | Slack user-scope (e.g. search) | Repo C Slack handler (if enabled) | Optional; confirm in Repo C docs |
| Synced | `GITHUB_TOKEN` | Git HTTPS clone/pull | Agent workspace / skills | Fine-grained vs classic |
| Synced | `GOOGLE_MAPS_API_KEY` | Places API (New) | `google-places`, sponsors | — |
| Needs fill-in | `CIQ_PLATFORM_KEY` (proposed) | CIQ Manage router tenant key | CIQ skills | Today often `platform_key` — align naming |
| Synced | `JOBS_POLL_INTERVAL_MS` | Jobs worker poll | `jobs-worker.mjs` | — |
| Synced | `JOBS_WAKE_COOLDOWN_MS` | Cooldown after wake | `jobs-worker.mjs` | — |
| Synced | `ECHELON_POLL_MS` | Echelon worker poll | `echelon-agent-worker.mjs` | — |
| Synced | `ECHELON_COOLDOWN_MS` | Cooldown after job | `echelon-agent-worker.mjs` | — |
| Synced | `WORKER_ID` | `worker_id` for `agent-next` | Echelon worker | — |
| Synced | `GATEWAY_HTTP_URL` | Worker → gateway base | Workers | — |
| Needs fill-in | `CONTROL_UI_ALLOWED_ORIGINS` | Docker build arg for CORS | Railway build | See `deploy/Dockerfile` |

**Optional / advanced:** `OPENCLAW_BIN`, `OPENCLAW_ENV_FILE`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, AWS Roles Anywhere (`RA_*`, `AWS_REGION`) — document in canonical when used.

---

## Delivery idempotency (hosted worker)

Slack/SMS delivery dedupe markers (volume-backed): `workspace/tmp/echelon-delivery/` — see `workspace/scripts/echelon-agent-worker.mjs` and `docs/SLACK_INTEGRATION_PLAN.md`. Summarize in **canonical** architecture if policy requires.

---

## Changelog (this copy)

| Date | Change |
|------|--------|
| (fill) | Initial edge-bot synced copy + agent guardrails. |
