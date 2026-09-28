# Django + Railway — maintainability review

## High-value checks

### Settings and configuration
- Use environment-based settings with validation (don’t sprinkle `os.environ.get` everywhere).
- Separate dev/staging/prod; ensure DEBUG off in prod.

### App structure
- Domain-oriented apps (not one giant app).
- Keep models thin-ish; push complex rules into services.

### Database & migrations
- Migrations reviewed; avoid data migrations without backout plan.
- Indexes match query patterns (use `QuerySet.explain()` when needed).

### Permissions and security
- Centralize permission logic (DRF permissions, decorators).
- Avoid ad-hoc `if request.user...` scattered.

### Testing
- Unit tests for business logic; integration tests for critical endpoints.
- Avoid fragile tests that depend on time/network.

### Ops
- Structured logging; Sentry (or equivalent) configured.
- Background jobs (Celery/RQ) idempotent and retriable.

## Red flags
- Fat views/serializers doing everything.
- Missing transaction boundaries.
- Implicit coupling via signals.

## Quick debt reducers
- Introduce `services/` modules for domain logic.
- Introduce typed schemas at boundaries (DRF serializers used consistently).
- Add lint/type gates: ruff/black/mypy + tests in CI.
