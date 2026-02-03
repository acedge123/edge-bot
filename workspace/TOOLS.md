input-guard = "is this input safe?"; safe-exec = "run this in a safer way."

---

## Supabase Edge Function – secrets proxy (optional)

Only use this if the operator has set `SUPABASE_EDGE_SECRETS_URL` and `SUPABASE_EDGE_SECRETS_AUTH` in `~/.openclaw/.env`. If those are not set, do not use this section; use the **Agent Vault API** below instead. Do not use SUPABASE_EDGE_SECRETS_URL for Agent Vault—that is a different, optional proxy.

---

## Agent Vault API (institutional memory + Composio proxy)

Primary Supabase API for this agent: repo metadata, learnings, and Composio tools (e.g. Gmail). Use this for all vault and Composio access.

- **Base URL:** Use `$AGENT_VAULT_URL` if set in env; otherwise use this default:
  `https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault`
- **Auth:** `Authorization: Bearer $AGENT_EDGE_KEY` (required in `~/.openclaw/.env`)

**You do NOT need SUPABASE_EDGE_SECRETS_URL for Agent Vault.** Only AGENT_EDGE_KEY is required. Optionally set AGENT_VAULT_URL in .env if you want to override the default URL above.

**Health check (use this URL pattern):**
```bash
# If AGENT_VAULT_URL is set:
curl -s -H "Authorization: Bearer $AGENT_EDGE_KEY" "$AGENT_VAULT_URL/health"
# If not set, use the default base URL:
curl -s -H "Authorization: Bearer $AGENT_EDGE_KEY" "https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/health"
```

**Main endpoints (append to base URL):**

| What | Method | Path |
|------|--------|------|
| Health check | GET | `/health` |
| Repo count | GET | `/repo_map/count` |
| Get repo by name | GET | `/repo_map/get?name=<repo_name>` |
| Search repos | GET | `/repo_map/search?q=<query>&limit=10` |
| Search learnings | GET | `/learnings/search?q=<query>&limit=10` |
| Add learning | POST | `/learnings` — JSON: learning, category, source, tags, confidence |
| List toolkits | GET | `/composio/toolkits?search=<optional>` |
| List tools | GET | `/composio/tools?toolkit_slug=<optional>` |
| Tool details | GET | `/composio/tools/<slug>` |
| Execute tool | POST | `/composio/tools/execute` — JSON: toolSlug, input |

Full reference: `sunafusion-agent-shell/docs/AGENT_VAULT_API.md`.

---

## Using Gmail (or other apps) via Composio proxy

Agent Vault proxies to Composio; the Composio API key stays in Supabase. Edge-bot only calls Agent Vault with AGENT_EDGE_KEY.

**Send-email endpoint (use this exact URL — do not use a placeholder like `your-email-endpoint`):**
```
https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/composio/tools/execute
```
Method: POST. Headers: `Authorization: Bearer $AGENT_EDGE_KEY`, `Content-Type: application/json`. Body: `{"toolSlug":"GMAIL_SEND_EMAIL","input":{"to":"...","subject":"...","body":"..."}}`.

**1. One-time (operator):** Connect Gmail (or other app) in the Composio dashboard/app. After that, Composio holds the OAuth; edge-bot does not handle OAuth.

**2. Discover tools:** e.g. GET `.../composio/toolkits?search=gmail`, GET `.../composio/tools?toolkit_slug=gmail`, GET `.../composio/tools/<slug>` for parameters.

**3. Execute:** POST to the **exact** URL (base + path). Path must be appended to the **agent-vault** base:
- Correct: `https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/composio/tools/execute`
- Wrong: `.../functions/v1/composio/tools/execute` (missing `agent-vault` → Supabase returns "Requested function was not found").
Body: `{"toolSlug":"GMAIL_SEND_EMAIL","input":{...}}`. Use AGENT_VAULT_URL or the default base.

**"Requested function was not found":** That error is from Supabase. The first path segment after `/functions/v1/` must be `agent-vault`; do not omit it.

If the user says Gmail isn’t connected, tell them to connect Gmail once in Composio.
