---
name: governance-runtime
description: |
  Governance Hub runtime: heartbeat, authorize, audit-ingest, and tenant-scoped operations (e.g. policy proposals, rules for specific tenants like onsite-affiliate or mom-walk-connect).
  Use whenever the task involves Governance authorization, audit, heartbeat, policy/rule setup for tenants, or tenant API keys.
metadata: {"clawdbot":{"requires":{"env":["ACP_BASE_URL","ACP_KERNEL_ID","ACP_KERNEL_KEY"]}}}
---

# Governance Runtime

Use this skill whenever the task involves **Governance Hub** (Repo B) authorization, audit, heartbeat, policy proposals, or tenant API keys — including **setting up or changing rules for specific tenants** (e.g. onsite-affiliate, mom-walk-connect).

All runtime governance calls go **directly to Governance Hub** (Supabase Edge Functions). Do not route them through Repo B signup-service or HMAC helpers.

**Reference:** Repo B is the `governance-hub` repo; endpoints are Supabase Edge Functions under `/functions/v1/<name>`.

---

## Runtime auth model

Two auth lanes. Use the correct one per endpoint.

### 1. Kernel auth

- **Header:** `Authorization: Bearer $ACP_KERNEL_KEY`
- **Key format:** Kernel key must be in format `acp_kernel_xxx` (stored in Repo B `kernels` table; verified via HMAC server-side). Use for:
  - `heartbeat`
  - `authorize`
  - `audit-ingest`
  - `policy-propose` (when calling as kernel/agent, not tenant-scoped by API key)

### 2. Tenant API key auth

- **Header:** `X-API-Key: $TENANT_API_KEY`
- **Use only** for endpoints that support it:
  - `whoami` — GET, returns tenant identity and key status
  - `policy-propose` — when submitting a **tenant-scoped** proposal (e.g. for onsite-affiliate or mom-walk-connect). Repo B sets `author_type: 'agent'` and `author_id` to the tenant id from the key. Tenant must have `email_verified` for policy-propose.

Do **not** use tenant API key for heartbeat, authorize, or audit-ingest.

---

## Never do this

- **Do not** use Repo B signup-service HMAC signing for runtime governance calls.
- **Do not** use `callRepoB()` or a signup/onboarding HMAC helper for `authorize`, `audit-ingest`, or `heartbeat`.
- **Do not** assume all endpoints accept the same auth — kernel vs tenant API key per table below.
- **Do not** add a governance-proxy edge function solely to hide credentials unless there is a demonstrated need.

---

## Required env vars

| Variable | Purpose |
|----------|--------|
| `ACP_BASE_URL` | **Supabase Edge Functions base** for the Governance Hub project. Example: `https://YOUR_PROJECT_REF.supabase.co/functions/v1` (no trailing slash). |
| `ACP_KERNEL_ID` | Kernel id (UUID or slug) registered in Repo B `kernels` table. Sent in heartbeat and authorize body. |
| `ACP_KERNEL_KEY` | Kernel API key (`acp_kernel_xxx`). Bearer token for kernel endpoints. |

**Optional:**

| Variable | Purpose |
|----------|--------|
| `TENANT_API_KEY` | Tenant API key (e.g. for onsite-affiliate or mom-walk-connect) for `whoami` and tenant-scoped `policy-propose`. Use `X-API-Key` only where supported. |

---

## Runtime sequence

1. **On startup** — `POST $ACP_BASE_URL/heartbeat` (kernel auth).
2. **Before sensitive actions** — `POST $ACP_BASE_URL/authorize` (kernel auth) if the operation requires a policy check.
3. **After action completes or fails** — `POST $ACP_BASE_URL/audit-ingest` (kernel auth) to record the outcome.

---

## Endpoints (from governance-hub repo)

Base: `$ACP_BASE_URL` = `https://YOUR_GOVERNANCE_SUPABASE_REF.supabase.co/functions/v1`.

| Action | Method | Path | Auth |
|--------|--------|------|------|
| Heartbeat | POST | `$ACP_BASE_URL/heartbeat` | Kernel (Bearer) |
| Authorize | POST | `$ACP_BASE_URL/authorize` | Kernel (Bearer) |
| Audit ingest | POST | `$ACP_BASE_URL/audit-ingest` | Kernel (Bearer) |
| Policy propose | POST | `$ACP_BASE_URL/policy-propose` | Kernel (Bearer) **or** Tenant (`X-API-Key`) |
| Whoami | GET | `$ACP_BASE_URL/whoami` | Tenant (`X-API-Key`) only |

---

## 1. Heartbeat

**Request:** `POST $ACP_BASE_URL/heartbeat`  
**Headers:** `Authorization: Bearer $ACP_KERNEL_KEY`, `Content-Type: application/json`

**Body:**
- `kernel_id` or `kernelId` (required) — must match the kernel that owns the key.
- Optional: `version`, `packs` (array), `env`, `status` (default `healthy`).

**Example:**
```json
{
  "kernelId": "ciq-automations-kernel",
  "version": "1.0.0",
  "packs": ["iam", "webhooks", "settings", "domain"]
}
```

