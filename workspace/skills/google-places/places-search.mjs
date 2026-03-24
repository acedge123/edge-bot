#!/usr/bin/env node
/**
 * Google Places API (New) — text search and place details.
 * Env: GOOGLE_MAPS_API_KEY (enable "Places API (New)" in Google Cloud Console).
 *
 * Usage:
 *   node places-search.mjs search "Query near City"
 *   node places-search.mjs details PLACE_RESOURCE_ID
 *
 * Resource IDs look like: places/ChIJ... (use id from search results).
 */

const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key) {
  console.error("GOOGLE_MAPS_API_KEY is not set.");
  process.exit(1);
}

const SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.nationalPhoneNumber,places.websiteUri,places.types,places.googleMapsUri";

/** GetPlace uses top-level Place fields (not `places.` prefix). */
const DETAIL_FIELD_MASK =
  "id,displayName,formattedAddress,location,internationalPhoneNumber,nationalPhoneNumber,websiteUri,types,googleMapsUri";

async function searchText(textQuery) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Places searchText ${res.status}:`, text.slice(0, 2000));
    process.exit(1);
  }
  return JSON.parse(text);
}

async function placeDetails(placeResourceName) {
  const resource =
    placeResourceName.startsWith("places/")
      ? placeResourceName
      : `places/${placeResourceName}`;
  const placeId = resource.replace(/^places\//, "");
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": DETAIL_FIELD_MASK,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Places getPlace ${res.status}:`, text.slice(0, 2000));
    process.exit(1);
  }
  return JSON.parse(text);
}

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(" ").trim();

if (cmd === "search" && arg) {
  const data = await searchText(arg);
  console.log(JSON.stringify(data, null, 2));
} else if (cmd === "details" && arg) {
  const data = await placeDetails(arg);
  console.log(JSON.stringify(data, null, 2));
} else {
  console.error(`Usage:
  GOOGLE_MAPS_API_KEY=... node places-search.mjs search "business name city region"
  GOOGLE_MAPS_API_KEY=... node places-search.mjs details places/ChIJ...`);
  process.exit(1);
}
