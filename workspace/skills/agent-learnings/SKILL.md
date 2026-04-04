---
name: agent-learnings
description: |
  Read and write durable learnings in Agent Vault (Supabase agent-vault): narrative learnings, search/feed,
  and relational memory (entities, learning links, relationships, commitments) including composite POST /learnings.
  Use when saving decisions, people/orgs, follow-ups, structured recall, or retrieving prior learnings and context.
metadata: {"clawdbot":{"requires":{"env":["AGENT_VAULT_URL","AGENT_EDGE_KEY"]}}}
---

# Agent Learnings & relational memory (Agent Vault)

Use this skill to persist and retrieve **durable memory** in **Agent Vault** — both **narrative learnings** (`agent_learnings`) and **relational memory** (`entities`, `learning_entities`, `entity_relationships`, `commitments`).

**Canonical API + schema:** repo `docs/AGENT_LEARNINGS_SCHEMA.md` (and product overview `docs/RELATIONAL_MEMORY_MODEL.md` if copied into the OpenClaw workspace).

This is for long-lived memory (decisions, policies, people/projects, open loops), not transient chat text.

---

## Required env

- `AGENT_VAULT_URL`
- `AGENT_EDGE_KEY`

`AGENT_VAULT_URL` can be either:

- edge-functions root: `https://<project>.supabase.co/functions/v1`
- agent-vault function base: `https://<project>.supabase.co/functions/v1/agent-vault`

When in doubt, normalize to: `https://<project>.supabase.co/functions/v1/agent-vault`.

Auth header for protected routes:

- `Authorization: Bearer $AGENT_EDGE_KEY`

**Never log or echo `AGENT_EDGE_KEY`.** Only use `owner_id` values the deployment is authorized for (no cross-tenant fabrication).

---

## When to use what

| Need | Use |
|------|-----|
| Short narrative fact, decision, runbook snippet | `POST /learnings` with `learning` (+ optional `title`, `kind`, `tags`, …) |
| Same learning **plus** people/orgs/projects and/or relationships and/or commitments in **one** request | `POST /learnings` with **composite** fields (requires `owner_id`) |
| Stable record for a person, org, project, repo, system, ticket | `POST /entities/upsert` or `create_entities` inside composite `POST /learnings` |
| Explicit edge between entities (`works_at`, `responsible_for`, …) | `POST /relationships` or `create_relationships` in composite |
| Follow-up / promise / open loop | `POST /commitments` or `create_commitments` in composite |
| “Everything about entity X” | `GET /entities/:id/context` |
| Paginated learnings with text filter | `GET /learnings/feed?search=&kind=&limit=&offset=` |
| Recent activity pattern | `GET /learnings/list?since=&kind=&limit=&offset=` |

---

## API quick reference

Base: `${AGENT_VAULT_URL}` (normalized to end with `/agent-vault`)

### Learnings

- `POST /learnings` — create (optional **composite**: `create_entities`, `entity_links`, `create_relationships`, `create_commitments`; composite paths require `owner_id`)
- `PATCH /learnings/:id` — update mutable fields
- `DELETE /learnings/:id` — hard delete (prefer soft: `status: "deprecated"`)
- `GET /learnings/:id` — full record (legacy: `GET /learnings/get?id=<uuid>`)
- `GET /learnings/:id/entities` — entities linked to this learning
- `GET /learnings/feed?kind=&visibility=&search=&limit=&offset=`
- `GET /learnings/list?since=&source=&kind=&domain=&limit=&offset=`
- `GET /learnings/stats`
- `POST /learnings/bulk` — batch insert (body `{ "items": [ ... ] }`, cap per server)
- `POST /learnings/link` — attach existing learning to entities after creation

### Entities

- `POST /entities/upsert`
- `GET /entities/search?q=&entity_type=&owner_id=&limit=&offset=`
- `GET /entities/:id`
- `GET /entities/:id/context` — entity + linked learnings + relationships + commitments

### Relationships

- `POST /relationships` — create/upsert (directed edge; `GET` returns both directions for `entity_id`)
- `GET /relationships?entity_id=&relationship_type=`

