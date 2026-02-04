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
| Execute tool | POST | `/composio/tools/execute` — JSON: toolSlug, entityId, connectedAccountId, arguments (all required for Gmail) |
| Receive triggers (webhook) | POST | `/composio/webhook` — no auth; Composio calls this for new email etc. |

Full reference: `sunafusion-agent-shell/docs/AGENT_VAULT_API.md`.

**Gmail listener (already set up).** When the user asks to "set up a listener for Gmail" or "listen to Gmail": (1) The listener is already configured: Composio sends new-email events to the Agent Vault webhook, which stores them in `agent_learnings` with `category: composio_trigger`. (2) You can use it in two ways: **Right now** — search recent triggers: GET `.../learnings/search?q=composio_trigger+gmail&limit=20` (same base URL and Bearer $AGENT_EDGE_KEY). **Real-time** — a long-lived process must subscribe to Supabase Realtime (see next paragraph). Tell the user the listener is already set up; offer to search recent Gmail triggers or to run the Realtime subscription script. Do not say you cannot set up or use a Gmail listener.

**Receive email triggers (webhook):** Composio webhook URL: `https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/composio/webhook` (Composio Dashboard → Event & Trigger Settings). Incoming events stored as learnings with `category: composio_trigger`. Search: GET `.../learnings/search?q=composio_trigger+gmail`. See full API doc for payload format.

**Real-time updates:** You do **not** need to use consume. A **jobs worker** on the Mac (see `docs/WORKER_DAEMON.md`) polls the Supabase `jobs` table and POSTs to local `/hooks/wake` when Lovable inserts a job (e.g. after a composio_trigger). That wakes you — no consume script needed. Do not suggest or run `npm run consume`; only if the user explicitly has no worker and wants a Realtime subscription, they can run it themselves.

---

## Using Gmail (or other apps) via Composio proxy

You have access to this file (TOOLS.md) and USER.md. Use them. Do not say you cannot access skill files or Gmail docs — the values and body shape are here. To send email you must **run** the request: call your **Exec** (or shell) tool with the curl command below. Do **not** only show the curl in a code block in your reply — that does not send the email. The user cannot run it from the TUI; you must execute it yourself.

Agent Vault proxies to Composio; the Composio API key stays in Supabase. Edge-bot only calls Agent Vault with AGENT_EDGE_KEY.

**Send-email endpoint (use this exact URL — do not use a placeholder like `your-email-endpoint`):**
```
https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/composio/tools/execute
```
Method: POST. Headers: `Authorization: Bearer $AGENT_EDGE_KEY`, `Content-Type: application/json`.

**GMAIL_SEND_EMAIL — required body shape.** You must include **entityId** (User ID) and **connectedAccountId** every time. User ID = Composio User ID in USER.md. The API expects **camelCase** `entityId` (not snake_case `entity_id`). Do not rename the key or the request will fail. Do not omit entityId. Use **arguments.recipient_email** (not `to`), **arguments.subject**, **arguments.body** — not `input`.

**Copy-paste body (replace only recipient_email, subject, body):**
```json
{
  "toolSlug": "GMAIL_SEND_EMAIL",
  "entityId": "pg-test-935d47ab-972f-4269-9a1c-a8eedc87b925",
  "connectedAccountId": "ca_up0kdYOJgr7Y",
  "arguments": {
    "recipient_email": "someone@example.com",
    "subject": "Hello",
    "body": "Email content"
  }
}
```
(entityId = User ID from USER.md. Key name must stay "entityId"; value is Composio User ID.)

**To send email: invoke Exec with this command.** The first part loads AGENT_EDGE_KEY from ~/.openclaw/.env (Exec often does not have it). Replace RECIPIENT, SUBJECT, BODY in the JSON. Do not paste into your reply — run it via Exec.
```
. ~/.openclaw/.env 2>/dev/null || true; curl -s -X POST "https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/composio/tools/execute" -H "Authorization: Bearer $AGENT_EDGE_KEY" -H "Content-Type: application/json" -d '{"toolSlug":"GMAIL_SEND_EMAIL","entityId":"pg-test-935d47ab-972f-4269-9a1c-a8eedc87b925","connectedAccountId":"ca_up0kdYOJgr7Y","arguments":{"recipient_email":"RECIPIENT","subject":"SUBJECT","body":"BODY"}}'
```
Replace RECIPIENT, SUBJECT, BODY. If body has quotes, escape them or use a single-line body. After Exec runs, report the raw response (success or error). If you get "Entity ID" or 401: the token was likely empty — ensure the command starts with `. ~/.openclaw/.env` or `export $(grep -v '^#' ~/.openclaw/.env | xargs)` so AGENT_EDGE_KEY is set.

**Gmail tool slugs (use these exactly — wrong slugs return 404):**
| Action | Correct toolSlug | Wrong (do not use) |
|--------|------------------|---------------------|
| Send email | `GMAIL_SEND_EMAIL` | — |
| Check / fetch emails | `GMAIL_FETCH_EMAILS` | `GMAIL_LIST_MESSAGES` (not found) |

**Check or fetch Gmail:** Use **only** `GMAIL_FETCH_EMAILS`. Do **not** use `GMAIL_LIST_MESSAGES` — it does not exist and returns "Tool not found" (404). Use the **same** User ID (as entityId) and connectedAccountId as for send, or the call can return "unauthorized". Example: `{"toolSlug":"GMAIL_FETCH_EMAILS","entityId":"pg-test-935d47ab-972f-4269-9a1c-a8eedc87b925","connectedAccountId":"ca_up0kdYOJgr7Y","arguments":{"query":"in:inbox","max_results":10}}`. **Always include entityId (User ID) and connectedAccountId for every Composio execute** (send, fetch, draft).

**1. One-time (operator):** Connect Gmail (or other app) in the Composio dashboard/app. After that, Composio holds the OAuth; edge-bot does not handle OAuth.

**2. Discover tools:** e.g. GET `.../composio/toolkits?search=gmail`, GET `.../composio/tools?toolkit_slug=gmail`, GET `.../composio/tools/<slug>` for parameters.

**3. Execute:** POST to the **exact** URL (base + path). Path must be appended to the **agent-vault** base:
- Correct: `https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/composio/tools/execute`
- Wrong: `.../functions/v1/composio/tools/execute` (missing `agent-vault` → Supabase returns "Requested function was not found").
Body: include `entityId` (User ID from USER.md) and connectedAccountId; e.g. `{"toolSlug":"GMAIL_SEND_EMAIL","entityId":"pg-test-935d47ab-972f-4269-9a1c-a8eedc87b925","connectedAccountId":"ca_up0kdYOJgr7Y","arguments":{...}}`. Use AGENT_VAULT_URL or the default base.

**"Requested function was not found":** That error is from Supabase. The first path segment after `/functions/v1/` must be `agent-vault`; do not omit it.

If the user says Gmail isn’t connected, tell them to connect Gmail once in Composio.
