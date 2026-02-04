# Receiving Emails via Triggers in Edge Function

## Checking Gmail (fetch messages)
Use tool slug **GMAIL_FETCH_EMAILS** only. Do **not** use GMAIL_LIST_MESSAGES — it does not exist (404 Tool not found). See TOOLS.md for full body (entityId = User ID, connectedAccountId, arguments.query, arguments.max_results).

## Gmail listener (user asks "set up a listener for Gmail")
The Gmail listener is **already set up**. Composio → Agent Vault webhook → stored in `agent_learnings` with `category: composio_trigger`. Lovable also inserts into the `jobs` table; a **worker** on the Mac (see `docs/WORKER_DAEMON.md`) polls jobs and POSTs to local `/hooks/wake`, so you wake without polling. You do **not** need to run consume — the worker handles push. (1) **Search recent triggers:** GET `.../learnings/search?q=composio_trigger+gmail&limit=20` (Bearer $AGENT_EDGE_KEY). (2) When the worker wakes you, follow HEARTBEAT.md. Do not suggest or run `npm run consume`. Do not say you cannot set up or use a Gmail listener.

## Overview
The Edge Function is configured to receive emails through specific triggers (Composio → webhook → `agent_learnings`). Edge-bot can then get updates by polling learnings or by subscribing to Supabase Realtime.

### Implementation Steps
1. **Set up the Hook**: In Composio Dashboard → Event & Trigger Settings, set Webhook URL to `https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/composio/webhook`.
2. **Define Action**: When an email is received, Composio posts to the webhook; the Edge Function stores it in `agent_learnings` with `category: composio_trigger`.
3. **Authorization**: Edge Function and Composio are already configured; no extra auth for the webhook (Composio calls it).
4. **Testing**: Send a test email; then search learnings (`GET .../learnings/search?q=composio_trigger+gmail`) or use Realtime (below).

## What edge-bot does when the inbound webhook fires
When Supabase calls the OpenClaw webhook (after storing a new composio_trigger), the agent is woken. You must: (1) **Fetch** the latest composio_trigger learnings (GET `.../learnings/search?q=composio_trigger+gmail&limit=5` with Bearer $AGENT_EDGE_KEY). (2) **Summarize** the new trigger(s) for the user (e.g. new email from X, subject Y). (3) **Act** if appropriate (e.g. notify, reply, or say what you found); otherwise acknowledge. See HEARTBEAT.md for the same steps when woken by the webhook.

## How edge-bot should subscribe (real-time updates)
Instead of polling, edge-bot can subscribe to **Supabase Realtime** for instant push when new triggers arrive:
- **Project URL:** `https://nljlsqgldgmxlbylqazg.supabase.co`
- **Table:** `public.agent_learnings`
- **Event:** `INSERT`
- **Filter:** `category=eq.composio_trigger`
- **Key:** Use `SUPABASE_ANON_KEY` or service role key (env); do not use AGENT_EDGE_KEY for Realtime.

Full JS/Python examples and connection handling: `sunafusion-agent-shell/docs/AGENT_VAULT_API.md` → "Realtime Subscriptions".
