# Agentic Control Plane Kit

A reusable starter kit for adding a `/manage` control-plane API to any multi-tenant SaaS platform.

## Overview

This kit provides:
- **Spec** — Universal contract (request/response envelope, error codes, impact shape, audit). Language-agnostic.
- **Kernels** — Language-specific implementations that conform to the spec:
  - **kernel/** (TypeScript) — Node, Supabase Edge, Express, Next.js
  - **kernel-py/** (Python) — Django, FastAPI (skeleton; implement to pass conformance)
- **Packs** — Swappable domain modules (IAM, webhooks, settings, billing, domain)
- **Bindings** — Repo-specific configuration layer
- **Conformance Tests** — HTTP-based tests; run against any `/manage` endpoint

## Quickstart

### 1. Install

```bash
npm install agentic-control-plane-kit
# or
yarn add agentic-control-plane-kit
```

### 2. Define Your Bindings

Create a `bindings.json` file:

```json
{
  "tenant": {
    "table": "brands",
    "id_column": "id",
    "get_tenant_fn": "get_my_brand_id",
    "is_admin_fn": "is_platform_admin"
  },
  "auth": {
    "keys_table": "api_keys",
    "key_prefix": "ock_",
    "prefix_length": 12,
    "key_hash_column": "key_hash",
    "key_prefix_column": "prefix",
    "scopes_column": "scopes"
  },
  "database": {
    "adapter": "supabase",
    "service_role_key": "${SUPABASE_SERVICE_ROLE_KEY}"
  }
}
```

### 3. Implement Adapters

```typescript
import { Kernel, createSupabaseAdapter } from 'agentic-control-plane-kit';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const dbAdapter = createSupabaseAdapter(supabaseAdmin);

const kernel = new Kernel({
  dbAdapter,
  bindings: require('./bindings.json'),
  packs: ['iam', 'webhooks', 'settings'] // Install packs
});

// Export as edge function or Express middleware
export default kernel.handler;
```

### 4. Deploy

The kernel exports a standard request handler that works with:
- Supabase Edge Functions
- Vercel Serverless Functions
- Express.js
- Next.js API Routes
- Any Node.js HTTP server

## How to Integrate into a Host Repo

### Example: Express.js / Next.js API Route

```typescript
// pages/api/manage.ts (Next.js) or routes/manage.ts (Express)
import { createManageRouter, Pack } from 'agentic-control-plane-kit';
import { iamPack, webhooksPack, settingsPack } from 'agentic-control-plane-kit/packs';
import { createMyDbAdapter } from './adapters/db';
import { createMyAuditAdapter } from './adapters/audit';
import { createMyIdempotencyAdapter } from './adapters/idempotency';
import { createMyRateLimitAdapter } from './adapters/rate-limit';
import { createMyCeilingsAdapter } from './adapters/ceilings';
import bindings from './config/bindings.json';

// Create adapters (implement interfaces from kernel/src/types)
const dbAdapter = createMyDbAdapter();
const auditAdapter = createMyAuditAdapter();
const idempotencyAdapter = createMyIdempotencyAdapter();
const rateLimitAdapter = createMyRateLimitAdapter();
const ceilingsAdapter = createMyCeilingsAdapter();

// Install packs
const packs: Pack[] = [iamPack, webhooksPack, settingsPack];

// Create router
const manageRouter = createManageRouter({
  dbAdapter,
  auditAdapter,
  idempotencyAdapter,
  rateLimitAdapter,
  ceilingsAdapter,
  bindings,
  packs
});

// Express handler
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await req.json();
    const response = await manageRouter(body, {
      request: req,
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent']
    });

    res.status(response.status || 200).json(JSON.parse(response.body));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Example: Supabase Edge Function

```typescript
// supabase/functions/manage/index.ts
import { createManageRouter, Pack } from 'agentic-control-plane-kit';
import { iamPack, webhooksPack, settingsPack } from 'agentic-control-plane-kit/packs';
import { createSupabaseDbAdapter } from './adapters/supabase-db';
import { createSupabaseAuditAdapter } from './adapters/supabase-audit';
import { createSupabaseIdempotencyAdapter } from './adapters/supabase-idempotency';
import { createSupabaseRateLimitAdapter } from './adapters/supabase-rate-limit';
import { createSupabaseCeilingsAdapter } from './adapters/supabase-ceilings';
import bindings from './config/bindings.json';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Create adapters (adapter-driven, not hardcoded)
const dbAdapter = createSupabaseDbAdapter(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const auditAdapter = createSupabaseAuditAdapter();
const idempotencyAdapter = createSupabaseIdempotencyAdapter();
const rateLimitAdapter = createSupabaseRateLimitAdapter();
const ceilingsAdapter = createSupabaseCeilingsAdapter();

// Install packs
const packs: Pack[] = [iamPack, webhooksPack, settingsPack];

// Create router
const manageRouter = createManageRouter({
  dbAdapter,
  auditAdapter,
  idempotencyAdapter,
  rateLimitAdapter,
  ceilingsAdapter,
  bindings,
  packs
});

// Edge function handler
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const response = await manageRouter(body, {
      request: req,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown'
    });

    return new Response(response.body, {
      status: response.status || 200,
      headers: { 'Content-Type': 'application/json', ...response.headers }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

### Step 1: Copy the Kit

```bash
# Option A: Install as npm package
npm install agentic-control-plane-kit

# Option B: Copy kernel source into your repo
cp -r node_modules/agentic-control-plane-kit/kernel ./src/manage
```

### Step 2: Create Bindings File

Inspect your codebase and create `config/bindings.json`:

- **Tenant model**: What table stores tenants? (`brands`, `orgs`, `workspaces`)
- **Auth**: Where are API keys stored? What's the prefix format?
- **Database**: What client do you use? (Supabase, Prisma, Drizzle, raw SQL)

### Step 3: Implement Adapters

The kit defines interfaces. You implement adapters for your stack:

```typescript
// For Supabase
import { createSupabaseAdapter } from 'agentic-control-plane-kit/adapters/supabase';

// For Prisma
import { createPrismaAdapter } from 'agentic-control-plane-kit/adapters/prisma';

// Custom adapter
import { DbAdapter } from 'agentic-control-plane-kit/kernel/src/types';
class MyDbAdapter implements DbAdapter { ... }
```

### Step 4: Install Packs

Choose which packs to install:

```typescript
const kernel = new Kernel({
  dbAdapter,
  bindings,
  packs: [
    'iam',        // Almost always needed
    'webhooks',   // Almost always needed
    'settings',   // Common
    'billing',    // Optional (only if handling payments)
    'domain'      // Always (repo-specific)
  ]
});
```

### Step 5: Define Domain Actions

Create your repo-specific domain actions:

```typescript
// packs/domain/actions.ts
export const domainActions = [
  {
    name: 'domain.shop.products.list',
    scope: 'manage.domain',
    description: 'List products',
    params_schema: { ... }
  }
];
```

### Step 6: Generate OpenAPI Spec

```bash
npm run generate-openapi
# Outputs: public/api/openapi.json
```

### Step 7: Test

```bash
npm run test:invariants
# Runs TS kernel unit tests

npm run test:conformance
# Runs HTTP conformance tests — works against any kernel (TS or Python)
# Set ACP_BASE_URL and ACP_API_KEY to test your deployed /manage endpoint
```

## Architecture

**One spec, many kernels.** No Node sidecar everywhere — use the kernel for your stack.

```
┌─────────────────────────────────────────────────────────┐
│  Spec (universal)                                       │  Contract, error codes, impact shape, conformance tests
├─────────────────────────────────────────────────────────┤
│  Kernels (language-specific)                            │  kernel/ (TS), kernel-py/ (Python)
├─────────────────────────────────────────────────────────┤
│  Packs (swappable)                                       │  IAM, webhooks, settings, billing, domain
├─────────────────────────────────────────────────────────┤
│  Bindings (repo-specific)                               │  Tenant model, DB client, entity names
└─────────────────────────────────────────────────────────┘
```

### For Python (Django) clients

Use **kernel-py** — no Node service required. See [kernel-py/README.md](./kernel-py/README.md) and [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md).

### For Node/Supabase clients

Use **kernel/** (TypeScript).

## Documentation

- [spec/README.md](./spec/README.md) - Universal contract (source of truth)
- [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md) - Step-by-step integration for Django/Express/Supabase
- [kernel-py/README.md](./kernel-py/README.md) - Python kernel (Django/FastAPI)

## Real-World Integration Examples

### Onsite Affiliate (Supabase)
- ✅ Integrated with Edge Bot as Agent
- ✅ Uses IAM, Webhooks, Settings packs
- ✅ Domain pack: `domain.assets.*`, `domain.creators.*`, `domain.orders.*`

### Lead Scoring SaaS (Django)
- 📋 See [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md) for Django integration
- 📋 Domain pack: `domain.leadscoring.models.*`, `domain.leadscoring.rules.*`, `domain.leadscoring.scores.*`

## License

MIT
