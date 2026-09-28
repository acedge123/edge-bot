# Portfolio Research API Wrapper

Edge Bot writes portfolio mandates, research artifacts, watchlists, backtests,
and paper trades to the Lovable UI through the versioned Research Lab API.

## Contract

- Source repository: `acedge123/portfolio-progress-pilot`
- Source document: `docs/AGENT_RESEARCH_API.md`
- Base variable: `AGENT_API_BASE`
- Default base: `https://vqucicshrmzjlsxzqylx.supabase.co/functions/v1/agent-api/v1`
- Credential: `PORTFOLIO_AGENT_API_KEY`
- Header: `x-agent-api-key`
- Helper: `workspace/scripts/portfolio-research-api.mjs`
- Skill: `workspace/skills/portfolio-research-api/SKILL.md`

The API writes the records displayed by the UI. It does not require a browser,
Lovable integration, Supabase user session, anon key, or direct PostgREST call.
`docs/AGENT_API_ACCESS.md` in the source repository is an older direct-auth
approach and is not the route Edge Bot should use.

All orders are paper-only. Both the helper and server reject live execution
flags. The backend isolates agent-owned rows from the human user's portfolios.

## Upgrade protection

OpenClaw upgrades must preserve the workspace skill, helper, Railway variable
names, source-repository freshness step, and model-level acceptance test. A
generic Supabase or Lovable integration is not a compatible replacement.
