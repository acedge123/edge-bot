# Security Standards (Baseline)

This document defines baseline security expectations for all projects in this workspace.
These are default rules, not optional suggestions.

## Core Principle
If a feature requires weakening one of these controls, document the exception explicitly, constrain the blast radius, and get human review before shipping.

## 1. Rate Limit Public APIs
All public-facing API routes must enforce rate limiting.

Minimum standard:
- Apply route-appropriate rate limiting on all external API surfaces.
- Use stricter limits on expensive operations such as AI calls, uploads, report generation, and search.
- Log throttled requests.

## 2. Do Not Store Auth Tokens in `localStorage`
Do not store privileged authentication tokens in `localStorage` unless there is a documented exception and compensating controls.

Clarification / common exception (allowed in pure SPAs):
- For **pure client-side SPAs** (e.g., React/Vite) using providers like **Supabase Auth**, session tokens commonly live in browser storage (often `localStorage`) because there is **no server middleware** to set `HttpOnly` cookies.
- This can be acceptable *if*:
  - Server-side access control is enforced (e.g., **RLS policies**; do not rely on client-side checks)
  - Tokens are **short-lived** and refresh is managed intentionally
  - App has strong XSS defenses (CSP, escaping, dependency hygiene) because XSS remains the main way to steal stored tokens

Preferred approach (when feasible):
- Use secure, `HttpOnly`, `SameSite` cookies for session tokens (requires a server-side component).
- Keep browser-accessible tokens short-lived and minimally scoped.

## 3. Validate and Sanitize All Input
All user-controlled input must be validated server-side and sanitized where appropriate.

Minimum standard:
- Validate body, query, headers, and path params.
- Use parameterized queries and safe ORM patterns.
- Treat AI-generated code as untrusted until reviewed.

## 4. Never Hardcode Privileged API Keys in Frontend Code
Privileged secrets must never be embedded in frontend bundles, theme code, mobile apps, or browser-readable storage.

Clarification / exception (allowed):
- **Publishable / anonymous / public client keys** (e.g., Supabase **anon** key, publishable IDs/URLs) may be present in frontend code or build-time env (e.g., `VITE_*`, `NEXT_PUBLIC_*`) **as long as they are truly non-privileged**.

Preferred approach:
- Keep privileged keys server-side only.
- Use separate low-privilege client keys or signed short-lived tokens for browser flows.
- Even for publishable keys: avoid committing `.env` files; prefer deployment-time env vars or clearly-documented non-secret defaults.

## 5. Verify Webhook Signatures
All webhook handlers must verify provider signatures before processing payloads.

Minimum standard:
- Reject unsigned or invalidly signed requests.
- Validate timestamp tolerance where supported.
- Log failures without leaking secrets.

## 6. Index Queried Fields
Database fields used in filters, joins, ordering, and lookups must be indexed appropriately.

Minimum standard:
- Add indexes for known access patterns.
- Review slow queries before launch and after schema changes.

## 7. Add UI Error Boundaries
User-facing apps must degrade safely when a component crashes.

Minimum standard:
- Add error boundaries around major application shells and high-risk views.
- Log errors with enough context to debug production issues.

## 8. Expire Sessions
Sessions must expire and be revocable.

Minimum standard:
- Define expiration windows.
- Rotate or refresh sessions intentionally.
- Support server-side revocation for sensitive systems.

## 9. Paginate Database Reads
Large list endpoints and queries must paginate.

Minimum standard:
- Use pagination or bounded result sizes on all list APIs.
- Avoid unbounded admin queries in production paths.

## 10. Expire Password Reset Links
Password reset and account recovery links must expire promptly and be single-use.

Minimum standard:
- Set short TTLs.
- Invalidate on use.
- Log recovery attempts.

## 11. Validate Environment Variables at Startup
Applications must validate required environment variables during startup and fail fast on invalid configuration.

Minimum standard:
- Parse and validate env vars on boot.
- Stop startup on missing or malformed required configuration.

## 12. Do Not Serve User Uploads Directly From App Servers
Uploaded assets should not be stored and served directly from the application instance unless explicitly justified.

Preferred approach:
- Use object storage plus CDN delivery.
- Enforce file validation, size limits, and content-type restrictions.

## 13. Enforce CORS Intentionally
APIs must define an explicit CORS policy.

Minimum standard:
- Allow only required origins.
- Restrict credentials usage.
- Review wildcard usage carefully.

## 14. Do Not Send Email Synchronously in Request Paths
Email delivery should not block request handlers for user-facing operations.

Preferred approach:
- Queue email work asynchronously.
- Return success for accepted work, not completed delivery.

## 15. Use Database Connection Pooling
Apps that connect to relational databases must use appropriate pooling or managed pooling infrastructure.

Minimum standard:
- Use pooled clients where supported.
- Set sane concurrency for serverless and worker environments.

## 16. Enforce Role Checks on Admin Surfaces
Admin and privileged routes must require explicit authorization checks.

Minimum standard:
- Check role or permission claims on every privileged route and action.
- Deny by default.

## 17. Provide Health Checks
Every deployed service should expose a health check endpoint or equivalent liveness signal.

Minimum standard:
- Include a lightweight readiness/liveness path.
- Monitor it externally.

## 18. Log Production Failures
Production systems must emit structured logs for key failures and important state transitions.

Minimum standard:
- Log auth failures, upstream failures, job failures, webhook failures, and unexpected exceptions.
- Do not log secrets or sensitive personal data.

## 19. Define a Backup and Recovery Strategy
Every production database must have a backup and restoration plan.

Minimum standard:
- Define backup cadence.
- Test restoration periodically.
- Know recovery point and recovery time expectations.

## 20. Prefer Typed Code for Application Logic
Use TypeScript or another strong typing strategy for application code where available.

Minimum standard:
- Prefer TypeScript for new JavaScript application code.
- Validate runtime inputs even when static types exist.

## Review Checklist Before shipping
- Public APIs are rate-limited.
- Secrets are not exposed to clients.
- Webhooks verify signatures.
- Sessions and recovery links expire.
- List queries paginate.
- Queried fields are indexed.
- Admin routes enforce authorization.
- Env vars validate at startup.
- Production logging and health checks exist.
- Backups and recovery are defined.
