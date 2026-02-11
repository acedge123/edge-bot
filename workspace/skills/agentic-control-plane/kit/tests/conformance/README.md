# ACP Conformance Tests

**Language-agnostic** — hits a running `/manage` endpoint. Bridge between TS, Python, Go kernels.

## Usage

```bash
export ACP_BASE_URL=http://localhost:8000/api/manage
export ACP_API_KEY=your_test_key

npm run test:conformance
```

Optional (for SCOPE_DENIED tests):
```bash
export ACP_LOW_SCOPE_KEY=key_with_only_manage_read
```

## What Is Tested

| Test | Spec Reference |
|------|----------------|
| Request/response envelope | ACP-SPEC §1, §2 |
| Error codes (VALIDATION_ERROR, NOT_FOUND, etc.) | ACP-SPEC §3 |
| SCOPE_DENIED returns 403 | ACP-SPEC §4 (kernel must audit result=denied) |
| dry_run returns impact, does not persist | ACP-SPEC §5 |
| Idempotency replay returns cached + IDEMPOTENT_REPLAY | ACP-SPEC §6 |
| meta.actions matches packs + schemas | ACP-SPEC §8 |
| meta.version | ACP-SPEC §9 |
| RATE_LIMITED / CEILING_EXCEEDED codes when triggered | ACP-SPEC §3 |

## Prerequisites

- Running `/manage` endpoint
- API key with `manage.read` and `manage.domain` (for mutation tests)
- Optional: `ACP_LOW_SCOPE_KEY` for scope-denial tests
