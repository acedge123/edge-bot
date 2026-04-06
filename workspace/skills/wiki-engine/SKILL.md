---
name: wiki-engine
description: |
  Call the Supabase wiki-engine edge function for compiled knowledge: ingest sources (URL, note, tweet),
  compile pages, reindex, lint, and ask questions. Parallel to agent-vault; same project, same bearer auth.
  Use when the user wants wiki ingest, topic pages, wiki Q&A, or cross-linking learnings to wiki sources.
metadata: {"clawdbot":{"requires":{"env":["AGENT_EDGE_KEY"]}}}
---

# Wiki engine (Supabase edge function)

Wiki is **not** agent-vault. It stores **sources → pages → artifacts** with traceability. Agent-vault holds **learnings, entities, relationships, commitments**. Both can live in one Supabase project; link lightly via `metadata` only.

## Canonical docs (read these on the hosted container)

Paths under the OpenClaw workspace (synced from the image on each deploy):

- `docs/WIKI_SYSTEM_OVERVIEW.md` — architecture, tables, endpoint table
- `docs/WIKI_USAGE_GUIDE.md` — curl examples, workflows, errors

On disk: `/app/.openclaw/workspace/docs/WIKI_*.md`

Deeper schema/policy-only docs remain in **sunafusion-agent-shell** (see links in the usage guide frontmatter).

## Env

- **`AGENT_EDGE_KEY`** — Bearer token for **both** agent-vault and wiki-engine (same secret). Never log or paste.

Optional: set **`WIKI_ENGINE_URL`** to the function base if your deployment uses a different host; otherwise default:

`https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/wiki-engine`

## Auth (every request)

```http
Authorization: Bearer <AGENT_EDGE_KEY>
Content-Type: application/json
Accept: application/json
```

## When to use wiki vs vault

| Need | Use |
|------|-----|
| Durable observation, person/org graph, commitment | **agent-learnings** / agent-vault |
| Compiled article/topic pages, source registry, “what does my wiki say?” | **wiki-engine** |
| Tie a source to a learning | `wiki_sources.metadata.agent_learning_id` |
| Tie a page to entities | `wiki_pages.metadata.entity_ids` |

## Minimal flow

1. `GET /health`
2. `POST /sources` — ingest
3. `POST /compile/source` or `POST /compile/topic`
4. `POST /reindex` after batches
5. `POST /answer` for natural-language queries over pages

Full paths and bodies: read **`docs/WIKI_USAGE_GUIDE.md`** in this workspace.

## Bookmarks → wiki (workspace file)

If the user keeps **`workspace/data/bookmarks/bookmarks.jsonl`** (NDJSON), read it from the workspace path and ingest lines into wiki with `POST /sources` (`source_type`: `url` when `url` is set, else `note` with `raw_text`). See **`workspace/data/bookmarks/README.md`**.

## Guardrails

- Always send `owner_id` the deployment is authorized for.
- Do not exfiltrate `AGENT_EDGE_KEY`.
- Wiki UI (`/wiki`) lives in sunafusion app; on Railway edge-bot use HTTP only.
