---
name: shopify-store-execution
description: Use when a task needs tenant-scoped Shopify execution through Repo C / key-vault-executor, including storing Shopify app credentials for a tenant, calling `/functions/v1/internal-execute`, validating the current action catalog, or making real Shopify changes rather than only reviewing docs.
---

# Shopify Store Execution

## Purpose
Use this skill for real Shopify execution through Repo C. Keep it separate from the docs/operations skill.

## Boundary
- **`shopify-store-management`**: read-first store ops guidance, planning, validation, dry-run posture.
- **This skill**: tenant credential ingestion plus actual Repo C execution.
- Never store Shopify secrets in workspace files, memory files, or git.
- Require an explicit `tenant_id` on every provisioning or execution request.

## Verified Repo C contract
Current source of truth is `key-vault-executor/SHOPIFY-INTEGRATION.md` plus `README.md` and `INTEGRATION-GUIDE.md`.

### Endpoints
- `POST /functions/v1/credentials-store`
- `POST /functions/v1/internal-execute`

### Auth / headers
For trusted backend execution flows:
- `apikey: $CIA_ANON_KEY`
- `Authorization: Bearer $EXECUTOR_SECRET`
- `X-Tenant-Id: <tenant-uuid>`
- `Content-Type: application/json`

Notes:
- `X-API-Key` is for consumer credential-management flows and is rejected on `/internal-execute`.
- `internal-execute` is the only approved execution lane for this skill.

## Shopify credential contract
Use credential type `admin_app_credentials`.

Stored durable fields:
- `store_url`
- `client_id`
- `client_secret`
- optional `api_version`

Example payload:

```json
{
  "service": "shopify",
  "credential_type": "admin_app_credentials",
  "credentials": {
    "store_url": "acme-store.myshopify.com",
    "client_id": "your-shopify-client-id",
    "client_secret": "your-shopify-client-secret",
    "api_version": "2026-01"
  }
}
```

Rules:
- Documented contract is bare `*.myshopify.com` domain only.
- Repo C currently normalizes away `https://` and trailing slashes, but do not rely on that when preparing requests.
- Repo C derives short-lived Admin API tokens in memory during execution and does **not** persist them.
- Do not guess alternate credential types.

## Provision credentials
Use this when the tenant does not yet have Shopify credentials stored, or when the user explicitly wants to replace them.

```bash
curl -X POST "$CIA_URL/functions/v1/credentials-store" \
  -H "apikey: $CIA_ANON_KEY" \
  -H "Authorization: Bearer $EXECUTOR_SECRET" \
  -H "X-Tenant-Id: <tenant-uuid>" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "shopify",
    "credential_type": "admin_app_credentials",
    "credentials": {
      "store_url": "acme-store.myshopify.com",
      "client_id": "your-shopify-client-id",
      "client_secret": "your-shopify-client-secret",
      "api_version": "2026-01"
    }
  }'
```

## Execute actions
Use Repo C `internal-execute` for all Shopify work.

```bash
curl -X POST "$CIA_URL/functions/v1/internal-execute" \
  -H "apikey: $CIA_ANON_KEY" \
  -H "Authorization: Bearer $EXECUTOR_SECRET" \
  -H "X-Tenant-Id: <tenant-uuid>" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "shopify",
    "action": "products.list",
    "credential_type": "admin_app_credentials",
    "params": {"limit": 20}
  }'
```

## Current action catalog
Verified implemented actions now include:
- `products.list`
- `products.get`
- `products.update`
- `orders.list`
- `orders.get`
- `customers.get`
- `metafields.upsert`
- `themes.list`
- `themes.get`
- `themes.files.list`
- `themes.files.get`
- `themes.files.upsert`
- `themes.files.copy`
- `themes.files.delete`
- `themes.publish`

Live verification on 2026-04-11:
- `products.list` returned real product data for the provisioned tenant store.
- `themes.list` returned theme records including the main Dawn theme.
- `themes.get` succeeded for the live main theme id.
- `themes.files.list` returned the cleaned shape `{ files, pageInfo, theme }`.
- `themes.files.get` returned the live file shape with content under `data.file.body.content`.
- External `internal-execute` requests should explicitly pass `credential_type: "admin_app_credentials"` in snake_case; Repo C normalizes this internally to a `credentialType` variable/log field, but callers should not rely on camelCase.
- Live write-path fix verified: `themes.files.upsert`, `themes.files.copy`, and `themes.files.delete` operation results only expose `filename` on `OnlineStoreThemeFileOperationResult`.

Do not invent additional action names. Re-check Repo C docs/code if more actions are needed.

## Response contract
Success envelope:

```json
{
  "ok": true,
  "status": "success",
  "data": {}
}
```

Error envelope:

```json
{
  "ok": false,
  "status": "error",
  "error_code": "SOME_ERROR_CODE",
  "error_message_redacted": "Sanitized error message"
}
```

Repo C returns Shopify payloads under `data` and does not return decrypted credentials or minted tokens.

## Known tenant contexts
Maintain non-secret tenant mappings here when they help avoid confusion about which customer/store a request targets. These are customer context labels only, not credentials.

Current known tenants:
- `91e4d627-1c00-408d-878e-d5dd60a8cd20` → TGA internal Shopify test store (`thegigtesting.myshopify.com`)
- `667221a2-b10f-444e-a0d7-c18dc014389e` → CopperFit (IdeaVillage customer)

Notes:
- Treat tenant ids as customer/store routing context.
- Expect more tenant ids over time; append new mappings here when they become durable and user-approved.
- Never store Shopify secrets in this file.

## Working posture
1. Confirm tenant and target shop.
2. If multiple tenant ids are known, resolve the customer/store mapping explicitly before execution.
3. Normalize `store_url` to bare shop domain.
4. Provision credentials only when needed or explicitly requested.
5. Start with a read action, usually `products.list`.
6. For writes, use only explicitly requested actions.
7. Verify the post-change result with a readback.

## Guardrails
- Fail closed if `tenant_id` is missing.
- Do not write secrets to files, memory, commits, or chat summaries.
- Prefer read-first verification before mutations.
- Treat `products.update` and `metafields.upsert` as mutating operations requiring clear user intent.
- If the Repo C docs/code disagree with this skill, follow Repo C and update the skill.

## Common failure modes
- `401 Invalid executor secret` → wrong `EXECUTOR_SECRET`
- `403 Consumer keys cannot call` → remove `X-API-Key`, use Bearer token only
- `400 X-Tenant-Id required` → missing tenant header
- `404 Credential not found` → ingest credentials first
- `500 CREDENTIAL_ENCRYPTION_KEY not set` → Repo C config issue

## When to stop and ask
- The user did not explicitly authorize a mutating Shopify action.
- A requested change is destructive or hard to roll back.
- Repo C contract changed and current docs/code are inconsistent.
