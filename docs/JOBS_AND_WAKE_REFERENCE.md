# Jobs + Wake: Single Reference (canonical)

**This doc is the single source of truth** for the queue-and-wake flow. Everything else (WORKER_DAEMON.md, CONFIG.md, worker script) should stay in sync with this.

---

## 1. Architecture (one sentence each)

| Role | What it does |
|------|----------------|
| **Supabase `jobs` table** | Source of truth. Rows with `status = 'queued'`. |
| **Lovable / Agent Vault** | Inserts a row into `jobs` when e.g. a new email/composio trigger is stored. |
| **Worker** (Mac) | Polls for any queued job; if any, **pokes** OpenClaw via CLI (no payload). Then cooldown. |
| **OpenClaw** | On poke, **pulls** one job (via agent-vault or Supabase), processes it, acks it. |

- Worker **never** sends the job payload. OpenClaw **always** pulls (jobs/next or claim_next_job).
- **Poke is CLI only.** The process on `:18789` is the Control UI; it does **not** expose an HTTP webhook wake. Use `openclaw system event --mode now --text "new job queued"`.

---

## 2. Worker (what it does and how to run)

**Script:** `workspace/scripts/jobs-worker.mjs`

**Behaviour:**
1. Poll Supabase: any row in `jobs` with `status = 'queued'`? (read-only, no claim.)
2. If yes: run `openclaw system event --text "new job queued" --mode now --url ws://127.0.0.1:18789` (and `--token` if set). Then sleep cooldown (default 30s).
3. If no: sleep poll interval (default 4s). Repeat.

**Env** (e.g. in `~/.openclaw/.env`; worker loads it automatically):

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Read `jobs` table |
| `OPENCLAW_CLI_PATH` | Default `/opt/homebrew/bin/openclaw` |
| `OPENCLAW_GATEWAY_URL` | Default `ws://127.0.0.1:18789` |
| `OPENCLAW_GATEWAY_TOKEN` or `OPENCLAW_HOOK_TOKEN` | Optional; passed as `--token` to CLI |
| `JOBS_POLL_INTERVAL_MS` | Default 4000 |
| `JOBS_WAKE_COOLDOWN_MS` | Default 30000 |

**Run as daemon:** See **docs/WORKER_DAEMON.md** (launchd or pm2).

---

## 3. OpenClaw rule (event text → pull jobs)

When the **system event text** is **"new job queued"** or **"check for jobs"**:

1. **Claim:** `POST $AGENT_VAULT_URL/jobs/next` with `Authorization: Bearer $AGENT_EDGE_KEY`, body `{}` or `{ "agentId": "openclaw-agent" }`.
2. If response is **204** → no job; stop.
3. If response is **200** with `{ job, payload }` → **process** the job (e.g. read `payload.text`, check learnings), then **ack:** `POST $AGENT_VAULT_URL/jobs/ack` with `{ "jobId": "<id>", "status": "done" }` or `{ "jobId": "<id>", "status": "failed", "error": "..." }`.
4. Optionally repeat from step 1 until 204 (or do one job per wake).

Implement this in HEARTBEAT, a skill, or the handler that runs on system event.

---

## 4. Agent-vault API (contract)

Base URL: your Supabase Edge Function URL for `agent-vault` (e.g. `https://<project>.supabase.co/functions/v1/agent-vault`). Auth: `Authorization: Bearer $AGENT_EDGE_KEY`.

| Method + path | Body | Response |
|----------------|------|----------|
| **POST /jobs/next** | `{}` or `{ "agentId": "openclaw-agent" }` | **200** `{ job: { id, type, payload, status, created_at }, payload }` or **204** (no job). Claims one queued job (moves to processing). |
| **POST /jobs/ack** | `{ "jobId": "<uuid>", "status": "done" \| "failed", "error"?: "string" }` | **200** `{ ok: true }`. Marks job done or failed. |

Implemented in: `sunafusion-agent-shell/supabase/functions/agent-vault/index.ts` (calls Supabase RPCs `claim_next_job`, `complete_job`).

---

## 5. Supabase (jobs schema)

- Table: `public.jobs` (id, type, payload, status, locked_at, locked_by, ...). Status one of: queued, processing, done, failed.
- RPCs: `claim_next_job(p_worker_id text)`, `complete_job(p_job_id uuid, p_status text, p_last_error text)`.
- Migration: `sunafusion-agent-shell/supabase/migrations/` (search for `jobs`).

---

## 6. Verify

- **Poke works:** Run `openclaw system event --mode now --text "new job queued"`. OpenClaw should reply (e.g. "ok"). If it does but no job is pulled, wire the event text to the rule in §3.
- **Worker running:** `launchctl list | grep openclaw` or `pm2 list`; logs: `/tmp/openclaw-worker.log` and `.err`.

---

## 7. Where else things are mentioned (keep in sync)

- **WORKER_DAEMON.md** – How to run the worker (launchd/pm2); points here for architecture and contract.
- **workspace/CONFIG.md** – Short “when you receive new job queued” steps for the agent; must match §3.
- **workspace/scripts/jobs-worker.mjs** – Inline comments; must match §2.

When in doubt, **this file (JOBS_AND_WAKE_REFERENCE.md) wins.**
