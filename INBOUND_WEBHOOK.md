# Inbound Webhook for Edge-Bot (Lovable / Supabase)

This doc tells the Supabase/Agent Vault side **how to notify edge-bot** when a new Composio trigger is stored (e.g. new email). Edge-bot uses OpenClaw’s built-in webhook; Supabase can either (A) POST to the webhook (gateway must be public), or (B) insert into the jobs table so the Mac worker picks it up (recommended for local gateway). See docs/JOBS_SCHEMA.sql and docs/WORKER_DAEMON.md for B.

---

## 1. When to call

After your Edge Function (or DB trigger) **inserts a row** into `agent_learnings` with `category = 'composio_trigger'` (e.g. after receiving the Composio webhook and storing the event), **POST once** to the edge-bot webhook URL below. That wakes the agent so it can react without polling.

---

## 2. Base URL

The OpenClaw gateway must be **reachable from the internet** for Supabase to call it (e.g. public URL or tunnel).

- **Operator provides:** The actual base URL (e.g. `https://edge-bot.example.com` or a tunnel URL like `https://xxxx.trycloudflare.com`) and the **hook token** (see below).
- **Default path:** `/hooks` (configurable in OpenClaw as `hooks.path`).
- **Full URL examples:**  
  `https://YOUR_GATEWAY_PUBLIC_URL/hooks/wake`  
  or  
  `https://YOUR_GATEWAY_PUBLIC_URL/hooks/agent`

If the gateway is only on loopback (`http://127.0.0.1:18789`), Supabase cannot reach it; the operator must expose it (e.g. Funnel, Cloudflare Tunnel, or a deployed gateway).

---

## 3. Headers

Every request **must** include:

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <HOOK_TOKEN>` |
| `Content-Type` | `application/json` |

**Alternative auth header (same token):** `x-openclaw-token: <HOOK_TOKEN>`

**HOOK_TOKEN:** From the edge-bot operator. It is the value of `hooks.token` in OpenClaw config (`openclaw.json`). Store it in Supabase secrets (e.g. `EDGE_BOT_WEBHOOK_TOKEN`) and use it in the Edge Function when calling this webhook. Do not log or expose the token.

---

## 4. Endpoints and body

### Option A: `POST /hooks/wake` (simple wake)

Triggers an immediate heartbeat; the agent will run its normal checklist (e.g. HEARTBEAT.md) and can then check learnings or email.

**URL:** `{BASE_URL}/hooks/wake`  
**Body:**

```json
{
  "text": "New Composio trigger received (e.g. new email). Check latest composio_trigger learnings.",
  "mode": "now"
}
```

- `text` (required): Short description for the agent.
- `mode`: `"now"` = trigger immediately (use this). `"next-heartbeat"` = wait for next scheduled heartbeat.

**Response:** `200` on success; `401` if token missing/invalid; `400` on invalid payload.

---

### Option B: `POST /hooks/agent` (direct prompt)

Runs one agent turn with a specific prompt, then posts a summary to the main session. Use this if you want the agent to do a specific thing (e.g. “summarize the new email”) instead of a generic heartbeat.

**URL:** `{BASE_URL}/hooks/agent`  
**Body:**

```json
{
  "message": "A new Composio trigger was just stored (e.g. new email). Check the latest learnings (GET .../learnings/search?q=composio_trigger+gmail&limit=5) and summarize or act as needed.",
  "name": "ComposioTrigger",
  "wakeMode": "now"
}
```

- `message` (required): The prompt the agent will run on.
- `name` (optional): Human-readable label (e.g. `"ComposioTrigger"`).
- `wakeMode`: `"now"` for immediate run.

**Response:** `202` (async run started); `401` if token missing/invalid; `400` on invalid payload.

---

## 5. Example (Supabase Edge Function)

After you insert into `agent_learnings`:

```js
const EDGE_BOT_WEBHOOK_URL = Deno.env.get('EDGE_BOT_WEBHOOK_URL');   // e.g. https://your-gateway.com/hooks/wake
const EDGE_BOT_WEBHOOK_TOKEN = Deno.env.get('EDGE_BOT_WEBHOOK_TOKEN');

if (EDGE_BOT_WEBHOOK_URL && EDGE_BOT_WEBHOOK_TOKEN) {
  await fetch(EDGE_BOT_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EDGE_BOT_WEBHOOK_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: 'New Composio trigger received (e.g. new email). Check latest composio_trigger learnings.',
      mode: 'now',
    }),
  });
}
```

Use **Option A** URL for `/hooks/wake` or **Option B** URL and body for `/hooks/agent`. Store `EDGE_BOT_WEBHOOK_URL` and `EDGE_BOT_WEBHOOK_TOKEN` in Supabase (secrets / env) and get the values from the edge-bot operator.

---

## 6. Summary for Lovable

| What | Value |
|------|--------|
| **URL** | `{BASE_URL}/hooks/wake` or `{BASE_URL}/hooks/agent` (BASE_URL from operator) |
| **Method** | POST |
| **Headers** | `Authorization: Bearer <HOOK_TOKEN>`, `Content-Type: application/json` |
| **Body (wake)** | `{ "text": "New Composio trigger received...", "mode": "now" }` |
| **Body (agent)** | `{ "message": "A new Composio trigger was just stored...", "name": "ComposioTrigger", "wakeMode": "now" }` |
| **Token** | From operator (`hooks.token` in OpenClaw); store in Supabase secrets |
