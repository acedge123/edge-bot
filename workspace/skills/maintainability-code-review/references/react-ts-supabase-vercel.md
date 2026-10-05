# React + TypeScript (Lovable) + Supabase + Vercel — maintainability review

## High-value checks

### Project structure
- Clear separation between:
  - `components/` (pure UI)
  - `features/` (domain-oriented flows)
  - `lib/` (shared utilities)
  - `server/` or `api/` (server-only code, if any)
- Avoid dumping everything into `components/`.

### Type safety and boundaries
- Use runtime validation (e.g., zod) at external boundaries:
  - request payloads
  - env vars
  - webhook bodies
- Keep Supabase generated types in one place; don’t cast `as any` to move faster.

### Data access patterns (Supabase)
- Prefer a small set of typed data-access helpers (one per table/aggregate) vs raw calls everywhere.
- For RPC/functions: enforce role checks server-side; document expected inputs/outputs.
- Ensure RLS policies are testable/understood; avoid “service role everywhere.”

### Error handling
- React: error boundaries on critical routes; consistent empty/loading/error states.
- Avoid silent failures (catch + ignore).

### Performance
- Avoid N+1 queries from the client.
- Use pagination by default (limit/offset or cursor), especially for admin tables.

### Deployment/ops (Vercel)
- Confirm env var naming and validation at startup.
- Ensure preview deployments don’t hit production data without intent.

## Red flags
- Business logic in React components (hard to test, hard to reuse).
- Permission checks only in the UI (must be enforced in DB/RLS/server).
- Multiple competing patterns for fetching (mix of direct Supabase, bespoke fetch wrappers, and server actions) without a single standard.

## Quick recommendations that reduce debt
- Introduce `lib/config.ts` with env validation.
- Introduce `lib/db/*.ts` for typed queries per domain.
- Add CI gates: `tsc --noEmit`, eslint, unit tests.
