---
name: ciq-automations
description: |
  Enable interactions with CreatorIQ for campaign management, list creation, and API calls.
  Use when user asks to manage CIQ campaigns, lists, publishers, or automate CreatorIQ tasks.
metadata: {"clawdbot":{"requires":{"env":["platform_key"]}}}
---

# CIQ Automations Skill

**Purpose:** Enable interactions with CreatorIQ for automating tasks such as campaign management, list creation, and executing API calls.

**Env:** Set `platform_key` (Railway or local). The platform key resolves the correct CIQ API credentials server-side based on the brand's `ciq_api_token_secret_name` — the agent never sees the upstream secret.

---

## Call Shape (exact format for agent)

```bash
curl -X POST https://rlqedbmolbyybzgaisot.supabase.co/functions/v1/manage \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $platform_key" \
  -d '{
    "action": "domain.ciq.campaigns.list",
    "brand_slug": "The Mom Walk Collective",
    "params": { "page": 1, "size": 10 }
  }'
```

---

## Three ways to specify the brand

| Method | Example |
|--------|---------|
| `brand_id` in body | `"brand_id": "1653db0d-c39f-..."` |
| `brand_slug` in body | `"brand_slug": "The Mom Walk Collective"` (matches name or display_name, case-insensitive) |
| `X-Brand-Id` header | `X-Brand-Id: 1653db0d-c39f-...` |

---

## Discovery (get available brand IDs)

```json
{ "action": "domain.brands.list" }
```

---

## Read example (list campaigns)

```json
{
  "action": "domain.ciq.campaigns.list",
  "brand_slug": "The Mom Walk Collective",
  "params": { "page": 1, "size": 10 }
}
```

---

## Write example (add publisher to campaign)

```json
{
  "action": "domain.ciq.campaigns.publishers.add",
  "brand_slug": "tmwc",
  "params": {
    "campaign_id": 42066,
    "publisher_id": 3293835,
    "status": "Accepted"
  }
}
```

---

## Key Functions

- **Generate campaigns**: Create new campaigns in CIQ based on given parameters.
- **Manage questions**: Upsert questions related to lead scoring.
- **Fetch actions**: List available actions and their requirements for proper integration.

---

## Notes

- The platform key resolves CIQ credentials server-side — never pass the raw CreatorIQ API key.
- Use `domain.brands.list` first to discover available brands and their IDs.
- `brand_slug` matches name or display_name (case-insensitive).
