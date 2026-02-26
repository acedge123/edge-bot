# OpenClaw Hosted Deployment (Railway / Docker)

Package the OpenClaw gateway + runtime for hosted deployment so Codex (or any agent) can deploy it to Railway.

## What Gets Packaged

| Source | Destination | Excluded |
|-------|-------------|----------|
| `~/.openclaw/` | `deploy/runtime/` | `.env`, credentials, logs, media |
| `workspace/` | `deploy/runtime/workspace/` | (from repo) |
| — | Secrets | Injected via Railway env vars at runtime |

## Prerequisites

1. **Local OpenClaw** running with `~/.openclaw/` populated
2. **package-runtime.sh** run once to generate `deploy/runtime/`

## Build & Deploy

### 1. Package runtime (one-time or when config changes)

```bash
cd /Users/edgetbot/OpenClaw_Github
chmod +x deploy/package-runtime.sh
./deploy/package-runtime.sh
```

### 2. Docker build (local test)

```bash
docker build -f deploy/Dockerfile -t openclaw-gateway .
docker run -p 18789:18789 \
  -e OPENCLAW_GATEWAY_TOKEN=xxx \
  -e OPENAI_API_KEY=xxx \
  openclaw-gateway
```

### 3. Railway deploy

```bash
railway link   # or create new project
railway up
```

Set env vars in Railway dashboard: `OPENCLAW_GATEWAY_TOKEN`, `OPENAI_API_KEY`, `AGENT_VAULT_URL`, `AGENT_EDGE_KEY`, `OPENCLAW_HOOK_TOKEN`, etc.

## Required Env Vars (Railway)

| Variable | Purpose |
|----------|---------|
| `OPENCLAW_GATEWAY_TOKEN` | Webhook/auth token (generate: `openssl rand -hex 24`) |
| `OPENAI_API_KEY` | OpenAI API key (default model: gpt-5.2) |
| `ANTHROPIC_API_KEY` | Claude API key; only if you override to use Claude |
| `OPENROUTER_API_KEY` | Optional; if using OpenRouter |
| `AGENT_VAULT_URL` | Supabase Edge Functions base (for jobs worker) |
| `AGENT_EDGE_KEY` | Bearer token for agent-vault |
| `OPENCLAW_HOOK_TOKEN` | Same as `OPENCLAW_GATEWAY_TOKEN` (for /hooks/wake) |

Add any other keys from your `~/.openclaw/.env` as needed.

## For Codex

This folder is in the repo. Codex can:

1. Run `./deploy/package-runtime.sh` (if it has access to `~/.openclaw/`)
2. Or use a pre-packaged `deploy/runtime/` if committed (ensure no secrets)
3. Run `docker build -f deploy/Dockerfile .` from repo root
4. Deploy via `railway up` or Railway dashboard

**Note:** `deploy/runtime/` is gitignored (contains user config). Run `package-runtime.sh` before every Docker build. For CI/Codex: the script can run in a job that has access to `~/.openclaw/`, or you can commit a sanitized runtime template.
