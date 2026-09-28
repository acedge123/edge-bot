# Lead Scoring Engine — API Endpoints (high-signal)

This repo exposes two “styles” of management APIs:

## A) Control-plane style (single `/api/manage` endpoint)

From the root `API-DOCUMENTATION.md` (repo root):

- `POST /api/manage` with `X-API-Key: <key>`
- Example action used for question creation:
  - `domain.leadscoring.questions.upsert_bulk`

This is the preferred path for bulk syncing a form → questions.

## B) Traditional REST (DRF) endpoints

From `backend/API_DOCUMENTATION.md` (token auth examples):

- `POST /api/v1/leads/` (submit answers, get x/y/total + recommendations)
- `/api/v1/questions/` (CRUD)
- `/api/v1/choices/` (CRUD)
- `/api/v1/scoring-models/` (CRUD)
- `/api/v1/value-ranges/` and `/api/v1/date-ranges/` (range bins)
- `/api/v1/recommendations/` (rules + affiliate payload)

Note: exact auth differs between A and B; check deployment configuration.

## Env vars / keys

- Alan indicated an env var `GUILD_HELOC` exists and contains an API key for the HELOC tenant.
