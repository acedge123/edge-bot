---
name: agentic-control-plane
description: |
  Install the Agentic Control Plane Kit into a multi-tenant SaaS repo to add a /manage API. Use when asked to add agentic/management API capabilities, control plane, or install the kit on a target repo (e.g. lead scoring api-docs-template at github.com/acedge123/api-docs-template).
metadata: {"clawdbot":{"requires":{"bins":["node","npm"]},"targetRepos":["api-docs-template"]}}
---

# Agentic Control Plane Kit – Agent Skill

Use this skill when the user or a job asks you to **install agentic pieces**, add a **control plane /manage API**, or integrate the Agentic Control Plane Kit into a repository (e.g. the lead scoring repo at `github.com/acedge123/api-docs-template`).

## Kit Location

The kit is bundled with this skill:

```
<skill_root>/kit/
```

Or from the OpenClaw workspace:

```
$OPENCLAW_WORKSPACE/skills/agentic-control-plane/kit/
```

If working from a clone, ensure you have the latest version:

```bash
cd /path/to/agentic-control-plane-kit
git pull origin main
```

## What the Kit Provides

- **Spec** – Universal contract (request/response envelope, error codes, impact shape). Source of truth.
- **Kernels** – Language-specific implementations:
  - **kernel/** (TypeScript) – Node, Supabase Edge, Express
  - **kernel-py/** (Python) – Django, FastAPI (skeleton; implement to pass conformance)
- **Packs** – IAM, webhooks, settings (plus domain-template for custom actions)
- **Bindings** – Repo-specific config (tenant model, auth, database)
- **Conformance tests** – HTTP-based; run against any `/manage` endpoint

## Quick Integration Steps

### 1. Vendor the Kit

Copy the kit into the target repo:

```bash
cd /path/to/target-repo
mkdir -p control-plane
cp -r <kit_path>/kernel ./control-plane/
cp -r <kit_path>/packs ./control-plane/
cp -r <kit_path>/config ./control-plane/
```

### 2. Create Bindings

Create `config/bindings.json` (or equivalent) for the target repo:

- **Tenant model** – Table name (e.g. `tenants`, `brands`, `orgs`), id column, admin check
- **Auth** – API keys table, prefix (e.g. `ock_`), hash/prefix columns, scopes
- **Database** – Adapter type (supabase, prisma, drizzle, custom)

See `kit/config/example.bindings.json` and `kit/config/bindings.schema.json`.

### 3. Implement Adapters

Implement interfaces from `kernel/src/types.ts`:

- `DbAdapter` – query, getTenantFromApiKey, IAM/webhooks/settings methods
- `AuditAdapter` – log(entry)
- `IdempotencyAdapter` – getReplay, storeReplay
- `RateLimitAdapter` – check(apiKeyId, action, limit)
- `CeilingsAdapter` – check(action, params, tenantId)

### 4. Add Domain Pack (Optional)

For product-specific actions, create a domain pack using `packs/domain-template/` as reference.

### 5. Expose /manage Endpoint

- **Express/Next.js**: Use `kernel/` (TypeScript) — `createManageRouter({...}).handler`
- **Supabase Edge Function**: Same TS kernel, wrapped in `serve()`
- **Django**: Use **kernel-py** (Python) — no Node service. Implement `create_manage_router` per `kit/spec/` and `kit/kernel-py/README.md`. Pass conformance tests with `npm run test:conformance`

### 6. Generate OpenAPI

```bash
cd control-plane
npm install
npm run generate:openapi
```

## Target: Lead Scoring (api-docs-template)

For the lead scoring repo (`github.com/acedge123/api-docs-template`):

1. **Stack**: Django backend – use the Django integration path in `kit/INTEGRATION-GUIDE.md`
2. **Domain actions**: `domain.leadscoring.models.*`, `domain.leadscoring.rules.*`, `domain.leadscoring.scores.*`, `domain.leadscoring.leads.export`
3. **Bindings**: Map to existing tenant/org model, API keys table, and Django DB

See `kit/INTEGRATION-GUIDE.md` for full Django adapter examples and migration steps.

## Key Files to Read

| File | Purpose |
|------|---------|
| `kit/spec/README.md` | Universal contract (source of truth) |
| `kit/README.md` | Overview and quickstart |
| `kit/kernel-py/README.md` | Python kernel for Django/FastAPI |
| `kit/INTEGRATION-GUIDE.md` | Step-by-step Django/Express/Supabase integration |
| `kit/config/bindings.schema.json` | Bindings schema |
| `kit/config/example.bindings.json` | Example config |
| `kit/kernel/src/types.ts` | TS adapter interfaces |
| `kit/kernel-py/requirements.txt` | Python deps (kernel-py) |

## After Integration

- `meta.actions` – Lists all available actions (for agent discovery)
- `meta.version` – API version and schema info
- POST `/manage` with `{ action, params?, idempotency_key?, dry_run? }` and `X-API-Key` header
