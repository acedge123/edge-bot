# Railway runtime layout (edge-bot)

**Purpose:** Single place in git for **non-secret** production facts (volumes, mount paths, domains) so humans and agents do not have to infer hosting from code alone.

**Railway does not put volumes in `railway.json`.** This file is **manually maintained**. Update it whenever you change volumes, mount paths, domains, or service topology.

---

## Production snapshot (edit when infra changes)

| Field | Value |
|--------|--------|
| **Last verified** | `YYYY-MM-DD` ← set when you confirm below in the Railway dashboard |
| **Railway project** | *(dashboard project name, optional)* |
| **Service name** | *(e.g. edge-bot gateway service)* |
| **Environment** | `production` / `preview` / other |
| **Persistent volume** | Yes — attached to this service |
| **Volume mount path** | `/app/.openclaw/workspace` *(expected by `deploy/entrypoint.sh` for durable `MEMORY.md`, `SOUL.md`, `workspace/cron/`, cloned `repos/`; **confirm** under Service → Volumes)* |
| **Volume label (Railway UI)** | *(optional; helps humans find the volume)* |
| **Public URL(s)** | *(Railway-generated or custom domain; no secrets)* |

If your mount path is **not** `/app/.openclaw/workspace`, document the actual path here and note any repo changes required (`entrypoint.sh`, skills that hardcode paths).

---

## What lives in-repo vs Railway

| In this repo | Only in Railway |
|----------------|-----------------|
| `railway.json` — Dockerfile path, replicas, restart policy | Volume **creation** and **mount path** |
| `deploy/Dockerfile`, `deploy/entrypoint.sh` | Env **values** (secrets) |
| **Docker build arg** `CONTROL_UI_ALLOWED_ORIGINS` (optional) | If unset at build, Dockerfile **defaults** to `https://edge-bot-production.up.railway.app`. Set in **Railway → Service → Settings → Build → Docker Build Args** for each clone so Control UI CORS matches that service’s public HTTPS URL. |
| `deploy/RAILWAY_SKILLS_AND_LEARNINGS.md` — patterns and env **names** | Custom domains, TCP proxies |

---

## How to refresh this file

1. Open [Railway](https://railway.app) → project → service.
2. **Volumes:** confirm mount path and that the volume is attached to the same service that runs `deploy/entrypoint.sh`.
3. **Networking / Domains:** note the canonical HTTPS host agents and users hit.
4. Set **Last verified** to today’s date.

Optional CLI after `railway link` from this repo: `railway status` (service context). Volumes are still easiest to verify in the UI.

---

## For AI agents

- **Persistence:** If **Volume mount path** above is `/app/.openclaw/workspace` (or another documented path that backs the OpenClaw workspace), treat **`MEMORY.md`**, **`SOUL.md`**, **`workspace/cron/`**, and **cloned repos** under that tree as **durable across redeploys** unless the user says otherwise.
- **Secrets:** Never expect env values in this file; use env var **names** from `deploy/RAILWAY_SKILLS_AND_LEARNINGS.md` or service docs.

---

## Snippet for agent memory (copy-paste)

Use this (or a shortened variant) in **MEMORY.md**, Agent Vault, or “remember this” so the hosted agent models its environment correctly. Refresh when the **Production snapshot** table above changes.

```text
Hosted runtime (edge-bot / OpenClaw on Railway): I run in a Docker container built from this repo’s deploy/Dockerfile. OpenClaw state dir is /app/.openclaw; the agent workspace is /app/.openclaw/workspace. A Railway persistent volume is mounted on that workspace path, so MEMORY.md, SOUL.md, workspace/cron/, and repos cloned under the workspace survive redeploys. Secrets (API keys, tokens) come from Railway env vars, not from files in git. Ephemeral paths outside the volume (e.g. other dirs under /app) reset on new containers. Canonical infra details: deploy/RAILWAY_RUNTIME.md in-repo.
```
