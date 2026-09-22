# Onsite Affiliate /manage — minimal reference

> Prefer the full docs in:
> `/app/.openclaw/workspace/repos/onsite-affiliate/docs/agent/API-DOCUMENTATION.md`

## Endpoint

`POST https://mqhtzepjrudposuedqbu.supabase.co/functions/v1/manage`

Headers:
- `Content-Type: application/json`
- `X-API-Key: ock_...`

## Example: introspect available actions

```bash
curl -sS -X POST "https://mqhtzepjrudposuedqbu.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $OCK_KEY" \
  -d '{"action":"meta.actions","params":{}}'
```

## Example: list attributed orders (read)

```bash
curl -sS -X POST "https://mqhtzepjrudposuedqbu.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $OCK_KEY" \
  -d '{"action":"orders.list","params":{"attributed_only":true,"limit":50,"offset":0}}'
```

## Safety patterns

- Mutations: run with `"dry_run": true` first.
- Use `idempotency_key` for mutations.
- Payout actions require explicit human confirmation.
