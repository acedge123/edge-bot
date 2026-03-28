---
name: repo-map
description: "TGA monorepo orientation — which GitHub repo owns what, multi-repo boundaries, preferred commands. Use when planning changes across repos, choosing where code should live, or avoiding duplicate business logic."
---

# Repo Map (TGA workspace)

Use this skill when you need **where to implement** something across The Gig Agency repos, **who is authoritative** for a domain, or **default install/validate/deploy** commands.

This text mirrors the human-maintained file at the monorepo root: **`WORKSPACE_REPO_MAP.md`** (under `tga-workspace/`). It is **not** the Codex/Cursor `AGENTS.md` project rule file.

## Scope

- **On a developer machine:** repos usually live under `tga-workspace/repos/<repo-name>/`.
- **On the hosted Railway OpenClaw agent:** this skill is bundled under `/app/.openclaw/workspace/skills/repo-map/`; individual repos are **not** present unless cloned. Use this skill for **boundaries and conventions**; use `git clone` / mounted checkouts when you need the actual code.

## Canonical machine-readable map

When details drift, refresh from:

- `repos/sunafusion-agent-shell/repo-map/MASTER_DOMAIN_SUMMARY.md`
- `repos/sunafusion-agent-shell/repo-map/inventory.json`

(Paths relative to the `tga-workspace` root.)

## Working rules

- Inspect the target repo before proposing or making changes.
- Prefer updating docs before large migrations or multi-repo refactors.
- Treat shared tables, webhooks, auth flows, and key contracts as high-risk.
- When a repo has a canonical sibling, avoid duplicating business logic across repos.
- For multi-repo work, state which repo is authoritative and which repos are consumers.

## Repo map

### `sunafusion-agent-shell`

- Role: canonical personal agent shell and repo-map home.
- Purpose: AI agent platform with memory, tool access, and codebase understanding.
- Uses: Node, Vite, Supabase.
- Integrations: OpenAI, CreatorIQ, Redis, Stripe, AWS, Vercel, webhooks.
- Notes: repo-map and memory behavior start here; not the place for product-specific business logic.

### `ciq-automations`

- Role: canonical CreatorIQ automation repo.
- Purpose: automate CreatorIQ operations, workflows, webhook handling, and downstream activations.
- Uses: Node, Vite, Supabase.
- Integrations: CreatorIQ, OpenAI, Redis, Stripe, AWS, webhooks.
- Notes: most CreatorIQ automation changes should start here unless a narrower repo clearly owns the feature.

### `creatoriq-invoice-hub`

- Role: canonical CreatorIQ invoicing and payment-tracking repo.
- Purpose: invoice generation, payment tracking, tax and finance workflow support.
- Uses: Node, Vite.
- Integrations: CreatorIQ, Supabase, AWS, Vercel.
- Notes: finance and invoice logic should live here rather than in general CreatorIQ automation repos.

### `forecast-flex-wizard`

- Role: pacing and reporting app with human review UI.
- Purpose: planning, pacing, and performance reporting across media channels.
- Uses: Node, Vite, Supabase.
- Integrations: Supabase, Redis; currently includes Meta sync and in-progress Google Ads sync.
- Notes: good candidate for human-in-the-loop review surfaces before adding agent execution.

### `agentic-control-plane-kit`

- Role: canonical ACP gateway and security/governance repo.
- Purpose: machine-facing control plane for identity, policy, audit, approvals, connector trust, and governed execution.
- Uses: Node.
- Integrations: Supabase, Redis, Stripe, CreatorIQ, AWS, Vercel, webhooks.
- Notes: security roadmap, gateway auth/audit, and connector policy work should start here.

### `echelon-control`

- Role: ACP / Echelon product and hosted-control consumer of ACP patterns.
- Purpose: product-facing control surface, hosted job handling, and agent execution coordination.
- Uses: Node, Vite, Supabase.
- Integrations: Supabase, OpenAI, Stripe, AWS, webhooks.
- Notes: do not invent separate security models here when ACP already owns the canonical governance path.

### `onsite-affiliate`

- Role: canonical Onsite Affiliate app.
- Purpose: creator-facing affiliate platform, public join flows, dashboard, attribution, and partner-facing integrations.
- Uses: Node, Vite, Supabase.
- Integrations: Supabase, OpenAI, Redis, Stripe, AWS, Upstash, Vercel, webhooks.
- Notes: creator identity, onboarding, and creator lifecycle should converge here rather than in Shopify-hosted duplicates.

