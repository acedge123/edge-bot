# Agent Vault (from SunaFusion repo)

**Source:** `sunafusion-agent-shell` (Supabase Edge Function + migrations).  
This doc consolidates the agent-vault description from that repo: purpose, architecture, API, and schema.

---

## 1. Overview

**Agent Vault** is a Supabase Edge Function that:

- Receives **Composio webhooks** (e.g. new email, triggers), stores them in `agent_learnings`, and enqueues a **job** for the Edge bot worker.
- Exposes a **jobs API** for workers (e.g. OpenClaw) to **claim** and **ack** jobs.
- Provides **repo_map** and **learnings** read/write and **Composio** proxy endpoints, all behind a shared secret.

So: external events → agent-vault → `jobs` + `agent_learnings`; workers poll agent-vault for jobs and process them.

---

## 2. Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌────────────────┐      ┌──────────────┐
│  Composio   │─────▶│   agent-vault    │─────▶│  jobs table    │◀─────│  Mac worker  │
│  (webhook)  │      │  (edge function) │      │  (Supabase)    │      │  (claim→POST │
└─────────────┘      └──────────────────┘      └────────────────┘      │   wake→ack)  │
                              │                                         └──────┬───────┘
                              ▼                                                │
                     ┌──────────────────┐                          POST /hooks/wake
                     │ agent_learnings  │                                       ▼
                     │ (audit/history)  │                           ┌──────────────┐
                     └──────────────────┘                           │   OpenClaw   │
                                                                    │   Gateway    │
                                                                    │ (always-on)  │
                                                                    └──────────────┘
```

- **Composio** sends webhooks to agent-vault (no auth).
- **Agent-vault** writes to `agent_learnings` and inserts a row into `jobs`.
- **Worker** (Mac): polls agent-vault, **claims** one job (`POST /jobs/next`), **POSTs** the job to the OpenClaw Gateway at `POST http://127.0.0.1:18789/hooks/wake` with `{ "text": "<message>", "mode": "now" }`, then **acks** (`POST /jobs/ack`). The worker is not OpenClaw.
- **OpenClaw Gateway** = always-on brain (`openclaw gateway --port 18789`). It receives /hooks/wake and runs the agent/skills. It does **not** pull jobs; the worker pushes the job to it. No webhooks from the internet; only the local worker calls the Gateway.

---

## 3. Base URL and auth

- **Base URL:** Supabase Edge Function URL for `agent-vault`, e.g.  
  `https://<project>.supabase.co/functions/v1/agent-vault`
- **Auth for all endpoints except Composio webhook/setup:**  
  `Authorization: Bearer $AGENT_EDGE_KEY` (shared secret in env `AGENT_EDGE_KEY`).
- **Composio webhook:** `POST .../composio/webhook` — no auth (Composio calls it).
- **Composio setup:** `GET .../composio/setup-webhook` — no Bearer auth (one-time setup).

---

## 4. API reference

Paths are under the base URL; trailing slashes are normalized. All JSON responses use `content-type: application/json; charset=utf-8`. CORS is enabled.

### 4.1 Health

| Method + path   | Auth | Response |
|-----------------|------|----------|
| **GET /health** | Bearer | **200** `{ ok: true, ts: "<ISO timestamp>" }` |

### 4.2 Jobs (for OpenClaw / worker)

| Method + path | Body | Response |
|----------------|------|----------|
| **POST /jobs/next** | `{}` or `{ "agentId": "openclaw-agent" }` | **200** `{ job: { id, type, payload, status, created_at }, payload }` or **204** (no job). Atomically claims one queued job (status → `processing`, `locked_by` = agentId). |
| **POST /jobs/ack** | `{ "jobId": "<uuid>", "status": "done" \| "failed", "error"?: "string" }` | **200** `{ ok: true }`. Marks job done or failed. |

- Implementation: agent-vault calls Supabase RPCs `claim_next_job(p_worker_id)`, `complete_job(p_job_id, p_status, p_last_error)`.

### 4.3 Repo map

| Method + path | Query / body | Response |
|----------------|--------------|----------|
| **GET /repo_map/count** | — | **200** `{ count: <number> }` (RPC `count_repo_map`). |
| **GET /repo_map/get** | `?name=<repo_name>` | **200** `{ data: <row \| null> }`. Single repo by name. |
| **GET /repo_map/search** | `?q=<query>&limit=<n>` (limit 1–50, default 10) | **200** `{ data: [...], count }`. Full-text search via RPC `search_repo_map`. |

### 4.4 Learnings

| Method + path | Query / body | Response |
|----------------|--------------|----------|
| **GET /learnings/search** | `?q=<query>&limit=<n>` (limit 1–50, default 10) | **200** `{ data: [...], count }`. RPC `search_agent_learnings`. |
| **GET /learnings/get** | `?id=<uuid>` | **200** `{ data: <row \| null> }`. Single learning by id. |
| **POST /learnings** | JSON body (see below) | **200** `{ data: { id, learning, category, source, tags, created_at } }`. Inserts into `agent_learnings`. |

**POST /learnings body:** Supports two shapes.

- **Native:** `learning` (required, max 8000 chars), `category`, `source`, `tags` (array), `confidence` (0–1), `metadata`.
- **CGPT-style:** `learning`, `topic` → category, `source`, `repo` → tags, `meta` → metadata.

