---
name: google-places
description: |
  Call Google Places API (New) for text search and place details using GOOGLE_MAPS_API_KEY. Use when enriching addresses, verifying venues, or looking up business metadata for a local sponsors database or similar. No browser required; uses curl or the bundled Node script.
metadata: {"clawdbot":{"requires":{"env":["GOOGLE_MAPS_API_KEY"]}}}
---

# Google Places API (New)

Use **Google Places API (New)** with env **`GOOGLE_MAPS_API_KEY`**.

## Setup (Google Cloud)

1. Create or select a project; enable **Places API (New)** (not only legacy “Places API” if you use endpoints below).
2. Create an API key; restrict it (HTTP referrers for web apps; **IP** or **none** for server — Railway egress IPs can change, so prefer **API restriction** to Places only).
3. Set **`GOOGLE_MAPS_API_KEY`** in Railway / local `.env` for the gateway container.

## Helper script (preferred in workspace)

From repo root (or skill dir):

```bash
export GOOGLE_MAPS_API_KEY="your-key"
node workspace/skills/google-places/places-search.mjs search "Acme Corp Austin TX"
node workspace/skills/google-places/places-search.mjs details places/ChIJxxxxxxxx
```

- **`search`** — `places:searchText`; prints JSON with `places[]`.
- **`details`** — `GET /v1/places/{id}`; use full `places/ChIJ…` from search.

## Text search (curl)

```bash
curl -sS -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: ${GOOGLE_MAPS_API_KEY}" \
  -H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.websiteUri,places.types" \
  -d '{"textQuery":"QUERY TEXT HERE"}'
```

Adjust **FieldMask** for fewer/more fields ([Places API field reference](https://developers.google.com/maps/documentation/places/web-service/place-details#fields)).

## Place details (curl)

Use **`name`** from search (e.g. `places/ChIJN1t_tDeuEmsRUsoyG83frY4`):

```bash
curl -sS "https://places.googleapis.com/v1/places/ChIJxxxxxxxx" \
  -H "X-Goog-Api-Key: ${GOOGLE_MAPS_API_KEY}" \
  -H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.websiteUri,places.types"
```

(If the API returns the resource without `places.` prefix in the path, use the exact `name` field from the search response.)

## Legacy Places API (optional)

If you must use the older endpoint:

```bash
curl -sS "https://maps.googleapis.com/maps/api/place/textsearch/json?query=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' 'QUERY')&key=${GOOGLE_MAPS_API_KEY}"
```

Prefer **Places API (New)** for new work.

## Billing and quotas

Places (New) is **paid** after free tier; monitor usage in Google Cloud Console.

## Related skill

For merging results into a **local sponsors list**, use **`sponsors-database`** (`workspace/skills/sponsors-database/SKILL.md`).
