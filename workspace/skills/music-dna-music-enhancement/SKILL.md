---
name: music-dna-music-enhancement
description: Expand and maintain the MusicDNA lane system, including lane routing, classifier prompts, catalog mappings, song canon seeding, pairing seeding, UI lane labels, and backlog-to-implementation updates. Use when asked to add or refine MusicDNA lanes, seed songs/pairings for a lane, reconcile docs with remote findings, or turn MusicDNA backlog notes into repo changes.
---

# MusicDNA Music Enhancement

## Goal

Keep MusicDNA honest: a lane should exist only when it can be routed, labeled, seeded, and paired.

## Workflow

1. Read the current lane backlog and the classifier source in `src/lib/musicdna.functions.ts`.
2. Pick one lane to fully implement before moving to the next.
3. Update routing first:
   - `LANES` / `Lane`
   - `LANE_RULES`
   - `catalogLaneToTopLane()`
   - visible lane label maps in the UI
4. Seed data second:
   - add canon songs with `primary_lane` set to the new lane
   - add within-lane pairings for that lane
5. Update docs:
   - mark the lane as implemented in `docs/musicdna/missing-lanes.md`
   - keep `docs/musicdna/catalog-expansion-spec.md` aligned
6. Verify the lane is actually reachable end-to-end.

## Guardrails

- Do not add a lane without at least some song canon and pairings.
- Do not leave `classic_rock` swallowing the new lane in the classifier prompt.
- Keep `pairings.lane` aligned with both songs’ `primary_lane`.
- Prefer a few high-quality seeded songs and pairings over bulk filler.

## Metal lane checklist

Use this when metal is the target lane:

- Route `metal` explicitly in the classifier prompt.
- Remove metal from `classic_rock` fallback language.
- Add metal song canon covering core anchors like Sabbath, Metallica, Maiden, Slayer, Tool, Mastodon, Deftones, Korn, Gojira, Pantera.
- Add at least 12 diagnostic pairings for metal.
- Add/update UI labels and any lane color mapping.
- Update the backlog note and record the implementation in memory.

## Output standard

When reporting progress, distinguish clearly between:
- routed in code
- seeded in data
- visible in UI
- documented in backlog