### Commitments

- `POST /commitments`
- `PATCH /commitments/:id` — `title`, `description`, `status`, `priority`, `due_at`, entity FKs, `metadata`
- `GET /commitments?status=&assigned_entity_id=&due_before=&limit=&offset=`

### RPCs (server-side; usually invoked via context endpoints)

`search_entities`, `get_entity_context`, `get_learning_context`, `get_briefing` — see `docs/AGENT_LEARNINGS_SCHEMA.md`.

---

## POST /learnings (narrative only)

```json
{
  "learning": "Use governance-runtime skill for heartbeat/authorize/audit-ingest.",
  "kind": "decision",
  "owner_id": "owner-uuid",
  "category": "governance",
  "source": "openclaw",
  "tags": ["runtime", "governance", "policy"],
  "confidence": 0.95,
  "metadata": {
    "tenant": "onsite-affiliate",
    "context": "rule setup"
  }
}
```

Also supported: CGPT-style mapping (`topic` → category, `repo` → tags, `meta` → metadata).

---

## POST /learnings (composite — learning + entities + links + relationships + commitments)

Use when a single user turn should atomically record narrative + structured graph. **`owner_id` is required.**

| Field | Purpose |
|-------|---------|
| `create_entities` | Array of entity payloads (upsert semantics per vault) |
| `entity_links` | `[{ "entity_id", "role?", "confidence?" }]` link existing entities to this learning |
| `create_relationships` | `[{ "from_entity_id", "relationship_type", "to_entity_id", ... }]` |
| `create_commitments` | `[{ "title", "description?", "due_at?", "assigned_entity_id?", ... }]` |

Valid `relationship_type` values and column details: **`docs/AGENT_LEARNINGS_SCHEMA.md`**.

---

## Validation reminders

- `learning` required for create (max **8000** chars)
- `confidence` in 0..1 where used
- `limit` / pagination bounds per server (typical feed limits apply)
- Do not store secrets in `learning`, `metadata`, or entity `summary` fields

---

## When to save a learning (or composite)

Save when the result is reusable and likely to matter later:

- auth model decisions, endpoint conventions, runbooks
- **named stakeholders** (entities) and **who owns what** (relationships)
- **follow-ups and promises** (commitments)

Do **not** save secrets or raw credentials.

---

## Suggested categories / tags

- categories / `kind`: `governance`, `slack`, `ciq`, `youtrack`, `deploy`, `troubleshooting`, `ops`, `decision`, `person`, `project`, …
- tags: tenant slug, integration names, environment (`railway`, `supabase`)

---

## Example calls (curl)

```bash
# Normalize URL once
AGENT_VAULT_BASE="${AGENT_VAULT_URL%/}"
case "$AGENT_VAULT_BASE" in
  */agent-vault) ;;
  *) AGENT_VAULT_BASE="$AGENT_VAULT_BASE/agent-vault" ;;
esac

# Search / filter learnings (prefer feed)
curl -sS -G "${AGENT_VAULT_BASE}/learnings/feed" \
  -H "Authorization: Bearer ${AGENT_EDGE_KEY}" \
  --data-urlencode "search=governance runtime auth" \
  --data-urlencode "limit=10"

# Create narrative learning
curl -sS -X POST "${AGENT_VAULT_BASE}/learnings" \
  -H "Authorization: Bearer ${AGENT_EDGE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id":"YOUR-OWNER-UUID",
    "learning":"Use X-API-Key only on endpoints that explicitly support tenant auth.",
    "kind":"governance",
    "source":"openclaw",
    "tags":["tenant-auth","policy-propose"],
    "confidence":0.97
  }'
```

---

## Never do this

- Do not store secrets (`*_KEY`, tokens, passwords, raw API keys) in learnings, entities, or commitments.
- Do not post noisy per-message chat text as learnings.
- Do not call `/jobs/next` or `/jobs/ack` for memory tasks; those are worker queue endpoints.
- Do not guess or spoof `owner_id` for tenants you are not authorized to write.
