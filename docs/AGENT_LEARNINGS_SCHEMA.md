# agent_learnings — Schema & Vault API Reference

This document is the **single source of truth** for the Edge Bot (and any other agent) to understand the `agent_learnings` table, relational memory tables, and how to interact with them via agent-vault.

**Base URL**: `https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault`

**Auth**: Bearer token (`AGENT_EDGE_KEY`) in `Authorization` header for all endpoints below. Never log or echo this token. Rotate via Supabase dashboard → Edge Functions secrets.

**Trust boundary**: Agents must only read/write records for the `owner_id` they are authorized for. The Edge Function enforces owner scoping; agents must not fabricate or guess cross-tenant `owner_id` values.

---

## Table: `public.agent_learnings`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `created_at` | timestamptz | NO | `now()` | Auto-set |
| `updated_at` | timestamptz | NO | `now()` | Auto-updated via trigger |
| `learning` | text | NO | — | **Required.** Main content body (max 8000 chars) |
| `category` | text | YES | `'general'` | Freeform grouping |
| `kind` | text | YES | `'general'` | Taxonomy for UI filtering |
| `visibility` | text | YES | `'private'` | Access tier for RLS |
| `source` | text | YES | `'codex'` | Origin system |
| `tags` | text[] | YES | — | Array of string tags |
| `confidence` | real | YES | `0.5` | 0.0–1.0 |
| `verified` | boolean | YES | `false` | Manual verification flag |
| `metadata` | jsonb | YES | `'{}'` | Arbitrary structured data |
| `owner_id` | uuid | YES | — | Tenant scoping |
| `subject_type` | text | YES | — | `person`, `repo`, `service`, `system` |
| `subject_id` | text | YES | — | Unique identifier for the subject |
| `subject_name` | text | YES | — | Human-readable name |
| `title` | text | YES | — | Short title (max 500 chars) |
| `summary` | text | YES | — | Human summary (max 2000 chars) |
| `redaction_level` | text | NO | `'sensitive'` | `public` / `internal` / `sensitive` |
| `domain` | text | YES | — | Knowledge domain (freeform) |
| `source_date` | date | YES | — | Source day the learning pertains to |
| `status` | text | NO | `'draft'` | `draft` / `approved` / `rejected` / `deprecated` |
| `source_refs` | text[] | YES | — | File paths, commit SHAs, or URLs |
| `details_markdown` | text | YES | — | Full learning in Markdown |

### Valid `kind` values

```
general, composio_trigger, chat_response, chat_query,
research_summary, github_push_summary, email_summary,
memory, decision, code_change, image_generation, db_query_result,
person, project, runbook, incident, integration,
playbook, gotcha, reference, research
```

### Valid `visibility` / `redaction_level` / `status` / `subject_type`

| Enum | Values |
|------|--------|
| `visibility` | `private`, `family`, `public` |
| `redaction_level` | `public`, `internal`, `sensitive` |
| `status` | `draft`, `approved`, `rejected`, `deprecated` |
| `subject_type` | `person`, `repo`, `service`, `system` |

### Tenant isolation

RLS is enabled; authenticated users have full CRUD where `owner_id = auth.uid()`. The Edge Function uses the service role for agent operations but always scopes queries by `owner_id`.

---

## Relational Memory Tables

### `entities`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | NO | — | **Required.** Tenant scope |
| `entity_type` | text | NO | — | **Required.** `person`, `org`, `project`, `repo`, `system`, `ticket` |
| `external_key` | text | YES | null | Optional unique ID (e.g. `+15555550100`) |
| `name` | text | NO | — | **Required.** Display name |
| `aliases` | text[] | NO | `'{}'` | Alternative names |
| `status` | text | NO | `'active'` | `active`, `archived` |
| `summary` | text | YES | null | Brief description |
| `metadata` | jsonb | NO | `'{}'` | Additional data |

**Uniqueness**: Upsert matches on `(owner_id, entity_type, external_key)` when `external_key` is set, otherwise `(owner_id, entity_type, name)`.

**Indexes**: `(owner_id, entity_type)` for filtered listing; name/summary ILIKE used by `search_entities` RPC.

### `learning_entities` (join table)

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | NO | — | **Required** |
| `learning_id` | uuid | NO | — | FK → `agent_learnings` (`ON DELETE CASCADE`) |
| `entity_id` | uuid | NO | — | FK → `entities` (`ON DELETE CASCADE`) |
| `role` | text | YES | null | `subject`, `mentioned_person`, `project_context`, etc. |
| `confidence` | real | NO | `1.0` | 0.0–1.0 |

**Indexes**: `(learning_id)`, `(entity_id)` for join lookups.

### `entity_relationships`

Directed edges between entities. Edges are **not** auto-mirrored; create explicit inverse edges if needed.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | NO | — | **Required** |
| `from_entity_id` | uuid | NO | — | FK → `entities` (`ON DELETE CASCADE`) |
| `relationship_type` | text | NO | — | See valid types below |
| `to_entity_id` | uuid | NO | — | FK → `entities` (`ON DELETE CASCADE`) |
| `confidence` | real | NO | `0.8` | 0.0–1.0 |
| `source_learning_id` | uuid | YES | null | FK → `agent_learnings` (`ON DELETE SET NULL`) |
| `metadata` | jsonb | NO | `'{}'` | Additional context |

