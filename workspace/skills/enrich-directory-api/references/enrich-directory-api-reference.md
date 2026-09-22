# Enrich Directory API reference (Brand Connect Hub)

Source of truth in repo:
- `/app/.openclaw/workspace/repos/brand-connect-hub/docs/enrich-directory-api.md`
- `/app/.openclaw/workspace/repos/brand-connect-hub/supabase/functions/enrich-directory/index.ts`

## Auth

All requests require:

- `Authorization: Bearer <ENRICHMENT_AGENT_KEY>`

401 if missing/invalid.

## Routes

### POST /enrich-directory/next

Request body (optional):

```json
{ "agent_id": "my-scraper-v1" }
```

Response when a row is available:

```json
{ "row": { "id": "...", "name": "...", "website": "...", "scrape_attempts": 1, "enrichment_version": 0, "claimed_at": "...", "claimed_by": "..." } }
```

Response when empty:

```json
{ "message": "No rows to enrich", "row": null }
```

Selection rules:
- Picks `pending` first, then `failed`
- Only rows with `claimed_at IS NULL`
- Only rows with `scrape_attempts < 3`
- Requires `website IS NOT NULL`
- Skips rows whose `website` is an Instagram URL (`%instagram.com%`)
- Increments `scrape_attempts` when claimed
- Auto-releases stale `in_progress` claims older than 15 minutes
- Auto-demotes rows with missing/Instagram-only websites to `needs_review`

### PATCH /enrich-directory/<id>

Request (success):

```json
{ "status": "completed", "enriched_fields": { "description": "...", "city": "..." } }
```

Request (failure):

```json
{ "status": "failed", "error": "Website returned 404" }
```

Request (needs review):

```json
{ "status": "needs_review", "enriched_fields": { "description": "Possibly closed" } }
```

`enriched_fields` allowlist (others ignored):

- `category`, `venue_type`, `city`, `state`, `street_address`, `zip_code`, `phone`
- `description`, `short_description`, `website`, `logo_url`
- `price_level`, `rating`, `review_count`, `mom_relevance_score`
- `hours_of_operation`, `age_range`, `tags`, `images`, `amenities`, `social_links`, `verified`

### POST /enrich-directory/<id>/release

Releases a claim without changing enrichment:

```json
{ "success": true, "id": "<id>", "released": true }
```

### GET /enrich-directory/stats

Returns counts by status.
