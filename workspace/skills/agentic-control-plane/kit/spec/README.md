# ACP Spec — Universal Contract

**Single source of truth:** [ACP-SPEC.md](./ACP-SPEC.md)

All kernels (TS, Python, Go, etc.) must conform to this spec.

## Design Principle

- **Spec** = language-agnostic envelope, semantics, error codes, shapes
- **Kernels** = language-specific implementations that pass conformance tests
- **No Node sidecar everywhere** — each client uses the kernel for their stack (Python kernel for Django, TS kernel for Node/Supabase, etc.)

## Spec Contents

| File | Purpose |
|------|---------|
| **ACP-SPEC.md** | **Canonical spec** — request/response, error codes, scopes, dry_run, idempotency, audit, meta |
| `request.json` | POST /manage request envelope (JSON schema) |
| `response.json` | Response envelope (JSON schema) |
| `error-codes.json` | Standard error codes |
| `impact.json` | Dry-run impact shape |
| `audit-entry.json` | Audit log entry shape |
| `action-def.json` | Action definition schema (for meta.actions) |

## Contract Summary

### Request Envelope

```json
{
  "action": "string (required)",
  "params": "object (optional)",
  "idempotency_key": "string (optional)",
  "dry_run": "boolean (optional, default false)"
}
```

### Response Envelope

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
  "code": "VALIDATION_ERROR | SCOPE_DENIED | NOT_FOUND | RATE_LIMITED | CEILING_EXCEEDED | IDEMPOTENT_REPLAY | INVALID_API_KEY | INTERNAL_ERROR"
}
```

### Semantics

- **Auth**: `X-API-Key` header required (except meta.actions if configured)
- **Scopes**: Deny-by-default; action requires scope from action-def
- **meta.actions**: Returns `{ actions, api_version, total_actions }` — list of all actions with schemas
- **meta.version**: Returns `{ api_version, schema_version, actions_count }`
- **dry_run**: If true, handler returns `{ data, impact }` without persisting; mutations must support impact shape
- **Idempotency**: Same `idempotency_key` + action returns cached response with `code: "IDEMPOTENT_REPLAY"`

### Conformance

Kernels must pass the HTTP-based conformance tests in `tests/conformance/`.  
Run against any running `/manage` endpoint.