**Valid `relationship_type`**: `works_at`, `owns`, `member_of`, `related_to`, `depends_on`, `blocked_by`, `contact_at`, `responsible_for`, `about`, `mentioned_with`

**Uniqueness**: Upsert on `(from_entity_id, relationship_type, to_entity_id)`.

**Query behavior**: `GET /relationships?entity_id=` returns edges where the entity is either `from` or `to`.

### `commitments`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | NO | — | **Required** |
| `title` | text | NO | — | **Required.** What needs to happen |
| `description` | text | YES | null | Details |
| `status` | text | NO | `'open'` | `open`, `in_progress`, `done`, `cancelled` |
| `priority` | text | NO | `'medium'` | `low`, `medium`, `high`, `urgent` |
| `due_at` | timestamptz | YES | null | Deadline |
| `assigned_entity_id` | uuid | YES | null | FK → `entities` (`ON DELETE SET NULL`) |
| `counterparty_entity_id` | uuid | YES | null | FK → `entities` (`ON DELETE SET NULL`) |
| `project_entity_id` | uuid | YES | null | FK → `entities` (`ON DELETE SET NULL`) |
| `source_learning_id` | uuid | YES | null | FK → `agent_learnings` (`ON DELETE SET NULL`) |
| `metadata` | jsonb | NO | `'{}'` | Additional context |

**Status transitions**: No server-side validation; any status may transition to any other via `PATCH`. Agents should follow the logical flow: `open` → `in_progress` → `done` | `cancelled`.

**Indexes**: `(owner_id, status)` for filtered queries.

---

## Learnings API

### POST /learnings — Create (with optional composite fields)

Creates a learning and optionally creates entities, links, relationships, and commitments atomically.

**Core fields**: see table above. `learning` is required.

**Composite fields** (all optional, require `owner_id`):

| Field | Type | Description |
|-------|------|-------------|
| `create_entities` | array | Entity objects to upsert (see POST /entities/upsert schema) |
| `entity_links` | array | `{ entity_id, role?, confidence? }` — link existing entities to this learning |
| `create_relationships` | array | `{ from_entity_id, relationship_type, to_entity_id, confidence?, metadata? }` |
| `create_commitments` | array | `{ title, description?, status?, priority?, due_at?, assigned_entity_id?, ... }` |

#### Example: Composite learning with entities + commitment

```json
{
  "learning": "Example User confirmed Q3 budget of $50k for infra upgrades.",
  "kind": "decision",
  "owner_id": "00000000-0000-0000-0000-000000000001",
  "subject_type": "person",
  "subject_name": "Example User",
  "title": "Q3 infra budget approved",
  "summary": "Example User approved $50k for Q3 infrastructure.",
  "tags": ["budget", "q3", "infrastructure"],
  "confidence": 0.95,
  "create_entities": [
    {
      "entity_type": "person",
      "name": "Example User",
      "external_key": "+15555550100",
      "summary": "Primary stakeholder"
    },
    {
      "entity_type": "project",
      "name": "Q3 Infra Upgrade",
      "summary": "Infrastructure upgrade project for Q3"
    }
  ],
  "entity_links": [
    { "entity_id": "00000000-0000-0000-0000-000000000099", "role": "mentioned_person", "confidence": 0.9 }
  ],
  "create_relationships": [
    {
      "from_entity_id": "00000000-0000-0000-0000-000000000010",
      "relationship_type": "responsible_for",
      "to_entity_id": "00000000-0000-0000-0000-000000000020"
    }
  ],
  "create_commitments": [
    {
      "title": "Finalize Q3 infra vendor selection",
      "description": "Choose between cloud providers for the upgrade",
      "priority": "high",
      "due_at": "2026-05-01T00:00:00Z",
      "assigned_entity_id": "00000000-0000-0000-0000-000000000010"
    }
  ]
}
```

**Response** (composite):

```json
{
  "learning": { "id": "uuid", "learning": "...", "kind": "decision" },
  "created_entities": [ { "id": "uuid", "name": "Example User" } ],
  "entity_links": [ { "id": "uuid", "learning_id": "...", "entity_id": "...", "role": "mentioned_person" } ],
  "created_relationships": [ { "id": "uuid", "from_entity_id": "...", "relationship_type": "responsible_for" } ],
  "created_commitments": [ { "id": "uuid", "title": "Finalize Q3 infra vendor selection" } ]
}
```

### PATCH /learnings/:id

Update mutable fields. Immutable: `id`, `created_at`, `source`.

### DELETE /learnings/:id

Hard-delete by UUID. Prefer `PATCH` with `status: "deprecated"` for soft-delete.

### GET /learnings/:id

Returns full learning record with all metadata. (Also available via `GET /learnings/get?id=UUID` for backward compat.)

### GET /learnings/:id/entities

Returns all entities linked to a learning (with full entity data via join).

