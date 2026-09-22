---
name: tga-crm
description: Operate The Gig Agency CRM through its Supabase Manage API, including action discovery, people and task reads, dry runs, and guarded writes.
metadata: {"openclaw":{"requires":{"env":["TGA_CRM_ANON_KEY","TGA_CRM_API_KEY"]}}}
---

# Skill: TGA CRM (Supabase `/manage` Edge Function)

Use this skill to interact with The Gig Agency CRM “manage” API (a Supabase Edge Function) via `curl`.

## Safety / rules
- **Never print or paste secret values** (API keys, bearer tokens). Only reference env var names.
- Prefer `curl -sS` and capture outputs in logs/files if needed.
- For write operations, use actions that support `supports_dry_run: true` first when available.

## Required env vars
- `TGA_CRM_ANON_KEY` — used as the Bearer token
- `TGA_CRM_API_KEY` — passed as `x-api-key`

## Endpoint
- Base URL:
  - `https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage`

## Canonical request pattern (copy/paste)
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"<ACTION_NAME>","params":{}}'
```

## Discovery
### List available actions (schemas + required scopes)
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"meta.actions","params":{}}'
```

### Get API version
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"meta.version","params":{}}'
```

## Common read operations
### List tasks (all)
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.tasks.list","params":{"limit":50}}'
```

### Lookup `person_id` (assignee) by name/email
There isn’t currently a server-side “search by name” parameter exposed in `domain.people.list`, so the simplest pattern is:
1) fetch people, 2) filter client-side.

Fetch (up to 200):
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.people.list","params":{"limit":200}}'
```

Filter locally (examples):

- By exact name (requires `jq`):
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.people.list","params":{"limit":200}}' \
| jq -r '.data.people[] | select(.name=="Alan Edgett") | {person_id:.id, user_id:.user_id, name, email}'
```

- By email (requires `jq`):
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.people.list","params":{"limit":200}}' \
| jq -r '.data.people[] | select((.email|ascii_downcase)=="alan@thegig.agency") | {person_id:.id, user_id:.user_id, name, email}'
```

### List tasks assigned to a specific person (UI-style “Assignee” filter)
The UI’s “Alan Edgett” task count corresponds to `assignee_id` (a **person** id), not `user_id`.

```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.tasks.list","params":{"assignee_id":"<PERSON_ID>","limit":200}}'
```

### List companies
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.companies.list","params":{"limit":50}}'
```

### List contacts
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.contacts.list","params":{"limit":50}}'
```

## Common write operations (use dry-run first when supported)

### Create task (dry-run recommended)
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.tasks.create","params":{"user_id":"<USER_ID>","title":"<TITLE>","description":"<OPTIONAL>"}}'
```

### Update task (dry-run recommended)
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"domain.tasks.update","params":{"id":"<TASK_ID>","status":"<STATUS>","progress_notes":"<OPTIONAL>"}}'
```

## Admin / IAM
### List keys
```bash
curl -sS -X POST "https://nljhbmgbgqqcaxqbvghs.supabase.co/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TGA_CRM_ANON_KEY" \
  -H "x-api-key: $TGA_CRM_API_KEY" \
  -d '{"action":"iam.keys.list","params":{}}'
```

## Notes
- Calendar invites are supported via `domain.calendar.create_event` (requires API key scope `manage.domain` and working Google Domain-Wide Delegation config in the `/manage` backend).
- If you see auth failures, confirm both env vars are set in the current shell/process:
  - `echo ${TGA_CRM_ANON_KEY:+set} ${TGA_CRM_API_KEY:+set}`
- This API returns action metadata including required `scope` per action; align your API key scopes accordingly.
