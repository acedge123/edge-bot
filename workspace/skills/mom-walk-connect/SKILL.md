---
name: mom-walk-connect
description: "Work with The Mom Walk Connect (Mom Walk Collective) app data, Supabase backend, and enrichment workflows. Use when a user asks in this channel about Mom Walk \"Communities\", \"Events\", \"Ambassadors\", city/state chapters (e.g., \"Franklin, TN\"), community profiles, ambassador names, event lists, attendee emails, or any data enrichment / brand portal data enrichment / local sponsor data enrichment task."
---

# Mom Walk Connect quick workflow (Supabase REST)

Use the Supabase project from the repo `repos/mom-walk-connect/.env`.

## 0) Get Supabase URL + anon key

Read:
- `repos/mom-walk-connect/.env`

Use:
- `VITE_SUPABASE_URL` as `SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` as `ANON`

For REST calls:
- Header `apikey: $ANON`
- Header `Authorization: Bearer $ANON`

## 0b) Use `/manage` with an admin login when needed

If you need admin-only data or write actions, sign in with a Supabase user account that has the `admin` role, then call:

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/manage" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource":"communities","action":"list","params":{"limit":100}}'
```

The `/manage` endpoint is a proxy to `api-gateway`, and the JWT must come from Supabase email/password auth (or refresh-token exchange). The gateway checks `has_role(..., 'admin')` before allowing admin actions.

### Exact query shapes we’ve used

**Communities count (paginate, then count returned rows):**

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/manage" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource":"communities","action":"list","params":{"limit":1000,"offset":0,"active_only":false}}'
```

Repeat with `offset += 1000` until the page returns fewer than 1000 rows, then count all rows returned across pages.

**Community lookup by substring (example `e2e`):**

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/manage" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource":"communities","action":"list","params":{"limit":1000,"offset":0,"active_only":false}}'
```

Then filter the returned names client-side for case-insensitive contains matches like `e2e`.

**Ambassador for a community:**

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/manage" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource":"communities","action":"get-profile","params":{"community_id":"<COMMUNITY_ID>"}}'
```

Then use the returned `ambassador_id` in:

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/manage" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource":"profiles","action":"get","params":{"user_id":"<AMBASSADOR_ID>"}}'
```

**Upcoming events count:**

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/manage" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource":"admin","action":"list-events","params":{"limit":100,"offset":0}}'
```

Paginate through all pages, then filter `event_date > now` client-side and count them.

**Members / profiles totals:**

Do not sum a single paginated page. Use a full-table count query against PostgREST, or paginate all rows explicitly. The safe fallback is to page through all rows and count them client-side, rather than trusting the first 100/1000 results.

**Important:** never infer global totals from a single page of results. If the API doesn’t expose a true count, fetch every page and sum client-side.

**Support / account recovery flow now in `/manage`:**

- `admin.find-user` with `{ query }` does a fuzzy match on email or name and returns `user_id`, `email`, `name`, `location`, ban/mute flags, and roles.
- `admin.reset-user-password` with `{ email }` or `{ user_id }` generates a readable temp password, sets it, and emails it via the branded temporary-password template.
- Ambiguous email matches return `409` and require `user_id`.
- Deleted accounts are excluded.
- The reset action writes an audit row to `admin_notifications` and returns `emailed: true` when delivery succeeds.
- Agent minting uses the `MOM_WALK_AGENT_MINT_SECRET` env secret, not any older deleted secret name.
- Use `notify: false` only if delivery is broken and you need a dry-run style fallback.

## 1) Find a community by name (city/state)

Example (case-insensitive contains match):

```sh
curl -sS -G "$SUPABASE_URL/rest/v1/communities" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  --data-urlencode "select=id,name,location,state" \
  --data-urlencode "name=ilike.*Franklin*" \
  --data-urlencode "limit=20"
```

Pick the exact match like `"Franklin, TN"` and copy its `id`.

## 2) Get ambassador_id for that community

Query `community_profiles` by `community_id`:

```sh
curl -sS -G "$SUPABASE_URL/rest/v1/community_profiles" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  --data-urlencode "select=community_id,name,location,state,ambassador_id,contact_email,social_links" \
  --data-urlencode "community_id=eq.<COMMUNITY_ID>"
```

This should return `ambassador_id` (UUID).

## 3) Resolve ambassador name

`profiles` may be RLS-protected; use the safe view `public_profiles`:

```sh
curl -sS -G "$SUPABASE_URL/rest/v1/public_profiles" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  --data-urlencode "select=user_id,display_name,first_name,last_name,avatar_url,location,state" \
  --data-urlencode "user_id=eq.<AMBASSADOR_ID>"
```

Return the ambassador’s human name (prefer `first_name + last_name`, fallback `display_name`).

## Notes / gotchas

- `ambassador_assignments` may not be readable with anon key due to RLS; prefer `community_profiles.ambassador_id` + `public_profiles` for name lookups.
- If multiple communities match (e.g., multiple Franklins), disambiguate by `state`.
- For enrichment work, use `repos/brand-connect-hub/docs/enrichment-pipeline.md` and `repos/brand-connect-hub/docs/enrich-directory-api.md` as the operational reference: you MUST claim via `POST /enrich-directory/next` with `min_priority: 100`, crawl the site (About/Contact/footer/mailto/socials), then `PATCH /enrich-directory/:id` with `contact_email` and other enriched fields.
- New sponsor-review flow: after discovery, promote local companies to `review_status: "pending_review"` so ambassadors can approve them before email. Use `agent-sponsor-ops` with `Authorization: Bearer $ENRICHMENT_AGENT_KEY`, `GET /stats` to inspect backlog/autopilot, `GET /communities/next` to choose the next community, and `POST /run-cycle` with `dry_run: true` by default.
- If a run returns `stop: true` or `idempotent: true`, move to the next community.
- Watch `sponsors_awaiting_ambassador_review` and `sponsors_ready_for_outreach` (approved only) in stats.
- New review/reporting route: `GET /agent-sponsor-ops/review-status?days=1` returns pending_review / approved / declined counts, approved_in_window / declined_in_window, reviewer attribution, and per-community breakdowns. Filter with `community_id` or `community=Honolulu`.
- New enrichment route: `POST /agent-sponsor-ops/enrich` with `{ "community": "Honolulu, HI", "batch_size": 10, "rounds": 3 }` runs Firecrawl enrichment on ambassador-approved rows only and returns what remains pending.
- New admin-agent-ops surface for `ENRICHMENT_AGENT_KEY`: `docs/admin-agent-ops.md` covers `GET/POST /brands`, `GET/POST /recap-campaigns`, `GET /local-sponsorships?unpaid_only=true`, `POST /payouts/generate`, and `POST /payouts/pay`.
- Payout safety contract: `POST /payouts/pay` is dry-run by default, requires `confirm: true`, caps at $5,000 per call, and uses Stripe idempotency keys per payout.
- Human-readable payout formatting: present money in dollars, not cents, and include ambassador splits when available, e.g. `owed $50.00 split across 2 ambassadors` plus per-recipient amounts.
- Only use `dry_run: false` when ambassadors or admins have explicitly approved the sponsors.
- Keyword cues: data enrichment, brand portal data enrichment, local sponsor data enrichment, ambassador sponsor review, admin-agent-ops.
- Operational shortcut: `playbooks/mom-walk-enrichment.md`.
