---
name: sponsors-database
description: |
  Enrich and maintain a local sponsors database (JSON) using Google Places: resolve venues, normalize addresses, store place_id and contact fields. Use when the user asks to update sponsors, dedupe venues, or fill missing sponsor rows. Requires GOOGLE_MAPS_API_KEY and the google-places skill for API calls.
metadata: {"clawdbot":{"requires":{"env":["GOOGLE_MAPS_API_KEY"]}}}
---

# Sponsors database (local + Places enrichment)

**Sub-agent / workflow skill:** keep a **local** sponsors list under the workspace and **enrich** it with **Google Places** via **`GOOGLE_MAPS_API_KEY`**.

## Dependencies

- **`google-places`** — `workspace/skills/google-places/SKILL.md` and `places-search.mjs`
- **Env:** `GOOGLE_MAPS_API_KEY` (Places API **New** enabled)

## Canonical data path

| Path | Purpose |
|------|---------|
| `workspace/data/sponsors/sponsors.json` | **Live** local DB (gitignored — do not commit secrets or PII unnecessarily) |
| `workspace/data/sponsors/sponsors.schema.example.json` | Committed **shape** reference |

Create `sponsors.json` by copying the example if missing. **Back up** before bulk edits:

```bash
cp workspace/data/sponsors/sponsors.json workspace/data/sponsors/sponsors.backup.json
```

## Row shape (enriched sponsor)

Each entry is an object; extend with your org’s fields. **Places-backed** fields:

| Field | Source |
|-------|--------|
| `sponsor_id` | Your stable id (slug or UUID) |
| `name` | Display name (your canonical name; may differ from Places `displayName`) |
| `google_place_id` | Places `id` / resource name (`places/ChIJ…`) for idempotent refresh |
| `formatted_address` | Places |
| `lat`, `lng` | Places `location.latitude`, `location.longitude` |
| `phone` | Places `internationalPhoneNumber` or `nationalPhoneNumber` |
| `website` | Places `websiteUri` |
| `types` | Places `types` (array) |
| `google_maps_uri` | Places `googleMapsUri` if requested in field mask |
| `places_last_enriched_at` | ISO-8601 timestamp when row was last updated from API |
| `enrichment_notes` | Ambiguity, multiple matches, user override |

**Rule:** Use **`google_place_id`** as the join key when re-fetching details.

## Workflow

1. **Read** `workspace/data/sponsors/sponsors.json` (or create from example).
2. For each sponsor missing address / phone / coords (or stale `places_last_enriched_at`):
   - Build a **`textQuery`**: prefer `name` + city/state/country already on file.
   - Run **`google-places`**: `node workspace/skills/google-places/places-search.mjs search "…"`.
3. **Pick** the best `places[]` match (human or agent: check name, city, types).
4. Optionally **`details`** for the chosen `name` if search payload is thin.
5. **Merge** into the row; set `places_last_enriched_at`; never overwrite explicit user overrides without confirmation (use `enrichment_notes`).
6. **Write** JSON back with valid UTF-8 and stable key ordering optional (pretty-print for diffs).

## Safety

- **Do not** commit API keys; **`GOOGLE_MAPS_API_KEY`** is env-only.
- **PII / contracts:** confirm you may store phone/address under your policy.
- **Rate limits:** batch enrichments; avoid tight loops on large files in one run.
- If Places returns **no** or **multiple** strong matches, set `confidence` in `enrichment_notes` and leave fields null rather than guessing.

## Checklist before “done”

- [ ] `GOOGLE_MAPS_API_KEY` set in runtime
- [ ] Each enriched row has `google_place_id` or documented why not
- [ ] JSON validates (parse check)
- [ ] Backup or git diff reviewed for accidental mass deletes