**Response:** 200, `{ "data": { "ok": true, "kernel_registered": true, "policy_version": "vN", "revocations_version": "vN" } }`.

---

## 2. Authorize

**Request:** `POST $ACP_BASE_URL/authorize`  
**Headers:** `Authorization: Bearer $ACP_KERNEL_KEY`, `Content-Type: application/json`

**Body (all required):**
- `kernelId` — must match authenticated kernel.
- `tenantId` — tenant id (e.g. for tenant-scoped policy).
- `action` — action string (e.g. `shopify.products.create`).
- `request_hash` — hash of request for idempotency/audit.

**Response:** 200, `{ "data": { "decision": "allow"|"deny", "decisionId": "...", "policyId": null|"...", "policyVersion": "vN" } }`. Repo B also writes the decision to `audit_logs`.

---

## 3. Audit-ingest

**Request:** `POST $ACP_BASE_URL/audit-ingest`  
**Headers:** `Authorization: Bearer $ACP_KERNEL_KEY`, `Content-Type: application/json`

**Body:** Single event object or **array** of events. Each event:
- `event_id`, `tenant_id`, `integration`, `pack`, `schema_version`, `actor` (`type`, `id`), `action`, `status`, `request_hash`, `policy_decision_id` (link to authorize), `result_meta`, `latency_ms`, `error_code`, `error_message_redacted`, `billable`, `ts` (optional; default now).

**Response:** 202, `{ "ok": true, "accepted": N }`.

---

## 4. Policy-propose (for tenant rules: onsite-affiliate, mom-walk-connect)

**Request:** `POST $ACP_BASE_URL/policy-propose`  
**Auth:** Either `Authorization: Bearer $ACP_KERNEL_KEY` (kernel) or `X-API-Key: $TENANT_API_KEY` (tenant-scoped). For **tenant-scoped** rule changes (e.g. rules for onsite-affiliate or mom-walk-connect), use **X-API-Key** with that tenant’s API key so Repo B sets `author_type: 'agent'` and `author_id` to the tenant id.

**Headers:** `Content-Type: application/json` and one of the auth headers above.

**Body:** Repo B overrides `org_id` and author from auth. You must send:
- `title` (required, ≤120 chars)
- `summary` (required, ≤300 chars)
- `proposal_kind` (required): `policy` | `limit` | `runbook` | `revocation_suggestion`
- `proposal` (required): `{ "type": "...", "data": { ... } }`
- `author_type`: `agent` | `user`
- `author_id`: set from auth (tenant id when using X-API-Key)
- Optional: `rationale` (≤2000), `evidence`

**Proposal types (from Repo B):**

- **LimitPolicy** — `proposal.type`: `"LimitPolicy"`. `proposal.data`: `action` (pattern `^[a-z0-9_.-]+$`), `scope` (`tenant` | `api_key` | `actor`), `window_seconds` (60–604800), `max` (1–1000000), `enforcement` (`hard` | `soft`).
- **RequireApprovalPolicy** — `proposal.type`: `"RequireApprovalPolicy"`. `proposal.data`: `action`, `scope` (`tenant` | `org`), `approver_role`.

**Example (tenant-scoped limit, using X-API-Key for that tenant):**
```json
{
  "title": "Rate limit for onsite-affiliate",
  "summary": "Limit execute calls per tenant per hour",
  "proposal_kind": "limit",
  "author_type": "agent",
  "author_id": "tenant-uuid-here",
  "proposal": {
    "type": "LimitPolicy",
    "data": {
      "action": "execute",
      "scope": "tenant",
      "window_seconds": 3600,
      "max": 100,
      "enforcement": "soft"
    }
  }
}
```

**Response:** 201, `{ "data": { "id": "...", "status": "proposed", "created_at": "..." } }`. Proposals require admin approval (`policy-approve` / `policy-publish`) before they take effect.

---

## 5. Whoami (tenant identity)

**Request:** `GET $ACP_BASE_URL/whoami`  
**Headers:** `X-API-Key: $TENANT_API_KEY` only (no Bearer).

**Response:** 200, tenant and API key info (tenant id, scopes, etc.). Use to confirm tenant context before policy-propose or other tenant operations.

---

## Summary

| Goal | Auth | Endpoint |
|------|------|----------|
| Startup heartbeat | Kernel | `POST $ACP_BASE_URL/heartbeat` |
| Pre-action authorization | Kernel | `POST $ACP_BASE_URL/authorize` |
| Post-action audit | Kernel | `POST $ACP_BASE_URL/audit-ingest` |
| Tenant identity | Tenant API key | `GET $ACP_BASE_URL/whoami` |
| Tenant policy/rule proposal (e.g. onsite-affiliate, mom-walk-connect) | Tenant API key | `POST $ACP_BASE_URL/policy-propose` |
| Kernel/agent policy proposal | Kernel | `POST $ACP_BASE_URL/policy-propose` |

Keep implementation minimal and explicit. Repo B source: `governance-hub` (Supabase Edge Functions under `supabase/functions/`).
