---
name: listingcred-ops
description: "Operate ListingCred fulfillment and compliance via the remote MCP server. Use when a user asks about ListingCred ops queues, creators, deliveries, order status progression, or compliance review workflows."
---

# ListingCred Ops MCP Server

Remote MCP server for ListingCred ops admin work.

## Endpoint

- MCP: `https://listingcred.com/mcp`
- Metadata: `https://listingcred.com/.well-known/oauth-protected-resource`
- Auth: OAuth 2.1 with dynamic client registration via ListingCred Supabase Auth
- Server name/title: `listing-credential-hub` / `Listing Credential Hub`
- Source of truth: `src/lib/mcp/index.ts`, tools in `src/lib/mcp/tools/`

## Connecting

1. Add `https://listingcred.com/mcp` as a remote MCP server in the client.
2. Complete OAuth flow with the ops-admin account (`/auth`, Google or password).
3. Approve the client on `/.lovable/oauth/consent`.
4. Call `ops_whoami` first.

If `ops_whoami` says the account is not an ops admin, a human ops admin must grant the role in the web console (Ops → People).

## Authorization model

Scopes come from the account's roles. The agent cannot widen them.

- `ops:view_queue`: `ops_queue_list`, `ops_creators_list`, `ops_media_deliveries_list`
- `ops:manage_fulfillment`: `ops_order_advance_status`, `ops_assign_creator`, `ops_media_review_asset`
- `ops:review_compliance`: `ops_compliance_queue_list`, `ops_compliance_resolve_flag`, `ops_compliance_send_to_realtor`
- `ops:manage_roles`: `ops_people_list`

Not exposed over MCP: refunds, payment overrides, order cancellation, role grants/revokes, account onboarding decisions, policy versioning, delegation-token issuance.

## Tools

### Read
- `ops_whoami`
- `ops_queue_list`
- `ops_creators_list`
- `ops_media_deliveries_list`
- `ops_compliance_queue_list`
- `ops_people_list`

### Fulfillment writes
- `ops_order_advance_status(orderId, toStatus, note?, idempotencyKey?)`
- `ops_assign_creator(orderId, creatorProfileId, creatorFeeCents, filmingWindowStart, filmingWindowEnd, notes?, idempotencyKey?)`
- `ops_media_review_asset(assetId, decision, note?, idempotencyKey?)`

### Compliance writes, human judgment required
- `ops_compliance_resolve_flag(adVersionId, notes, idempotencyKey?)`
- `ops_compliance_send_to_realtor(adVersionId, attestReviewed, idempotencyKey?)`

## Idempotency

Reuse the same `idempotencyKey` when retrying write calls so retries do not double-assign or double-advance. Keys are scoped to the acting account.

## Suggested agent loop

1. `ops_whoami`
2. `ops_queue_list({ attentionOnly: true })`
3. For paid orders needing a creator: `ops_order_advance_status` → `awaiting_assignment`, `ops_creators_list`, `ops_assign_creator`
4. For delivered media: `ops_media_deliveries_list` → `ops_media_review_asset`
5. For ads: `ops_compliance_queue_list`, then, with operator confirmation, compliance writes
6. Report changes with order ids and statuses. Direct money and privilege requests to the web console.
