# ACP Kernel — Python

Python implementation of the [ACP Spec](../spec/README.md). Conforms to the same contract as kernel-ts.

**Status:** Skeleton — implement adapters and wire to Django/FastAPI.

## Design

- **Spec-first**: All behavior matches `spec/` (request/response envelope, error codes, impact shape, audit entry).
- **Adapter pattern**: Same interfaces as TS kernel — DbAdapter, AuditAdapter, IdempotencyAdapter, RateLimitAdapter, CeilingsAdapter.
- **Packs**: Register actions + handlers; meta.actions and meta.version are built-in.

## Structure

```
kernel-py/
├── README.md
├── requirements.txt
├── acp/
│   ├── __init__.py
│   ├── router.py        # Main router (create_manage_router)
│   ├── auth.py         # API key validation
│   ├── audit.py        # Audit logging
│   ├── validate.py     # Request/params validation
│   ├── types.py        # Type hints (mirrors spec)
│   └── meta_pack.py    # meta.actions, meta.version
└── tests/
    └── ...
```

## Usage (Django)

```python
# api/views/manage.py
from acp.router import create_manage_router
from .adapters import DjangoDbAdapter, DjangoAuditAdapter, ...
from .bindings import get_bindings
from .packs import leadscoring_domain_pack

router = create_manage_router(
    db_adapter=DjangoDbAdapter(),
    audit_adapter=DjangoAuditAdapter(),
    idempotency_adapter=DjangoIdempotencyAdapter(),
    rate_limit_adapter=DjangoRateLimitAdapter(),
    ceilings_adapter=DjangoCeilingsAdapter(),
    bindings=get_bindings(),
    packs=[iam_pack, webhooks_pack, settings_pack, leadscoring_domain_pack]
)

def manage_endpoint(request):
    body = json.loads(request.body)
    meta = {"request": request, "ip_address": get_client_ip(request), ...}
    response = router(body, meta)
    return JsonResponse(response, status=response.get("_status", 200))
```

## Conformance

Run the HTTP conformance tests against your Django /manage endpoint:

```bash
ACP_BASE_URL=http://localhost:8000/api/manage ACP_API_KEY=ock_xxx npm run test:conformance
```

## Implementation Notes

- Use `spec/` as source of truth for request/response shapes and error codes.
- Adapters are Python equivalents of `kernel/src/types.ts` interfaces.
- Packs define `actions` (list of ActionDef) and `handlers` (dict of name -> callable).
