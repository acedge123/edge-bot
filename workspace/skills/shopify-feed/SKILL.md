---
name: shopify-feed
description: |
  Use the hosted CIQ Feed ACP manage endpoint to inspect vendors and transformed datasets, prepare Shopify-ready feed payloads, and push them to Shopify via Repo C. Prefer this when the task involves CIQ feed map exports, Shopify feed preparation, or product-feed pushes.
metadata: {"clawdbot":{"requires":{"env":["SHOPIFY_FEED_URL","SHOPIFY_FEED_API_KEY","SHOPIFY_API_KEY"]}}}
---

# Shopify Feed

Use the hosted CIQ Feed ACP `/functions/v1/manage` endpoint with the tenant API key in `X-API-Key`.

Do not use raw Supabase service-role credentials from the agent.

## Runtime requirements
- `SHOPIFY_FEED_URL`
- `SHOPIFY_FEED_API_KEY`
- `SHOPIFY_API_KEY` (accepted fallback if the feed key is named generically)

## Workflow
1. Call `feed_map.vendors.list` if you need to discover the vendor.
2. Call `feed_map.datasets.list` to discover exportable transformed datasets.
3. Call `feed_map.datasets.get` if you need to inspect fields or preview rows.
4. Call `feed_map.exports.prepare_shopify` with `dry_run: true` before any push.
5. Call `feed_map.exports.push_shopify_via_repo_c` only after the preparation output looks correct.

## Rules
- Always authenticate with `X-API-Key: $SHOPIFY_FEED_API_KEY`.
- If `SHOPIFY_FEED_API_KEY` is unavailable, use `SHOPIFY_API_KEY` as the API key.
- Always send requests to `$SHOPIFY_FEED_URL`.
- Prefer `transformedDatasetId` after discovery for reliability.
- Use `dry_run: true` before a real Shopify push.
- Do not request or use raw Shopify credentials from the agent. Repo C resolves Shopify access server-side.
- Do not request or use `SUPABASE_SERVICE_ROLE_KEY` from the agent. The CIQ Feed backend owns that secret.
- If the push targets a non-default Repo C tenant, include `repoCTenantId` explicitly in `params`.

## Call shape
```bash
curl -X POST "$SHOPIFY_FEED_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SHOPIFY_FEED_API_KEY" \
  -d '{
    "action": "feed_map.datasets.list",
    "params": {
      "vendorId": "<vendor-uuid>",
      "limit": 10
    }
  }'
```

## Discovery
List vendors:
```json
{
  "action": "feed_map.vendors.list",
  "params": {
    "limit": 25
  }
}
```

List datasets for a vendor:
```json
{
  "action": "feed_map.datasets.list",
  "params": {
    "vendorId": "<vendor-uuid>",
    "limit": 10
  }
}
```

Inspect one dataset:
```json
{
  "action": "feed_map.datasets.get",
  "params": {
    "transformedDatasetId": "<dataset-uuid>",
    "previewRows": 5
  }
}
```

## Prepare example
Preview a Shopify preparation run:
```json
{
  "action": "feed_map.exports.prepare_shopify",
  "params": {
    "transformedDatasetId": "<dataset-uuid>"
  },
  "dry_run": true
}
```

Optional overrides:
- `vendorId`
- `fieldMappings`
- `limit`

## Push example
Preview a Repo C Shopify push:
```json
{
  "action": "feed_map.exports.push_shopify_via_repo_c",
  "params": {
    "transformedDatasetId": "<dataset-uuid>",
    "repoCTenantId": "<repo-c-tenant-uuid>"
  },
  "dry_run": true
}
```

Execute the push:
```json
{
  "action": "feed_map.exports.push_shopify_via_repo_c",
  "params": {
    "transformedDatasetId": "<dataset-uuid>",
    "repoCTenantId": "<repo-c-tenant-uuid>"
  }
}
```

## Response notes
- `prepare_shopify` returns `data.preview`, `data.products`, `data.fieldMappings`, and `data.summary`.
- `push_shopify_via_repo_c` returns an `impact` block and, on non-dry runs, a Repo C response receipt.
- If the backend has a default Repo C tenant configured, `repoCTenantId` may be omitted.

## Safety notes
- Treat feed variant and image sync as authoritative per product once pushed through Repo C.
- If a product update omits variants or images, Shopify may remove omitted entries during sync.
- Prefer a limited dry run first if the dataset is large or recently remapped.
