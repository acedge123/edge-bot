---
name: repo-security-checks
description: Review a code repository for baseline security issues and missing controls using Alan's Security Standards checklist (rate limiting, token storage, input validation, secrets exposure, webhook signature verification, indexing, UI error boundaries, session expiry, pagination, reset link expiry, env var validation, uploads/CDN, CORS, async email, DB pooling, role checks, health checks, structured logging, backups, typed code). Use when Alan asks for a "security check" / "security review" / "audit" of a repo, or when scanning repos while Alan is away.
---

# Repo Security Checks

## Source of truth
- Read: `references/security-standards.md` (this is Alan’s baseline checklist).
- Read: `references/llm-security-pointers.md` (LLM-specific failure modes + review reminders).
- Read: `references/ai-dev-production-gotchas.md` (fast “prod reality check” list; pairs well with security review).

When reviewing security, also check the repo against the **Unified Architecture** standard in `skills/unified-architecture/SKILL.md`, especially around explicit boundaries, typed failures, observability, and recovery paths.

## Workflow (quick, repeatable)
1. **Establish the public surfaces**
   - List externally reachable HTTP routes (API routers, edge functions, serverless handlers) and any webhook endpoints.
2. **Run fast scans to find likely violations** (use `rg` first, then inspect files)
   - Token storage: `rg -n "localStorage|sessionStorage"`
   - Secrets in client: `rg -n "NEXT_PUBLIC|VITE_|REACT_APP_|public.*key|api[_-]?key|secret"`
   - Rate limit / throttling: `rg -n "rate.?limit|throttle|limiter"`
   - Webhooks: `rg -n "webhook|signature|HMAC|stripe-signature|x-hub-signature|svix"`
   - Input validation: `rg -n "zod|yup|joi|valibot|superstruct|validator"`
   - SQL safety: `rg -n "SELECT |INSERT |UPDATE |DELETE |\$\{.*\}"`
   - Pagination: `rg -n "limit\(|offset\(|pageSize|cursor|pagination"`
   - CORS: `rg -n "cors\(|Access-Control-Allow-Origin"`
   - Health checks: `rg -n "healthz|/health|/ready|/live"`
   - Logging: `rg -n "logger\.|console\.error|Sentry|Logtail|pino|winston"`
3. **Validate each checklist item against the repo reality**
   - For each standard: record **Pass / Fail / Unknown**, evidence (file + line), and remediation.
4. **Call out exceptions explicitly**
   - If the repo intentionally violates a standard, look for an exception doc; if none, recommend adding one.

## Output format
Return a concise report:
- **Summary**: top risks (max ~5)
- **Checklist**: Pass/Fail/Unknown with evidence pointers
- **Remediation plan**: ordered, smallest-safe-changes first

## Guardrails
- Prefer evidence over inference. If you can’t prove a control exists, mark **Unknown** and say what to check next.
- Never paste secrets; redact with `***`.
