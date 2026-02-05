# Jobs + Wake: Single Reference (canonical)

> **Preferred path:** If your goal is a **secure, working** OpenClaw setup (Gmail, etc.) without fighting env and workers, use **[docs/SECURE_OPENCLAW_COMPOSIO.md](SECURE_OPENCLAW_COMPOSIO.md)** and the Composio blog instead. This jobs/wake flow is optional and has been brittle (env loading, worker not running).

**This doc is the single source of truth** for the queue-and-wake flow. Everything else (WORKER_DAEMON.md, CONFIG.md, worker script) should stay in sync with this.

---

## 1. Mental model

- **OpenClaw Gateway** = the always-on brain. It runs 24/7 (`openclaw gateway --port 18789`). Channels, sessions, agent, hooks, memory, skills. It does **not** poll or pull jobs. It waits for messages over HTTP/WebSocket.
- **Worker** = a small script (Node or Python) you run with pm2 or launchd. It is the only thing that talks to Supabase and the only thing that should call the Gateway. **The worker is not OpenClaw.**

You do **not** loop `openclaw agent` from bash. The Gateway is already running; the worker just POSTs to it.

---

## 2. Architecture

```
Email / Composio → Supabase Edge → inbox_messages / agent_learnings
                         ↓
                    jobs (queued)
                         ↓
              Mac worker (polls every ~2s)
                         ↓
              POST /hooks/wake → OpenClaw Gateway (localhost)
                         ↓
              OpenClaw runs skills / agent
```

- **No webhooks from the internet.** No Funnel. No inbound ports. No 405s.
- **Supabase never calls the Gateway.** Only your Mac worker does.
- **/hooks/wake is local-only by design.** OpenClaw expects trusted local callers.

| Role | What it does |
|------|----------------|
| **Supabase `jobs` table** | Source of truth. Rows with `status = 'queued'`. |
| **Agent Vault / Lovable** | Inserts a row into `jobs` when e.g. new email or Composio trigger is stored. |
| **Worker** (Mac) | Polls agent-vault (or jobs table), **claims one job**, **POSTs it to the Gateway** at `POST http://127.0.0.1:18789/hooks/wake`, then **marks job done**. |
| **OpenClaw Gateway** | Receives POST /hooks/wake; runs agent/skills with the payload. Sits there waiting. Does not pull jobs. |

---

## 3. What runs on the Mac

**Always on (the brain):**

```bash
openclaw gateway --port 18789
```

**Daemon (the pulse):**

The worker script, e.g. `workspace/scripts/jobs-worker.mjs`, run with pm2 or launchd. It is a small loop:

1. **Claim** one job (via agent-vault `POST /jobs/next` or Supabase RPC).
2. **POST** the job to the Gateway: `POST http://127.0.0.1:18789/hooks/wake` with body `{ "text": "<job message>", "mode": "now" }`.
3. **Mark job done** (via agent-vault `POST /jobs/ack` or Supabase `complete_job`).
4. Repeat. Polling every 2 seconds is fine. No Realtime required.

---

## 4. The endpoint you need: POST /hooks/wake

**If you get 405 Method Not Allowed:** OpenClaw webhooks must be **enabled** and every request must include the **hook token**. Do both:

1. **Enable webhooks in OpenClaw config** (e.g. `~/.openclaw/openclaw.json` or wherever your gateway config lives). Add or set:
   ```json
   "hooks": {
     "enabled": true,
     "token": "your-secret-string",
     "path": "/hooks"
   }
   ```
2. **Use the same token in the worker:** In `~/.openclaw/.env` set:
   ```
   OPENCLAW_HOOK_TOKEN=your-secret-string
   ```
   The worker sends it as `Authorization: Bearer <token>` on every POST to `/hooks/wake`. Without this, the gateway can return 405 or 401.

The Gateway exposes:

```http
POST http://127.0.0.1:18789/hooks/wake
Content-Type: application/json

{
  "text": "New email from inbox_messages id=123",
  "mode": "now"
}
```

That’s the whole bridge. The worker builds `text` from the job payload (e.g. `job.payload.text` or a one-line summary), POSTs it, then acks the job.

**Example (curl):**

```bash
curl -X POST http://127.0.0.1:18789/hooks/wake \
  -H "Content-Type: application/json" \
  -d '{"text": "New email from inbox_messages id=123", "mode": "now"}'
```

---

## 5. Worker (what it does and how to run)

