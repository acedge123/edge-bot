---
name: tga-crm-manage
description: Call the TGA CRM “manage” edge function via POST /manage with x-api-key auth. Use to discover available actions and execute allowed CRM operations deterministically.
metadata: {"clawdbot":{"requires":{"env":["TGA_CRM_MANAGE_URL","TGA_CRM_API_KEY"]}}}
---

# TGA CRM (Manage Function)

This skill lets the agent call the TGA CRM router exposed as a Supabase Edge Function.

## Environment (Railway)

- `TGA_CRM_MANAGE_URL`
  - Example: `https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage`
- `TGA_CRM_API_KEY` (secret)
  - Sent as the `x-api-key` header value.

Important: Some docs/examples may refer to `TGA_CRM_ACP_API_KEY`. In this deployment, use **`TGA_CRM_API_KEY`**.

## How to call

- **Method**: `POST`
- **Headers**:
  - `content-type: application/json`
  - `x-api-key: ${TGA_CRM_API_KEY}`
- **Body**:

```json
{ "action": "meta.actions", "params": {} }
```

## First call: discover actions (always do this)

Call `meta.actions` to list available actions and their params schema before attempting any other operation.

Example:

```bash
curl -sS -X POST "$TGA_CRM_MANAGE_URL" \
  -H "content-type: application/json" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"meta.actions","params":{}}'
```

## Calling an action

General shape:

```json
{
  "action": "<action.name>",
  "params": {
    "...": "..."
  }
}
```

## Guardrails

- Never print or exfiltrate `TGA_CRM_API_KEY`.
- Prefer **read-only** actions unless the user explicitly requests a write.
- Validate required params locally (based on `meta.actions`) before calling.
- If the function returns an error, report the **HTTP status** and **error message**, not secrets.