### `onsite-affiliate-sdr-agent-1`

- Role: control-plane and provisioning workbench for the Onsite Affiliate SDR effort.
- Purpose: dual-key provisioning, scoped API-key planning, and related control-plane scaffolding for Onsite Affiliate.
- Uses: Node and custom control-plane modules.
- Integrations: control-plane auth/provisioning patterns; coordinate closely with `onsite-affiliate`.
- Notes: treat this as implementation scaffolding for SDR-specific backend/control-plane work, not the canonical creator product surface.

### `Shopify_App`

- Role: merchant admin and Shopify integration repo for Onsite Affiliate-related commerce flows.
- Purpose: Shopify admin UI, app install/provisioning, storefront extensions, checkout pixel, and merchant settings.
- Uses: Node.
- Integrations: Shopify, Supabase, Stripe, AWS, webhooks.
- Notes: merchant configuration belongs here; creator-facing execution should move toward `onsite-affiliate`.

### `edge-bot` (this OpenClaw gateway image)

- Role: packaged OpenClaw gateway + Echelon worker + workspace skills (including this file).
- Purpose: hosted agent runtime, hooks, and automation glue; not the canonical home for unrelated product business logic.
- Notes: product features still belong in the authoritative repos above.

## Common multi-repo boundaries

- **CreatorIQ automation:** authoritative `ciq-automations`; specialized finance `creatoriq-invoice-hub`.
- **ACP / Echelon:** authoritative security/gateway `agentic-control-plane-kit`; product layer `echelon-control`.
- **Onsite Affiliate + Shopify:** merchant/admin `Shopify_App`; creator system of record `onsite-affiliate`; SDR workbench `onsite-affiliate-sdr-agent-1`.
- **Repo-map source:** `sunafusion-agent-shell/repo-map`.

## Update rule

When changing boundaries or adding repos:

1. Update canonical files under `sunafusion-agent-shell/repo-map/` when appropriate.
2. Sync **`WORKSPACE_REPO_MAP.md`** at the `tga-workspace` root.
3. Sync this **`repo-map`** skill (`workspace/skills/repo-map/SKILL.md` in `edge-bot`).

Keep descriptions short; do not duplicate the full canonical repo-map.

## Preferred commands

Use as defaults before rediscovering repo behavior.

### `forecast-flex-wizard`

- install: `npm install`
- dev: `npm run dev`
- validate: `npm run build`
- deploy backend: `supabase functions deploy <name>`
- notes: for Google Ads work, test `test-google-connection` before full sync.

### `onsite-affiliate`

- install: `npm install`
- dev: `npm run dev`
- validate: `npm run build`
- tests: `npm run test`
- deploy backend: Supabase migrations/functions plus frontend deploy path

### `onsite-affiliate-sdr-agent-1`

- install: `npm install`
- dev: `npm run dev`
- validate: `npm run build`
- QA: `npm run qa`
- ACP bootstrap: `npm run acp:install`

### `Shopify_App`

- install: `npm install`
- dev: `npm run dev`
- app server: `npm start`
- validate: `npm run build`
- deploy: Render plus Shopify app/extension workflow

### `agentic-control-plane-kit`

- install: `npm install`
- build: `npm run build`
- typecheck: `npm run typecheck`
- tests: `npm run test`
- stronger: `npm run verify`

### `echelon-control`

- install: `npm install`
- dev: `npm run dev`
- validate: `npm run build`
- tests: `npm run test`
- deploy backend: Supabase migrations/functions plus frontend deploy path

### `ciq-automations`

- install: `npm install`
- dev: `npm run dev`
- validate: `npm run build`
- deploy backend: Supabase migrations/functions plus app deploy path

### `creatoriq-invoice-hub`

- install: `npm install`
- dev: `npm run dev`
- validate: `npm run build`

### `sunafusion-agent-shell`

- install: `npm install`
- dev: `npm run dev`
- validate: `npm run build`
- repo-map regenerate: `npm run repo-map:scan`
- repo-map load: `npm run repo-map:load`
- deploy backend: Supabase functions plus app deploy path
