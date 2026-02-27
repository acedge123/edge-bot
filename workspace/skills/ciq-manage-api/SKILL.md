# CIQ Manage API (CreatorIQ) — OpenClaw Reference Skill

A reference for the **CIQ Manage API** exposed as a Supabase Edge Function.

- **Base URL**: `https://rlqedbmolbyybzgaisot.supabase.co/functions/v1/manage`
- **Method**: `POST`
- **Auth header**: `X-API-Key: $platform_key` (env var `platform_key` from Railway/local)
  - Use your **platform/tenant API key** (from signup or onboarding, e.g. `ciq_xxx`). The manage router resolves tenant from this key and fetches the CIQ credential server-side — never pass the raw CreatorIQ API key.

## Request format

```json
{
  "action": "<action.name>",
  "params": { },
  "dry_run": false,

  // Multi-tenant routing (required for platform keys)
  "brand_id": "<uuid>",
  "brand_slug": "<brand name or display_name>"
}
```

Notes:
- Most "write" actions are under scope `manage.domain` and many support `dry_run`.
- "read" actions are under scope `manage.read`.

## Quick tests

### List actions
```bash
curl -s -X POST "https://rlqedbmolbyybzgaisot.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $platform_key" \
  -d '{"action":"meta.actions"}'
```

### List brands (no brand context required)
```bash
curl -s -X POST "https://rlqedbmolbyybzgaisot.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $platform_key" \
  -d '{"action":"meta.brands.list"}'
```

### Run a domain action in a brand context
```bash
curl -s -X POST "https://rlqedbmolbyybzgaisot.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $platform_key" \
  -d '{"brand_slug":"Mom Walk","action":"domain.ciq.lists.list","params":{}}'
```

## Full action catalog + schemas

Generated reference doc (action list + `params_schema` for each):
- `docs/CIQ_MANAGE_API.md`

Regenerate it with:

```bash
curl -s -X POST "https://rlqedbmolbyybzgaisot.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $platform_key" \
  -d '{"action":"meta.actions"}' > /tmp/ciq-meta-actions.json
```

(Then render however you want—OpenClaw has a helper script in-chat for this session, but the canonical output is already checked into `docs/CIQ_MANAGE_API.md`.)

## Opinionated wrappers (recommended patterns)

### Pattern: ingest creators from social handles into a CIQ List
1) Ensure you're operating in the correct brand context (`brand_slug` / `brand_id`).
2) Create (or upsert) publisher records from `{network, handle}`:

```json
{
  "brand_slug": "Mom Walk",
  "action": "domain.ciq.publishers.create",
  "params": {
    "publisher_name": "drshahirasaad",
    "accounts": [{"id":"drshahirasaad","network":"Instagram"}],
    "flagship_property": "drshahirasaad",
    "flagship_social_network": "Instagram"
  }
}
```

3) Resolve the internal numeric publisher `Id` (required for list membership):

```json
{
  "brand_slug": "Mom Walk",
  "action": "domain.ciq.publishers.get",
  "params": {"publisher_id":"10028970475","key":"PublisherId"}
}
```

4) Add to list using the internal `Id` values (NOT the string `PublisherId`):

```json
{
  "brand_slug": "Mom Walk",
  "action": "domain.ciq.lists.publishers.add",
  "params": {"list_id":"447527","publisher_ids":[30933635]}
}
```

Notes:
- `domain.ciq.discovery.lookup` is useful for resolving full social URLs → account metadata, but can break if upstream returns unescaped newlines (observed on some TikTok bios). When that happens, skip lookup and go straight to `publishers.create`.

## High-level capability map

- Meta/IAM/Settings: `meta.*`, `iam.*`, `settings.*`
- Webhooks: `webhooks.*`
- CIQ domain operations:
  - Publishers: `domain.ciq.publishers.*`
  - Campaigns: `domain.ciq.campaigns.*`
  - Lists: `domain.ciq.lists.*`
  - Onesheets: `domain.ciq.onesheets.*`
  - Messaging: `domain.ciq.messaging.*`
  - Email templates: `domain.ciq.email.templates.*`
  - Links + reporting: `domain.ciq.links.*`
  - Transactions: `domain.ciq.transactions.*`
  - PubSub: `domain.ciq.pubsub.*`
  - Discovery: `domain.ciq.discovery.*`
  - Workflows: `domain.ciq.workflows.*`
