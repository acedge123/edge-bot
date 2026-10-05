---
name: shopify-store-management
description: Use when working on Shopify store operations, catalog/admin workflows, product or merchandising changes, collections, orders, customers, or schema-aware Shopify planning that needs read-first inspection, validation, dry-run thinking, and execution planning before handing off to the Repo C execution path.
---

# Shopify Store Management

## Purpose
This is the Shopify planning and operations skill.

Use it to:
- inspect current Shopify state
- reason about product/catalog/admin changes
- validate payload shape and rollback risk
- plan safe execution steps

Do **not** use this skill as the source of truth for Repo C execution mechanics. For tenant credential ingestion and `internal-execute` calls, use `shopify-store-execution`.

## Default posture
- Inspect first.
- Validate required fields and payload shape before any mutation.
- Prefer dry-run plans and explicit confirmation for destructive changes.
- Break work into read, validate, propose, execute, verify.

## Execution boundary
- **This skill**: Shopify ops judgment, schema awareness, safe change planning, readback expectations, and feed-map ingestion planning.
- **`shopify-store-execution`**: Repo C tenant credential storage and actual Shopify action execution.

## Live feed-map pipeline
When the user is working on CSV ingestion or Shopify feed transformation, the live `/functions/v1/manage` pipeline is:
1. `feed_map.vendors.list` , pick vendor
2. `feed_map.uploads.create` , send CSV as base64 in JSON, returns `uploadId` + detected `sourceFields`
3. `feed_map.uploads.list` , optional verification
4. `feed_map.transforms.run` , apply mappings, returns `transformedDatasetId`
   - supports `fieldMappings: [{sourceField, targetField}, ...]`
   - or `autoMap: true`
5. `feed_map.datasets.get` , inspect transformed rows
6. `feed_map.exports.prepare_shopify` , build Shopify-shaped payload
7. `feed_map.exports.push_shopify_via_repo_c` , hand off to Repo C

### Verified failure patterns from a real push
- Repo C transport/chunking can succeed even when Shopify rejects product-level data.
- Common normalization bugs observed:
  - dropped `Option2 Value` causes duplicate/shape failures on variants with size
  - unstable option names like color labels drifting per row should be normalized to stable dimensions (`Color`, `Size`)
  - option names containing ` / ` need sanitizing before Shopify export
  - duplicate variant tuples must be deduped on the full option set, not on color alone
- Data review should happen before push, because chunk success does not imply feed validity.

### Feed-map request notes
- Base URL used by the function is `https://edblirteursgilvotjcy.supabase.co/functions/v1/manage`.
- Auth header: `X-API-Key: $SHOPIFY_API_KEY`.
- Write actions support `dry_run: true` at the envelope level.
- For CSV uploads, use `contentBase64` in the request body.
- Prefer explicit mappings when the source headers are ambiguous, otherwise let `autoMap: true` handle the common case.

When the user is asking to actually provision tenant credentials or call Repo C executor actions, switch to the execution skill.

## Credential handling
- Repo C (`https://github.com/The-Gig-Agency/key-vault-executor`) is the execution/credential broker.
- Do not hardcode credentials in files, prompts, logs, or memory.
- If the user pastes secrets for one-time use, use them only for the requested operation and do not persist them.
- Prefer referring to Repo C contracts rather than inventing local secret-handling patterns.

## Core workflow
1. Confirm target shop, tenant, and intended outcome.
2. Inspect the current state.
3. Identify the minimal safe change.
4. Validate against Shopify schema/docs and Repo C action constraints.
5. Execute only the intended mutation through the execution path.
6. Verify the post-change result with a readback.

## Common task buckets
- Products and variants
- Collections and merchandising
- Discounts and promotions
- Theme content and storefront config
- Orders, fulfillment, and customer ops
- Metafields and structured content
- App / API validation and schema-aware workflows

## Tenant context
This workspace may have multiple Shopify tenant ids over time, where each tenant id maps to a different end customer or internal store.

Currently known examples:
- `91e4d627-1c00-408d-878e-d5dd60a8cd20` → TGA internal Shopify test store (`thegigtesting.myshopify.com`)
- `667221a2-b10f-444e-a0d7-c18dc014389e` → CopperFit (IdeaVillage customer)

Treat these as routing context only. Do not store secrets in this file.

## Guardrails
- Never assume the target store, tenant, or credential state.
- Never mutate without a clear request.
- Prefer reversible changes.
- Call out ambiguity, permission gaps, schema risk, and rollback risk.
- If Repo C only exposes a subset of Shopify actions, plan within that subset instead of assuming direct Admin API access.

## References
- `references/shopify-ai-toolkit-notes.md`: Shopify AI Toolkit research notes and skill design guidance.
- `../shopify-store-execution/SKILL.md`: verified Repo C execution contract.