**Script:** `workspace/scripts/jobs-worker.mjs` (run from the OpenClaw_Github repo root, e.g. `cd /path/to/OpenClaw_Github && node workspace/scripts/jobs-worker.mjs`)

**Behaviour:**

1. **Claim** one job: `POST $AGENT_VAULT_URL/jobs/next` with `Authorization: Bearer $AGENT_EDGE_KEY`. If **204** → no job; sleep poll interval; repeat.
2. If **200** with `{ job, payload }`: build wake text (e.g. `payload.text` or `payload.summary`).
3. **POST** to Gateway: `POST $GATEWAY_HTTP_URL/hooks/wake` with `{ "text": "<that message>", "mode": "now" }`.
4. **Ack** the job: `POST $AGENT_VAULT_URL/jobs/ack` with `{ "jobId": "<id>", "status": "done" }` (or `"failed"` and `error` on POST failure).
5. Loop. Poll interval ~2s when no job; no long cooldown needed.

**Env** (e.g. in `~/.openclaw/.env`):

| Variable | Purpose |
|----------|---------|
| `AGENT_VAULT_URL` | Supabase Edge Function URL for agent-vault (e.g. `https://<project>.supabase.co/functions/v1/agent-vault`) |
| `AGENT_EDGE_KEY` | Bearer token for agent-vault (jobs/next, jobs/ack) |
| `GATEWAY_HTTP_URL` | Gateway base URL (default `http://127.0.0.1:18789`) for POST /hooks/wake |
| `OPENCLAW_HOOK_TOKEN` | **Required.** Same as `hooks.token` in OpenClaw config; sent as `Authorization: Bearer` |
| `JOBS_POLL_INTERVAL_MS` | Default 2000 |

**Run as daemon:** See **docs/WORKER_DAEMON.md** (launchd or pm2).

---

## 6. OpenClaw (Gateway) side

When the Gateway receives `POST /hooks/wake` with `{ "text": "...", "mode": "now" }`, it runs the agent/skills with that context. The agent does **not** call jobs/next or jobs/ack — the worker already claimed and will ack. The agent’s job is to process the message (e.g. summarize for user, run skills). Workspace **HEARTBEAT.md** / **CONFIG.md** can describe what to do when woken with a given kind of text (e.g. “New email …” → summarize).

---

## 7. Agent-vault API (contract)

Base URL: `$AGENT_VAULT_URL`. Auth: `Authorization: Bearer $AGENT_EDGE_KEY`.

| Method + path | Body | Response |
|----------------|------|----------|
| **POST /jobs/next** | `{}` or `{ "agentId": "openclaw-worker" }` | **200** `{ job: { id, type, payload, status, created_at }, payload }` or **204** (no job). Claims one queued job. |
| **POST /jobs/ack** | `{ "jobId": "<uuid>", "status": "done" \| "failed", "error"?: "string" }` | **200** `{ ok: true }`. Marks job done or failed. |

Implemented in: `sunafusion-agent-shell/supabase/functions/agent-vault/index.ts`.

---

## 8. Supabase (jobs schema)

- Table: `public.jobs` (id, type, payload, status, locked_at, locked_by, ...). Status: queued, processing, done, failed.
- RPCs: `claim_next_job(p_worker_id text)`, `complete_job(p_job_id uuid, p_status text, p_last_error text)`.
- Migration: `sunafusion-agent-shell/supabase/migrations/` (search for `jobs`).

---

## 9. Verify

- **Gateway running:** `openclaw gateway --port 18789` is up. `curl -X POST http://127.0.0.1:18789/hooks/wake -H "Content-Type: application/json" -d '{"text":"test","mode":"now"}'` returns 200.
- **Worker running:** `launchctl list | grep openclaw` or `pm2 list`; logs: `/tmp/openclaw-worker.log` and `.err`.

---

## 10. Where else things are mentioned (keep in sync)

- **WORKER_DAEMON.md** – How to run the worker (launchd/pm2); points here for architecture and contract.
- **workspace/CONFIG.md** – Short “when you receive a wake” steps for the agent; no jobs/next in agent.
- **workspace/scripts/jobs-worker.mjs** – Inline comments; must match §5.
- **docs/AGENT_VAULT.md** – Agent-vault API and schema; architecture updated so worker POSTs to Gateway.

When in doubt, **this file (JOBS_AND_WAKE_REFERENCE.md) wins.**
