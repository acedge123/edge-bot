# Relational Memory Model

> **Canonical column-level detail** (defaults, nullability, valid enums) lives in
> [`AGENT_LEARNINGS_SCHEMA.md`](./AGENT_LEARNINGS_SCHEMA.md).
> This file is the **product / architecture overview only**.

## Overview

The relational memory system extends `agent_learnings` with first-class entities, relationships, and commitments. It enables the agent to answer questions like "What do I know about Sarah?", "What's open for Acme?", and "What commitments are outstanding?"

## Schema (summary)

### `entities`
Canonical records for people, orgs, projects, repos, systems, and tickets.

Key columns: `id`, `owner_id`, `entity_type`, `external_key`, `name`, `aliases`, `status`, `summary`, `metadata`.

### `learning_entities`
Join table linking learnings to entities (`learning_id` → `agent_learnings`, `entity_id` → `entities`, plus `role` and `confidence`).

### `entity_relationships`
Directed typed edges between entities. Edges are **directed** (`from_entity_id` → `to_entity_id`); inverse edges are not auto-created. `GET /relationships?entity_id=` returns edges in **both directions** (where the entity is `from` or `to`).

### `commitments`
Promises, follow-ups, tasks, and open loops. Linked to entities via `assigned_entity_id`, `counterparty_entity_id`, and `project_entity_id`.

## Data Integrity Notes

- **Tenant isolation**: Every relational table includes `owner_id`. The Edge Function enforces owner scoping on all read/write paths. RLS is enabled on all tables as a defense-in-depth layer.
- **Uniqueness**: `entities` are upserted on `(owner_id, entity_type, external_key)` when `external_key` is set, otherwise `(owner_id, entity_type, name)`. `entity_relationships` upsert on `(from_entity_id, relationship_type, to_entity_id)`.
- **Referential integrity**: `learning_entities`, `entity_relationships`, and `commitments` use `ON DELETE CASCADE` from their FK targets (`entities`, `agent_learnings`). Deleting an entity removes its links, relationships, and commitment references.
- **Indexes**: `entities(owner_id, entity_type)`, `learning_entities(learning_id)`, `learning_entities(entity_id)`, and `commitments(owner_id, status)` support the primary query paths.

## API Endpoints (agent-vault)

### Entities
- `POST /entities/upsert` — Create or update an entity
- `GET /entities/search?q=&entity_type=&owner_id=&limit=&offset=`
- `GET /entities/:id` — Get single entity
- `GET /entities/:id/context` — Full context (learnings, relationships, commitments)

### Learning Links
- `POST /learnings/link` — Link learning to entities
- `GET /learnings/:id/entities` — Get entities linked to a learning

### Relationships
- `POST /relationships` — Create/upsert relationship
- `GET /relationships?entity_id=&relationship_type=` — Returns edges in **both** directions

### Commitments
- `POST /commitments` — Create commitment
- `PATCH /commitments/:id` — Update commitment (mutable fields: `title`, `description`, `status`, `priority`, `due_at`, entity FKs, `metadata`). No status-transition validation; any status can move to any other.
- `GET /commitments?status=&assigned_entity_id=&due_before=&limit=&offset=`

## RPC Helpers

| Function | Args | Returns |
|----------|------|---------|
| `search_entities` | `(owner_uuid, query_text, limit_count, offset_count)` | Matching entities (same as `owner_id` in HTTP APIs) |
| `get_entity_context` | `(entity_uuid)` | Entity + learnings + relationships + commitments |
| `get_learning_context` | `(learning_uuid)` | Learning + linked entities |
| `get_briefing` | `(owner_uuid, entity_uuid)` | Entity + recent learnings + relationships + open commitments |

> **Naming note**: RPC args use `owner_uuid` / `entity_uuid`; these correspond to `owner_id` / entity `id` in HTTP API payloads.

## UI

The Knowledge Base page (`/learnings`) includes four tabs:
- **Learnings** — with entity chips on cards showing linked entities
- **Entities** — searchable/filterable list of people, orgs, projects, repos, systems, tickets
- **Commitments** — filterable list of open loops, follow-ups, and promises
- **Files** — agent-uploaded files