```json
{
  "data": [
    {
      "id": "link-uuid",
      "learning_id": "...",
      "entity_id": "...",
      "role": "subject",
      "confidence": 1.0,
      "entities": { "id": "...", "name": "Example User", "entity_type": "person" }
    }
  ],
  "count": 1
}
```

### GET /learnings/feed

`?kind=&visibility=&search=&limit=&offset=` — Paginated list with filters.

### GET /learnings/list

`?since=&source=&kind=&domain=&limit=&offset=` — "What happened recently?" pattern.

### GET /learnings/stats

Aggregate counts by kind, domain, and status.

### POST /learnings/bulk

Batch insert up to 50 learnings. Body: `{ items: [...] }`.

### POST /learnings/link

Link an existing learning to entities after creation.

```json
{
  "learning_id": "learning-uuid",
  "owner_id": "owner-uuid",
  "links": [
    { "entity_id": "entity-uuid", "role": "subject", "confidence": 1.0 },
    { "entity_id": "entity-uuid-2", "role": "mentioned_person" }
  ]
}
```

---

## Entities API

### POST /entities/upsert

Create or update an entity. Matches on `(owner_id, entity_type, external_key)` or `(owner_id, entity_type, name)`.

```json
{
  "owner_id": "owner-uuid",
  "entity_type": "person",
  "name": "Example User",
  "external_key": "+15555550100",
  "aliases": ["EU"],
  "summary": "Primary stakeholder",
  "metadata": { "role": "CEO" }
}
```

**Response**: `{ "data": { ... }, "created": true }` or `{ "data": { ... }, "upserted": true }`

### GET /entities/search

`?q=&entity_type=&owner_id=&limit=&offset=`

### GET /entities/:id

Single entity by UUID.

### GET /entities/:id/context

Full context via `get_entity_context` RPC — returns entity + linked learnings + relationships + commitments.

---

## Relationships API

### POST /relationships

Create or upsert a relationship. Upserts on `(from_entity_id, relationship_type, to_entity_id)`.

```json
{
  "owner_id": "owner-uuid",
  "from_entity_id": "entity-uuid-1",
  "relationship_type": "works_at",
  "to_entity_id": "entity-uuid-2",
  "confidence": 0.9,
  "source_learning_id": "learning-uuid",
  "metadata": {}
}
```

### GET /relationships

`?entity_id=UUID&relationship_type=` — Returns all relationships involving the entity (**both** directions), with full entity data on both sides.

---

## Commitments API

### POST /commitments

```json
{
  "owner_id": "owner-uuid",
  "title": "Follow up with vendor on pricing",
  "description": "Need final quote by Friday",
  "priority": "high",
  "due_at": "2026-04-10T00:00:00Z",
  "assigned_entity_id": "entity-uuid-1",
  "counterparty_entity_id": "entity-uuid-2",
  "project_entity_id": "entity-uuid-3",
  "source_learning_id": "learning-uuid"
}
```

### PATCH /commitments/:id

**Mutable fields**: `title`, `description`, `status`, `priority`, `due_at`, `assigned_entity_id`, `counterparty_entity_id`, `project_entity_id`, `source_learning_id`, `metadata`.

No server-side status-transition validation. Agents should follow: `open` → `in_progress` → `done` | `cancelled`.

### GET /commitments

`?status=&assigned_entity_id=&counterparty_entity_id=&project_entity_id=&due_before=&limit=&offset=`

---

## RPC Helpers

| Function | Args | Returns |
|----------|------|---------|
| `get_entity_context(entity_uuid)` | entity UUID | Entity + learnings + relationships + commitments |
| `get_learning_context(learning_uuid)` | learning UUID | Learning + linked entities |
| `get_briefing(owner_uuid, entity_uuid)` | owner UUID + entity UUID | Entity + recent learnings + relationships + open commitments |
| `search_entities(owner_uuid, query_text, limit_count, offset_count)` | search params | Matching entities |

> **Naming note**: RPC args use `owner_uuid` / `entity_uuid`; these correspond to `owner_id` / entity `id` in HTTP API payloads.

---

## Conventions

- **People**: `subject_type='person'`, `subject_id` is E.164 phone, `subject_name` is first name.
- **People learnings** default to `redaction_level='sensitive'`, `visibility='private'`.
- **`metadata`** stores raw payloads. Always include `user_id` and/or `job_id` when available.
- **`content` column does not exist.** Use `learning` for text, `metadata` for structured data.
- **Composite POST /learnings** is the preferred path for agents — create everything in one atomic call.

## Error Responses

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "missing learning field" }` | `learning` is empty |
| 400 | `{ "error": "learning too long (max 8000 chars)" }` | Exceeds limit |
| 400 | `{ "error": "invalid or missing entity_type" }` | Bad entity_type |
| 400 | `{ "error": "missing owner_id" }` | owner_id required but missing |
| 400 | `{ "error": "invalid relationship_type" }` | Not in valid set |
| 401 | `{ "error": "unauthorized" }` | Bad/missing Bearer token |
| 404 | `{ "error": "not_found" }` | Resource doesn't exist |
| 500 | `{ "error": "db_error", "detail": "..." }` | Supabase operation failed |