Validation: `learning` required; category/source/tags length limits.

### 4.5 Composio webhook (no auth)

| Method + path | Body | Response |
|----------------|------|----------|
| **POST /composio/webhook** | Composio v2-style JSON (`type` / `trigger_name`, `data` / `payload`, etc.) | **200** `{ ok: true, learning_id: "<uuid>", job_queued: true \| false }`. Stores trigger in `agent_learnings` (category `composio_trigger`, source `composio_webhook`) and inserts one row into `jobs` (type = trigger name, payload includes `learning_id`, `trigger_name`, `text`, `timestamp`). **400** invalid JSON; **500** DB/config error. |

### 4.6 Composio webhook setup (no Bearer auth)

| Method + path | Response |
|----------------|----------|
| **GET /composio/setup-webhook** | Registers the agent-vault webhook URL with Composio (requires `COMPOSIO_API_KEY`). **200** `{ ok: true, webhook_url, composio_response }` or error. |

### 4.7 Composio proxy (Composio API v3)

All require Bearer auth. Agent-vault forwards to `https://backend.composio.dev/api/v3` with `x-api-key: COMPOSIO_API_KEY`.

| Method + path | Query / body | Response |
|----------------|--------------|----------|
| **GET /composio/toolkits** | Optional `?search=&limit=` | Pass-through to Composio `/toolkits`. |
| **GET /composio/tools** | Optional `?toolkit_slug=&search=&tags=&limit=` | Pass-through to Composio `/tools`. |
| **GET /composio/tools/:slug** | — | Pass-through to Composio `/tools/{slug}`. |
| **POST /composio/tools/execute** | `{ toolSlug, connected_account_id \| connectedAccountId, user_id \| entityId \| userId, arguments, version, text, custom_auth_params \| customAuthParams, allow_tracing \| allowTracing }` | Pass-through to Composio `/tools/execute/{tool_slug}`. |

---

## 5. Jobs table schema (Supabase)

**Source:** `sunafusion-agent-shell/supabase/migrations/20260204014818_*.sql`

| Column      | Type        | Purpose |
|------------|-------------|---------|
| id         | uuid        | Primary key (default `gen_random_uuid()`). |
| type       | text        | Job type (e.g. trigger name, `composio_trigger`). |
| payload    | jsonb       | Job data (e.g. `text`, `learning_id`, `trigger_name`, `timestamp`). |
| status     | text        | One of: `queued`, `processing`, `done`, `failed`. |
| locked_at  | timestamptz | When a worker claimed the job. |
| locked_by  | text        | Worker/agent id (e.g. `openclaw-agent`). |
| attempts   | int         | Default 0. |
| last_error | text        | Error message if failed. |
| created_at | timestamptz | Default `now()`. |
| updated_at | timestamptz | Default `now()`. |

- Index: `idx_jobs_claim` on `(status, created_at)` where `status = 'queued'`.
- RPCs:
  - **claim_next_job(p_worker_id text):** Selects one `queued` job (or one stale `processing` older than 5 minutes), updates to `processing`, sets `locked_at`, `locked_by`, returns the row.
  - **complete_job(p_job_id uuid, p_status text, p_last_error text):** Sets `status` to `done` or `failed` and optional `last_error`.
- RLS: enabled; policy allows all for service role only.

---

## 6. Environment variables (agent-vault)

| Variable | Purpose |
|----------|---------|
| **SUPABASE_URL** | Supabase project URL. |
| **SUPABASE_SERVICE_ROLE_KEY** | Service role for DB and RPCs. |
| **AGENT_EDGE_KEY** | Shared secret for `Authorization: Bearer` on protected routes. |
| **COMPOSIO_API_KEY** | For Composio webhook registration and proxy (optional if not using Composio). |

---

## 7. Where it lives in SunaFusion

- **Edge function:** `sunafusion-agent-shell/supabase/functions/agent-vault/index.ts`
- **Jobs migration:** `sunafusion-agent-shell/supabase/migrations/20260204014818_5b2c5f7f-6a65-47be-af8e-e79ea2de7c77.sql`
- **Plan (jobs integration):** `sunafusion-agent-shell/.lovable/plan.md`

OpenClaw’s use of the jobs API is described in **docs/JOBS_AND_WAKE_REFERENCE.md** and **workspace/HEARTBEAT.md**.

---

## 8. Deploying agent-vault (Supabase Edge Function)

If the **deployed** agent-vault returns 404 for `/jobs/next` or `/jobs/ack` (while the repo code has those routes), the live function is out of date. Redeploy from the SunaFusion repo:

```bash
cd sunafusion-agent-shell
supabase functions deploy agent-vault
```

**Before deploying:**

1. **Supabase CLI** linked to your project (e.g. `supabase link` if not already).
2. **Secrets** set for the function (Dashboard → Edge Functions → agent-vault → Secrets, or CLI):
   - `SUPABASE_URL` — project URL (e.g. `https://<project-ref>.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key
   - `AGENT_EDGE_KEY` — same value as in `~/.openclaw/.env` (Bearer secret for jobs/learnings)
   - `COMPOSIO_API_KEY` — optional, for Composio webhook/proxy

**After deploy:** Worker can call `POST $AGENT_VAULT_URL/agent-vault/jobs/next` (with base = `.../functions/v1`); expect **204** (no job) or **200** (job claimed).
