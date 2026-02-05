# When a new email arrives → OpenClaw knows (step-by-step)

Manual "check email" works. To have OpenClaw **notified when a new email arrives**, use this flow:

**Flow:** New email → Composio sends webhook → agent-vault (Supabase) stores it and adds a **job** → a small **worker** on your Mac polls for jobs and POSTs to OpenClaw Gateway → OpenClaw wakes and can check email.

---

## What you need

1. **Agent-vault** deployed (Supabase Edge Function) with the `jobs` table and Composio webhook handler.  
   - If you use the sunafusion Supabase project, this may already be deployed.  
   - You need the **agent-vault URL** (e.g. `https://xxxx.supabase.co/functions/v1/agent-vault`) and an **AGENT_EDGE_KEY** (shared secret) set in the Edge Function secrets.

2. **Composio** configured to send webhooks to that URL when a new Gmail message arrives.

3. **Worker** on your Mac: reads from `~/.openclaw/.env` the same two vars (`AGENT_VAULT_URL`, `AGENT_EDGE_KEY`), polls agent-vault for jobs, and POSTs to `http://127.0.0.1:18789/hooks/wake`.

---

## Step 1: Get your agent-vault URL and key

- **URL:** Your Supabase project → Edge Functions → `agent-vault` → copy the invoke URL.  
  It looks like: `https://<project-ref>.supabase.co/functions/v1/agent-vault`
- **Key:** In Supabase Edge Function secrets (or env), set `AGENT_EDGE_KEY` to a long random string. Use that same value in `~/.openclaw/.env` (see Step 3).

If agent-vault isn’t deployed yet, you’ll need to deploy the function and run the `jobs` migration from the sunafusion-agent-shell repo first.

---

## Step 2: Point Composio at agent-vault

1. In **Composio** (app.composio.dev), open the place where you configure **webhooks** or **triggers**.
2. Add a webhook URL:  
   `https://<your-project>.supabase.co/functions/v1/agent-vault/composio/webhook`  
   (use your real agent-vault base URL + `/composio/webhook`).
3. Create a **trigger** for “new Gmail message” (or equivalent) that sends events to this webhook.

When a new email arrives, Composio will POST to that URL; agent-vault will store the event and insert a row into `jobs`.

---

## Step 3: Put URL, keys, and hook token in OpenClaw env

In `~/.openclaw/.env` add (or edit):

```
AGENT_VAULT_URL=https://<your-project>.supabase.co/functions/v1/agent-vault
AGENT_EDGE_KEY=<the-same-secret-you-set-in-supabase>
OPENCLAW_HOOK_TOKEN=<same-value-as-hooks.token-in-openclaw-config>
```

No quotes needed. Save the file.

**Important:** If the worker gets **405** when POSTing to the gateway, webhooks are not enabled or the token is missing. In your OpenClaw config (e.g. `~/.openclaw/openclaw.json`), set `hooks.enabled: true` and `hooks.token: "some-secret"`, and use that same value for `OPENCLAW_HOOK_TOKEN`.

---

## Step 4: Run the worker on your Mac

The worker is the only thing that should call your OpenClaw Gateway. It polls for jobs and POSTs to `/hooks/wake`.

From your repo (so the path to the script is correct):

```bash
cd /Users/edgetbot/OpenClaw_Github
node workspace/scripts/jobs-worker.mjs
```

Leave this running (or run it with pm2/launchd as in WORKER_DAEMON.md). It will:

- Poll agent-vault every few seconds.
- When a job appears (e.g. new email), claim it and POST to `http://127.0.0.1:18789/hooks/wake` with a short message like “New Composio trigger (GMAIL_…). Check latest…”
- OpenClaw will wake and can then use the secure-gmail skill to check/fetch emails.

---

## Step 5: Test

1. Make sure the **gateway** is running (e.g. `openclaw gateway --port 18789`).
2. Make sure the **worker** is running (Step 4).
3. Send yourself an email (or trigger a new message in the connected Gmail account).
4. Within a few seconds the worker should claim the job and wake OpenClaw; OpenClaw can then follow the wake message and check emails with the secure-gmail skill.

---

## Troubleshooting

- **Worker says “Missing AGENT_VAULT_URL or AGENT_EDGE_KEY”**  
  Add both to `~/.openclaw/.env` and run the worker again.

- **Worker runs but OpenClaw never wakes**  
  Run: `node workspace/scripts/jobs-worker.mjs --check`  
  If it prints `jobs/next: 204 (no job)`, no job is in the queue — confirm Composio is sending the webhook to agent-vault and that agent-vault is writing to the `jobs` table.

- **Composio webhook not reaching agent-vault**  
  Check Supabase Edge Function logs and that the webhook URL is exactly:  
  `https://<project>.supabase.co/functions/v1/agent-vault/composio/webhook`
