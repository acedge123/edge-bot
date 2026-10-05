---
name: portfolio-research-api
description: "Read and update the Portfolio Research Lab and its Lovable UI through the paper-trading agent API. Use for portfolio mandates, configurations, research, screens, backtests, watchlists, notes, reports, alerts, and simulated orders."
---

# Portfolio Research API

Use this skill whenever the user refers to the equity portfolio, Research Lab,
portfolio mandate, rebalance, paper orders, or the Lovable portfolio UI.

The UI reads the same backend records written by this API. Do not ask for a
Lovable project URL, browser session, Supabase user session, anon key, or direct
database access.

## Canonical route

- Base: `$AGENT_API_BASE`
- Safe default when unset:
  `https://vqucicshrmzjlsxzqylx.supabase.co/functions/v1/agent-api/v1`
- Authentication: `x-agent-api-key` from `PORTFOLIO_AGENT_API_KEY`
- Helper: `/app/.openclaw/workspace/scripts/portfolio-research-api.mjs`
- Source contract:
  `/app/.openclaw/workspace/repos/portfolio-progress-pilot/docs/AGENT_RESEARCH_API.md`

The helper owns authentication. Never print or manually interpolate the key.

## Required workflow

1. Refresh the source repository before relying on its instructions:

```bash
node /app/.openclaw/workspace/scripts/github-via-owner.mjs pull \
  acedge123/portfolio-progress-pilot \
  /app/.openclaw/workspace/repos/portfolio-progress-pilot
```

2. Read `docs/AGENT_RESEARCH_API.md` when route schemas or fields matter.
3. Read current state before mutation:

```bash
node /app/.openclaw/workspace/scripts/portfolio-research-api.mjs get /agent/config
node /app/.openclaw/workspace/scripts/portfolio-research-api.mjs get /agent/portfolio
node /app/.openclaw/workspace/scripts/portfolio-research-api.mjs get /agent/positions
```

4. For a write, create a JSON request file in the workspace and invoke the
   allowlisted route through the helper. Example:

```bash
node /app/.openclaw/workspace/scripts/portfolio-research-api.mjs post \
  /agent/config --body-file /app/.openclaw/workspace/tmp/portfolio-config.json
```

5. Read the affected resource back and report the API result, version/id, and
   any missing data or rejected constraints.

## Important distinctions

- `docs/AGENT_RESEARCH_API.md` is the current API contract.
- `docs/AGENT_API_ACCESS.md` describes an older direct Supabase Auth/PostgREST
  route. Do not use it when the versioned `agent-api/v1` endpoint is available.
- There is no proxy-attribution header in the current implementation.
- The backend uses its own server-side Supabase identity and RLS boundaries.
- This is paper trading only. Never request or imply live execution. The helper
  and server both reject live or real-money flags.

## Completion behavior

Do not stop after saying that you found the endpoint or will proceed. Execute
the requested read/write workflow, verify the resulting backend state, and
return the completed result. If the API rejects a request, report its exact
status and error code without inventing a missing browser or login requirement.
