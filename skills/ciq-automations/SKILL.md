---
name: ciq-automations
description: |
  Enable interactions with CreatorIQ for campaign management, list creation, and API calls.
metadata: {"clawdbot":{"requires":{"env":["platform_key"]}}}
---

# CIQ Automations Skill

When calling CIQ Automations, **never use a raw CreatorIQ API key.**

Use the tenant platform key in the `X-API-Key` header against the `/functions/v1/manage` endpoint.

---

## Workflow

1. Call `meta.brands.list` to discover available brands.
2. Select the target brand.
3. Call the desired `domain.ciq.*` action with either `brand_id` or `brand_slug`.
4. Pass only the platform key. The upstream CIQ credential is resolved server-side.

---

## Rules

- Do not send raw CreatorIQ credentials.
- Do not store or request CIQ tenant secrets.
- Prefer `brand_id` after discovery for reliability.
- Use `brand_slug` only when it exactly matches the brand `name` or `display_name` (case-insensitive). It is not a fuzzy alias — e.g. "tmwc" only works if the stored name or display_name is exactly "tmwc".

---

## Call Shape (agent contract)

```bash
curl -X POST https://your-project.supabase.co/functions/v1/manage \
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
| `brand_id` in body | `"brand_id": "1653db0d-c39f-..."` (preferred after discovery) |
| `brand_slug` in body | `"brand_slug": "The Mom Walk Collective"` — must match `name` or `display_name` exactly (case-insensitive) |
| `X-Brand-Id` header | `X-Brand-Id: 1653db0d-c39f-...` |

---

## Discovery (get available brands)

Use `meta.brands.list` (not `domain.brands.list`):

```json
{ "action": "meta.brands.list" }
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
  "brand_slug": "The Mom Walk Collective",
  "params": {
    "campaign_id": 42066,
    "publisher_id": 3293835,
    "status": "Accepted"
  }
}
```
