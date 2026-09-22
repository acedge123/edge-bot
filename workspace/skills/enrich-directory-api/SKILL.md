---
name: enrich-directory-api
description: Agent workflow for Brand Connect Hub's Supabase Edge Function that queues/claims/enriches directory or prospect rows (local_sponsors / local_prospects). Use when implementing or operating the enrichment agent, testing the /enrich-directory endpoints, debugging 401 Unauthorized (ENRICHMENT_AGENT_KEY), or updating docs/client code for claim-next/update/release/stats routes.
---

# Enrich Directory API (Brand Connect Hub)

Operate the **Brand Connect Hub** Supabase Edge Function `enrich-directory`, used by an external “enrichment agent” to claim rows from `local_sponsors` or `local_prospects`, scrape/enrich them, then write enriched fields back.

## Quick facts

- Repo (local): `/app/.openclaw/workspace/repos/brand-connect-hub`
- Edge function: `supabase/functions/enrich-directory/index.ts`
- Docs: `docs/enrich-directory-api.md`
- Auth env var: `ENRICHMENT_AGENT_KEY` (Railway: set in the Brand Connect Hub service env)
- Primary use case now includes local prospect enrichment, not just sponsor-directory cleanup

## API surface (what to call)

Base URL:

- `https://<project-ref>.supabase.co/functions/v1/enrich-directory`

All requests:

- Header: `Authorization: Bearer <ENRICHMENT_AGENT_KEY>`

Endpoints:

1. `POST /enrich-directory/next`
   - Claims the next eligible row (`pending` first, then `failed` with attempts < 3)
   - Auto-releases stale claims (>15 min)
   - Auto-releases stale claims (>15 min)
   - Rows without a website (or with Instagram-only websites) remain eligible; the enrichment agent should use name + community/location (e.g., Places search) and mark `needs_review` only when ambiguous

2. `PATCH /enrich-directory/<id>`
   - Writes `enriched_fields` (allowlist) + sets final `status` (`completed|failed|needs_review`)
   - On `completed`, increments `enrichment_version`

3. `POST /enrich-directory/<id>/release`
   - Releases a claim without updating enrichment (returns row to `pending`)

4. `GET /enrich-directory/stats`
   - Returns counts by `scrape_status`

## Prospect enrichment guidance

Use this workflow for local prospect tables when the goal is to enrich public business contact data:

- **primary goal: find and write a public contact email** whenever one is available
- start with the prospect name + website
- scrape the website for public contact details, with email as the first target, then phone, location, and social links
- fall back to Google Places when the site is thin, ambiguous, or missing
- prefer public business contact info, not private/personal data
- mark `needs_review` when multiple businesses match, contact data is uncertain, or no public email can be confirmed
- keep the workflow row-based and reviewable, so a human can audit ambiguous matches

## Minimal agent loop (canonical)

1. `POST /next` with optional `{ "agent_id": "my-agent" }`
2. If `row` is null → stop
3. Enrich using `row.website`, `row.name`, etc., with a first pass focused on finding a public contact email
4. `PATCH /<id>` with `{ status, enriched_fields }`
5. Repeat

## Optional: Google Places enrichment (recommended first pass)

If the row has a **name** and at least a rough **location** (city/state) but the website scrape is thin/ambiguous, use **Google Places API (New)** as a fast first pass for:

- formatted address
- phone
- lat/lng
- website
- place types

Use the workspace skill **`google-places`** (`skills/google-places/SKILL.md`). Requires env **`GOOGLE_MAPS_API_KEY`**.

Typical pattern:

1. `places:searchText` with a query like: `"{name} {city} {state}"`
2. Pick best match; fetch `details` if needed
3. Merge into `enriched_fields` and mark `completed` (or `needs_review` if ambiguous)

## Debug checklist

- **401 Unauthorized**: confirm Railway/Supabase env has `ENRICHMENT_AGENT_KEY` set, and the client sends `Authorization: Bearer <exact-value>`.
- **Queue appears stuck**: check for rows `in_progress` older than 15 minutes (they should be auto-released on next `/next` call).
- **Updates not persisting**: verify keys in `enriched_fields` are in the allowlist (others are silently ignored).

## Reference

If you need the exact request/response examples and field allowlist, read:

- `references/enrich-directory-api-reference.md`

If you’re implementing/running the agent, also see:

- `playbooks/enrich-directory-agent-places-first.md`
