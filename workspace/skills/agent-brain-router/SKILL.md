---
name: agent-brain-router
description: "Call the hosted Agent Brain internal HTTP API (structured /v1/recommend or messy-text /v1/intake-recommend). Use when Slack/Railway agents need regime recommendations from the TGA cognitive router without cloning agent-brain."
---

# Agent Brain router (hosted HTTP)

**AB-41.** The **agent-brain** service exposes internal, bearer-authenticated JSON endpoints (see `agent-brain` repo: `docs/api/router-recommend-v1.yaml`, `src/server/README.md`). This skill documents how **edge-bot** (and other hosted agents) should call them.

## When to use this skill vs local `agent-brain` code

| Situation | Use |
|-----------|-----|
| Hosted OpenClaw on Railway; no `agent-brain` checkout | **This skill** + env `AGENT_BRAIN_URL` / `AGENT_BRAIN_BEARER_TOKEN` + script below |
| Implementing or changing scoring, ingestion, or HTTP handlers | **Clone `repos/agent-brain`** and edit there; redeploy the Agent Brain Railway service separately |
| Quick local experiment | Run `agent-brain` locally (`npm run serve:router-recommend:v1`) and point `AGENT_BRAIN_URL` at `http://127.0.0.1:7399` |

## Environment variables (Railway / container)

| Variable | Required | Purpose |
|----------|----------|---------|
| `AGENT_BRAIN_URL` | Yes for hosted calls | Base URL only, e.g. `https://<router-service>.up.railway.app` (no path suffix). |
| `AGENT_BRAIN_BEARER_TOKEN` | Yes in production | Same shared secret as `ROUTER_RECOMMEND_BEARER_TOKEN` on the Agent Brain service. |
| `AGENT_BRAIN_TRACE_ID` | No | Optional `X-Trace-Id` for correlation; server generates one if omitted. |

**Do not** commit tokens. Set secrets in Railway for the **edge-bot** service (consumer), not in skill text.

## Endpoints (v1)

- **`POST /v1/recommend`** — Caller sends full **terrain** dimensions + `problem_summary` (structured contract, AB-24/25).
- **`POST /v1/intake-recommend`** — Caller sends **messy** `problem_summary` (+ optional `context`, `signals[]`); service runs ingestion then recommendation (**AB-40**).

Both require `Content-Type: application/json` and `Authorization: Bearer <token>` unless the brain service is running with local-only unauthenticated bypass (not for production).

## Script (smoke / manual calls)

From the OpenClaw workspace root inside the container (typically `/app/.openclaw/workspace`):

```bash
# Intake (messy text) — body JSON on stdin
echo '{"problem_summary":"CI fails intermittently; flaky harness vs regression?"}' | \
  node scripts/agent-brain-router.mjs intake

# Structured recommend — body JSON on stdin
node scripts/agent-brain-router.mjs recommend < /path/to/request.json
```

Or pass a file path:

```bash
node scripts/agent-brain-router.mjs intake --file /tmp/body.json
```

## Deploy / sync

- **Skills** ship in the Docker image from `workspace/skills/` (see `deploy/Dockerfile`).
- **`deploy/entrypoint.sh`** copies `workspace/skills/` from the baked image into the mounted workspace on boot so redeploys pick up new skills (see `deploy/RAILWAY_SKILLS_AND_LEARNINGS.md`).

After adding or changing this skill, **rebuild and redeploy edge-bot** so the image includes the updates.

## Failure modes

- **401** — Wrong or missing bearer token on the brain service.
- **503** — Brain service misconfigured (e.g. missing `ROUTER_RECOMMEND_BEARER_TOKEN` when auth is required).
- **Connection errors** — `AGENT_BRAIN_URL` wrong, service down, or Railway networking; fix URL or wait for deploy.

## Contract source of truth

OpenAPI in **agent-brain**: `docs/api/router-recommend-v1.yaml`. Prefer that file over paraphrasing field names here.
