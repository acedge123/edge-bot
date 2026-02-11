# ACP Spec — Single Source of Truth

All kernels (TypeScript, Python, Go, etc.) must conform. Keep this short.

---

## 1. Request Envelope

POST to `/manage` with `Content-Type: application/json` and `X-API-Key` header.

```json
{
  "action": "string (required)",
  "params": "object (optional)",
  "idempotency_key": "string (optional)",
  "dry_run": "boolean (optional, default false)"
}
```

---

## 2. Response Envelope

**Success:**
```json
{
  "ok": true,
  "request_id": "string",
  "data": "any",
  "dry_run": "boolean?",
  "constraints_applied": ["string"]
}
```

**Error:**
```json
{
  "ok": false,
  "request_id": "string",
  "error": "string",
  "code": "<ERROR_CODE>"
}
```

---

## 3. Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Request or params invalid |
| `INVALID_API_KEY` | 401 | Missing or invalid X-API-Key |
| `SCOPE_DENIED` | 403 | API key lacks required scope |
| `NOT_FOUND` | 404 | Unknown action |
| `CEILING_EXCEEDED` | 403 | Hard ceiling (quota) exceeded |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `IDEMPOTENT_REPLAY` | 200 | Cached response (success) |
| `INTERNAL_ERROR` | 500 | Unhandled error |

---

## 4. Scope Rules

- **Deny-by-default**: Action requires scope from its definition.
- Each action has `scope` (e.g. `manage.read`, `manage.iam`, `manage.domain`).
- API key has `scopes: string[]`. If `requiredScope not in scopes` → `SCOPE_DENIED`.

---

## 5. dry_run Rules + Impact Schema

- `dry_run: true` → handler must **not persist**; return `{ data, impact }` only.
- Mutations (`supports_dry_run: true`) must return this impact shape:

```json
{
  "creates": [{"type": "string", "count": 0, "details?": {}}],
  "updates": [{"type": "string", "id": "string", "fields": [], "details?": {}}],
  "deletes": [{"type": "string", "count": 0, "details?": {}}],
  "side_effects": [{"type": "string", "count": 0, "details?": {}}],
  "risk": "low" | "medium" | "high",
  "warnings": ["string"]
}
```

- If `dry_run: true` and action has `supports_dry_run: false` → `VALIDATION_ERROR`.

---

## 6. Idempotency Semantics

- Same `(tenant_id, action, idempotency_key)` → return cached `data` with `code: "IDEMPOTENT_REPLAY"`.
- Only for non–dry-run mutations.
- TTL: implementation-defined (e.g. 24h).

---

## 7. Audit Entry Schema (Logical Fields)

Every request (success, denied, error) must produce an audit entry with:

| Field | Type | Required |
|-------|------|----------|
| `tenant_id` | string | ✓ |
| `actor_type` | `api_key` \| `user` \| `system` | ✓ |
| `actor_id` | string | ✓ |
| `action` | string | ✓ |
| `request_id` | string | ✓ |
| `result` | `success` \| `denied` \| `error` | ✓ |
| `dry_run` | boolean | ✓ |
| `api_key_id` | string | |
| `payload_hash` | string | |
| `impact` | impact shape | |
| `error_message` | string | |
| `ip_address` | string | |
| `idempotency_key` | string | |

Storage format is implementation-specific.

---

## 8. meta.actions Contract

**Action:** `meta.actions` (scope: `manage.read`)

**Response data:**
```json
{
  "actions": [
    {
      "name": "string",
      "scope": "string",
      "description": "string",
      "params_schema": {"type": "object", "properties": {}, "required": []},
      "supports_dry_run": false
    }
  ],
  "api_version": "string",
  "total_actions": 0
}
```

- `actions` = all registered actions from installed packs.
- Each action must have `name`, `scope`, `description`, `params_schema`, `supports_dry_run`.

---

## 9. meta.version Contract

**Action:** `meta.version` (scope: `manage.read`)

**Response data:**
```json
{
  "api_version": "string",
  "schema_version": "string",
  "actions_count": 0
}
```

---

## Conformance

Kernels must pass `tests/conformance/`. Run against a running `/manage`:

```bash
ACP_BASE_URL=http://localhost:8000/api/manage ACP_API_KEY=xxx npm run test:conformance
```
