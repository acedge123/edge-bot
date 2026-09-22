---
name: onsite-affiliate-manage-api
description: "Operate the Onsite Affiliate Supabase Edge Function Management API (/functions/v1/manage) to list and manage orders, events, creators, assets, webhooks, API keys, payouts, brand settings, stats, and audit logs. Use when asked to query Onsite Affiliate analytics (orders/events/attribution), administer creators/webhooks/keys, or run payout workflows (dry-run first; payouts are high risk)."
---

# Onsite Affiliate Manage API

## Quick facts

- **Base URL (current deployment):** `https://mqhtzepjrudposuedqbu.supabase.co/functions/v1/manage`
- **Auth:** `X-API-Key: ock_...` header (never put keys in URLs)
- **Request envelope:**

```json
{
  "action": "action.name",
  "params": {},
  "idempotency_key": "optional-client-id",
  "dry_run": false
}
```

## Default workflow (recommended)

1. **Discover capabilities**: call `meta.actions` (schemas + scopes).
2. **(If relevant) choose brand**: call `meta.brands.list`.
3. For any mutation:
   - run with **`dry_run: true` first**
   - include an **`idempotency_key`**
   - require explicit user confirmation before setting `dry_run: false`

## Common tasks (action map)

### Read / analytics (`manage.read`)
- `stats.overview` — top-line KPIs
- `orders.list` — orders (+ attribution)
- `events.list` — impressions/clicks/watch_start/etc.
- `assets.list` — assets + creator mappings
- `creators.list` — creators + rollups
- `payouts.list` — payout ledger
- `audit.list` — audit trail
- `webhooks.list`, `webhooks.deliveries`
- `api-keys.list`

### Admin / mutations (use dry-run first)
- API keys (`manage.keys`): `api-keys.create|update|revoke`
- Webhooks (`manage.webhooks`): `webhooks.create|update|delete|test`
- Creators (`manage.creators`): `creators.create|update|delete|invite`
- Settings (`manage.brands` / `manage.settings`): `settings.get|update`

### Payouts (HIGH RISK — explicit confirmation required)
- `payouts.generate`
- `payouts.mark-paid`
- `payouts.stripe-pay`, `payouts.bulk-stripe-pay` (subject to hard ceilings)
- `payouts.export`

## Local docs

When you need full details (schemas, params, error codes), read:
- `/app/.openclaw/workspace/repos/onsite-affiliate/docs/agent/API-DOCUMENTATION.md`
- `/app/.openclaw/workspace/repos/onsite-affiliate/docs/agent/TROUBLESHOOTING.md`
- `/app/.openclaw/workspace/repos/onsite-affiliate/docs/agent/FAQ.md`
