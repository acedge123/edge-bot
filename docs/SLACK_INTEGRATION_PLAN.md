# Slack Agent Channel — Implementation Plan

> **Single source of truth** for the Slack ↔ Agent integration across Echelon (Lovable/Supabase), Railway (edge-bot), and Slack App configuration.

---

## Architecture

```
User types in Slack (channel or DM)
  → Slack Event Subscription POST → slack-inbound edge function (Echelon)
  → Verify Slack Signing Secret (HMAC-SHA256)
  → Insert agent_jobs row (metadata.source = "slack")
  → Railway worker polls agent-next, claims job (unchanged)
  → Worker sends to OpenClaw gateway, gets response
  → Worker checks job.metadata.source === "slack"
  → Worker calls slack-reply edge function (Echelon) with reply text + Slack coordinates
  → slack-reply calls Slack chat.postMessage (SLACK_BOT_TOKEN)
  → Worker acks job via agent-ack (unchanged)
```

---

## 1. Echelon (Lovable / Supabase Edge Functions)

### 1.1 New Edge Function: `slack-inbound`

**File:** `supabase/functions/slack-inbound/index.ts`
**Config:** `verify_jwt = false` (Slack can't send JWTs)
**Auth:** HMAC-SHA256 verification using `SLACK_SIGNING_SECRET`

**Responsibilities:**

1. **URL Verification Challenge** — When Slack sends `{ type: "url_verification", challenge: "..." }`, return `{ challenge }` immediately. This happens once during Event Subscription setup.

2. **Request Verification** — Validate every request using Slack's signing secret:
   ```
   sig_basestring = "v0:" + timestamp + ":" + raw_body
   expected = "v0=" + HMAC-SHA256(SLACK_SIGNING_SECRET, sig_basestring)
   Compare against X-Slack-Signature header
   Reject if timestamp is > 5 minutes old
   ```

3. **Filter noise:**
   - Ignore `X-Slack-Retry-Num` header (Slack retries if no 200 within 3s; we always return 200 immediately)
   - Ignore events where `event.bot_id` is present (don't respond to ourselves)
   - Ignore `event.subtype` (message edits, deletes, etc.)
   - Only process `event.type === "message"` with no subtype

4. **Tenant mapping (v1):**
   - Default all Slack jobs to tenant `__sandbox__`
   - Future: lookup table `slack_workspace_id + channel_id → tenant_id`

5. **Actor ID:**
   - Derive deterministically: UUID v5 from `slack:{team_id}:{user_id}` (same pattern as SMS `deriveActorId`)

6. **Insert `agent_jobs`:**
   ```json
   {
     "tenant_id": "__sandbox__",
     "actor_id": "<derived-uuid>",
     "request_text": "<message text>",
     "status": "queued",
     "metadata": {
       "source": "slack",
       "slack_channel": "<channel_id>",
       "slack_thread_ts": "<thread_ts or ts>",
       "slack_user": "<user_id>",
       "slack_team": "<team_id>"
     }
   }
   ```

7. **Return 200 immediately** — Slack requires response within 3 seconds.

### 1.2 New Edge Function: `slack-reply`

**File:** `supabase/functions/slack-reply/index.ts`
**Config:** `verify_jwt = false`
**Auth:** Bearer `AGENT_HOSTED_EDGE_KEY` (same as agent-next/agent-ack)

**Called by:** Railway worker after agent generates a response for a Slack-origin job.

**Request body:**
```json
{
  "job_id": "<uuid>",
  "text": "Agent response text",
  "slack_channel": "<channel_id>",
  "slack_thread_ts": "<thread_ts>"
}
```

**Behavior:**
1. Validate bearer token against `AGENT_HOSTED_EDGE_KEY`
2. Call Slack `chat.postMessage`:
   ```
   POST https://slack.com/api/chat.postMessage
   Authorization: Bearer SLACK_BOT_TOKEN
   Content-Type: application/json

   {
     "channel": "<slack_channel>",
     "text": "<agent response>",
     "thread_ts": "<slack_thread_ts>"  // reply in thread
   }
   ```
3. Return `{ ok: true }` or `{ ok: false, error: "..." }` so the worker can decide whether to ack

### 1.3 Update `agent-next`

**File:** `supabase/functions/agent-next/index.ts`

**Change:** Include `metadata` in the job response payload so the worker knows the source and has reply coordinates.

```diff
  return jsonResponse({
    ok: true,
    job: {
      id: job.id,
      tenant_id: job.tenant_id,
      actor_id: job.actor_id,
      text: job.request_text,
+     metadata: job.metadata,
    },
  }, 200);
```

### 1.4 Config Updates

**File:** `supabase/config.toml`

```toml
[functions.slack-inbound]
verify_jwt = false

[functions.slack-reply]
verify_jwt = false
```

---

## 2. Railway (edge-bot) — Changes for Cursor

### 2.1 No Changes to Job Polling

The worker already polls `agent-next` and processes jobs. The only change is that `agent-next` now returns `metadata` in the job object.

### 2.2 Reply Path Update

**File:** `workspace/scripts/echelon-agent-worker.mjs` (or equivalent)

After the agent generates a response, before or alongside acking:

```javascript
// After getting agent response...
if (job.metadata?.source === "slack") {
  const replyRes = await fetch(`${ECHELON_URL}/functions/v1/slack-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.AGENT_HOSTED_EDGE_KEY}`,
    },
    body: JSON.stringify({
      job_id: job.id,
      text: agentResponse,
      slack_channel: job.metadata.slack_channel,
      slack_thread_ts: job.metadata.slack_thread_ts,
    }),
  });

  if (!replyRes.ok) {
    console.error("Failed to post Slack reply:", await replyRes.text());
  }
}

// Then ack the job via agent-ack as normal
```

**Note:** On Railway the worker uses `AGENT_HOSTED_EDGE_KEY` (same value as in Echelon secrets for agent-next/agent-ack/slack-reply).

### 2.3 Session Key for Slack

For conversation memory/context, use a Slack-specific session key:

```
agent:main:slack:${job.tenant_id}:${job.metadata.slack_user}
```

This keeps Slack conversations separate from web UI conversations for the same tenant.

### 2.4 No New Env Vars on Railway

The Slack bot token lives in Echelon (Supabase secrets). The worker calls `slack-reply` which holds the token. The worker only needs its existing `AGENT_HOSTED_EDGE_KEY` and Echelon URL.

### 2.5 Agent must not use Slack skill for delivery (worker-owned delivery)

For Slack-origin jobs the **worker** delivers the reply via slack-reply. The agent must **not** call the Slack skill or `message.send` to post the response — that would fail (e.g. "Unknown target U… for slack") or double-send. Agent-side instructions are set in **workspace/CONFIG.md** and **workspace/skills/slack/SKILL.md**: for sessions with key `agent:main:slack:*`, the agent responds with plain text only and does not invoke the Slack tool for delivery.

---

## 3. Slack App Configuration (Your Action Items)

### 3.1 Event Subscriptions

1. Go to [TGA AI Bot app settings](https://api.slack.com/apps) → **Event Subscriptions**
2. Enable Events: **On**
3. Request URL: `https://yczomejrvihbmydyraqg.supabase.co/functions/v1/slack-inbound`
4. Slack will send a challenge request; the edge function handles it automatically

### 3.2 Subscribe to Bot Events

Add these bot events:
- `message.channels` — messages in public channels the bot is in
- `message.im` — direct messages to the bot
- `message.groups` — (optional) messages in private channels

### 3.3 Required Bot Token Scopes

Ensure the bot has these OAuth scopes (most should already be present):
- `chat:write` — post messages
- `channels:history` — read public channel messages (for events)
- `im:history` — read DM messages (for events)
- `groups:history` — (optional) read private channel messages

### 3.4 Reinstall App

After adding new events/scopes, reinstall the app to the workspace.

### 3.5 Provide Secrets to Echelon

| Secret | Where to Find | Purpose |
|--------|---------------|---------|
| `SLACK_SIGNING_SECRET` | App Settings → Basic Information → App Credentials → Signing Secret | Verify inbound webhooks |
| `SLACK_BOT_TOKEN` | App Settings → OAuth & Permissions → Bot User OAuth Token (`xoxb-...`) | Post replies via chat.postMessage |

---

## 4. Secrets Summary

| Secret | Stored In | Purpose |
|--------|-----------|---------|
| `SLACK_SIGNING_SECRET` | Echelon (Supabase) | HMAC verification of Slack event payloads |
| `SLACK_BOT_TOKEN` | Echelon (Supabase) | Slack API calls (chat.postMessage) |
| `AGENT_HOSTED_EDGE_KEY` | Both (already exists) | Auth between Railway worker ↔ Echelon edge functions |

---

## 5. Files Changed

| File | Repo | Action |
|------|------|--------|
| `docs/SLACK_INTEGRATION_PLAN.md` | edge-bot | This document (single source of truth) |
| `supabase/functions/slack-inbound/index.ts` | Echelon | Create — receive Slack events |
| `supabase/functions/slack-reply/index.ts` | Echelon | Create — post replies to Slack |
| `supabase/functions/agent-next/index.ts` | Echelon | Edit — include `metadata` in response |
| `supabase/config.toml` | Echelon | Edit — add both new functions |
| `workspace/scripts/echelon-agent-worker.mjs` | edge-bot (Railway) | Edit — add Slack reply path after agent response |

---

## 6. Order of Operations

| Step | Who | Action |
|------|-----|--------|
| 1 | Echelon (Lovable) | Create `slack-inbound`, `slack-reply` edge functions. Update `agent-next`. Deploy. |
| 2 | You | Add `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` as Echelon secrets. |
| 3 | You | Configure Slack Event Subscriptions with the `slack-inbound` URL. Subscribe to bot events. Reinstall app. |
| 4 | Railway (Cursor) | Update worker to check `job.metadata.source === "slack"` and call `slack-reply`. Deploy. |
| 5 | You | Invite TGA AI Bot to a channel or DM it. Send a message and verify end-to-end flow. |

---

## 7. Future Enhancements

- **Multi-tenant mapping:** Table to map `slack_team + channel → tenant_id`
- **Thread context:** Pass thread history to agent for multi-turn conversations
- **Rich formatting:** Convert agent markdown to Slack Block Kit
- **Reactions:** Add 👀 reaction when job is claimed, ✅ when complete
- **Error handling:** DM the user if the agent fails
