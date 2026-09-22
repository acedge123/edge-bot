---
name: Guild Leadscore
description: "Operate Guild Leadscore product tenants (Purchase, Refinance, HELOC) in the Lead Scoring Engine. Use to fetch live scoring configuration (questions/models/rules), run dry-run lead scoring, and summarize current thresholds using env vars GUILD_PURCHASE, GUILD_REFINANCE, GUILD_HELOC."
---

# Guild Leadscore (Purchase / Refinance / HELOC)

## Tenant keys (env vars)
- Purchase: `GUILD_PURCHASE`
- Refinance: `GUILD_REFINANCE`
- HELOC: `GUILD_HELOC`

Do **not** write raw key values to files or chat; only reference the env var names.

## Base URL
- Prod manage router: `https://api-docs-template-production.up.railway.app/api/manage`

## Authentication

Send the selected tenant key as `X-API-Key`:

```text
X-API-Key: ${GUILD_PURCHASE|GUILD_REFINANCE|GUILD_HELOC}
Content-Type: application/json
```

Do not send these tenant keys as `Authorization: Token`; the `/api/manage`
router rejects that legacy authentication shape.

## Get current scoring config (authoritative)
For a given tenant key:
- `domain.leadscoring.questions.list`
- `domain.leadscoring.models.list`
- `domain.leadscoring.rules.list`

## Get “threshold behavior” when ranges aren’t listable
There is no `ranges.list` action. When you need the *actual* thresholds, infer them via `domain.leadscoring.leads.create` with `dry_run:true` by probing inputs and observing returned per-answer `points`.

Practical pattern:
1) Call `questions.list` to get the allowed choice `slug`s / slider bounds.
2) Call `leads.create` dry-run with representative answers.
3) For range-based scoring (e.g. HELOC LTV%), probe around expected breakpoints and report the implied intervals.

## Handy action payload templates

### List questions
```json
{"action":"domain.leadscoring.questions.list"}
```

### List models
```json
{"action":"domain.leadscoring.models.list"}
```

### List rules
```json
{"action":"domain.leadscoring.rules.list"}
```

### Dry-run score
```json
{
  "action":"domain.leadscoring.leads.create",
  "dry_run": true,
  "params": {"answers": [{"field_name":"...","response":"..."}]}
}
```
