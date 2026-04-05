# Wiki System — Usage Guide

> **Source:** Mirrored from [sunafusion-agent-shell `docs/WIKI_USAGE_GUIDE.md`](https://github.com/acedge123/sunafusion-agent-shell/blob/main/docs/WIKI_USAGE_GUIDE.md) for edge-bot / hosted agent reference. Schema/policy deep-dives remain in sunafusion: [WIKI_SCHEMA.md](https://github.com/acedge123/sunafusion-agent-shell/blob/main/docs/WIKI_SCHEMA.md), [WIKI_POLICY.md](https://github.com/acedge123/sunafusion-agent-shell/blob/main/docs/WIKI_POLICY.md).

## Quick Start

**Base URL:**
```
https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/wiki-engine
```

**Auth header (all requests):**
```
Authorization: Bearer <same token as agent-vault>
```

Use the same bearer secret configured for Agent Vault on Railway (do not log or paste it).

---

## 1. Health Check

```bash
curl "$WIKI_BASE/health" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"
```

Response: `{ "status": "ok" }`

---

## 2. Ingest a Source

Every piece of raw material enters the wiki as a **source**. Sources are immutable once created.

### Add a URL

```bash
curl -X POST "$WIKI_BASE/sources" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<your-uuid>",
    "source_type": "url",
    "title": "Interesting Article on AI Agents",
    "source_url": "https://example.com/ai-agents",
    "tags": ["ai", "agents"]
  }'
```

### Add a Tweet

```bash
curl -X POST "$WIKI_BASE/sources" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<your-uuid>",
    "source_type": "tweet",
    "title": "@user on prompt engineering",
    "source_url": "https://twitter.com/user/status/123456",
    "raw_text": "Thread: Here are 5 things I learned about prompt engineering…",
    "tags": ["prompt-engineering"]
  }'
```

### Add a Manual Note

```bash
curl -X POST "$WIKI_BASE/sources" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<your-uuid>",
    "source_type": "note",
    "title": "Meeting notes — April kickoff",
    "raw_text": "Discussed Q2 roadmap. Key priorities: shipping wiki v1, onboarding 3 new creators.",
    "tags": ["meeting", "q2"]
  }'
```

**Valid `source_type` values:** `url`, `tweet`, `note`, `article`, `paper`, `chat`, `manual`

---

## 3. List Sources

```bash
# All sources
curl "$WIKI_BASE/sources?owner_id=<your-uuid>" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"

# Filter by status
curl "$WIKI_BASE/sources?owner_id=<your-uuid>&status=raw" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"

# Filter by type
curl "$WIKI_BASE/sources?owner_id=<your-uuid>&source_type=tweet" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"
```

---

## 4. Compile a Source into a Page

After ingesting a source, compile it into a **source_note** page. This creates a wiki page from the raw content and links the source to it.

```bash
curl -X POST "$WIKI_BASE/compile/source" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<your-uuid>",
    "source_id": "<source-uuid>"
  }'
```

Response:
```json
{
  "page_id": "...",
  "run_id": "...",
  "slug": "source-interesting-article-on-ai-agents"
}
```

---

## 5. Compile a Topic Page

Combine multiple sources into a single **topic** page. The system finds sources tagged with (or related to) the topic and assembles them.

```bash
curl -X POST "$WIKI_BASE/compile/topic" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<your-uuid>",
    "topic": "prompt engineering"
  }'
```

Response:
```json
{
  "page_id": "...",
  "run_id": "...",
  "slug": "prompt-engineering",
  "sources_used": 3
}
```

> **v1 note:** Topic compilation uses deterministic text assembly. Future versions will add LLM-powered synthesis.

---

## 6. Browse Pages

```bash
# All pages
curl "$WIKI_BASE/pages?owner_id=<your-uuid>" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"

# Filter by type
curl "$WIKI_BASE/pages?owner_id=<your-uuid>&page_type=topic" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"

# Search by title/body
curl "$WIKI_BASE/pages?owner_id=<your-uuid>&search=agents" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"

# Single page with linked sources
curl "$WIKI_BASE/pages/<page-uuid>" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"

# Just the sources for a page
curl "$WIKI_BASE/pages/<page-uuid>/sources" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"
```

**Valid `page_type` values:** `topic`, `source_note`, `entity`, `index`, `brief`, `overview`

---

## 7. Reindex

Rebuilds special pages (`index`, `log`, `overview`) from all existing pages. Run after a batch of compiles.

```bash
curl -X POST "$WIKI_BASE/reindex" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "owner_id": "<your-uuid>" }'
```

Response:
```json
{
  "run_id": "...",
  "pages_indexed": 12
}
```

---

## 8. Lint

Scan for quality issues: orphaned sources (never compiled), stale pages, or missing links.

```bash
curl -X POST "$WIKI_BASE/lint" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "owner_id": "<your-uuid>" }'
```

Response:
```json
{
  "run_id": "...",
  "finding_count": 2,
  "findings": [
    "Source 'abc123' has status 'raw' and has not been compiled into any page",
    "Source 'def456' has status 'raw' and has not been compiled into any page"
  ]
}
```

---

## 9. Ask a Question

Search the wiki and get a synthesized answer. Optionally save the answer as a persistent artifact.

```bash
curl -X POST "$WIKI_BASE/answer" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<your-uuid>",
    "question": "What do I know about prompt engineering?",
    "save_artifact": true
  }'
```

Response:
```json
{
  "answer": "Based on 3 wiki pages: ...",
  "pages_searched": 12,
  "pages_matched": 3,
  "artifact_id": "..."
}
```

> When `save_artifact: true`, the answer is stored in `wiki_artifacts` for future reference.

---

## 10. List Artifacts

```bash
curl "$WIKI_BASE/artifacts?owner_id=<your-uuid>" \
  -H "Authorization: Bearer $AGENT_EDGE_KEY"
```

---

## Typical Workflows

### A. "I found something interesting"

1. `POST /sources` — ingest the URL/tweet/note
2. `POST /compile/source` — turn it into a source_note page
3. `POST /reindex` — update the index

### B. "Compile everything I know about X"

1. Ensure sources are tagged appropriately
2. `POST /compile/topic` with the topic name
3. `GET /pages?search=X` — read the compiled page

### C. "What do I know about X?"

1. `POST /answer` with the question
2. Optionally set `save_artifact: true` to persist the answer

### D. "Health check my wiki"

1. `POST /lint` — find orphans and stale pages
2. Compile any uncompiled sources
3. `POST /reindex` — refresh special pages

---

## Agent Integration

### From your Railway-hosted agent

Call **wiki-engine** over HTTPS with the same bearer token as agent-vault. Set `WIKI_BASE` to the function URL above (or read from env if you add `WIKI_ENGINE_URL` in Railway).

### Cross-referencing with agent-vault

The wiki and agent-vault are **separate systems**. To link them:

- When creating a source from a learning: add `metadata: { "agent_learning_id": "<learning-uuid>" }`
- When compiling a page about an entity: add `metadata: { "entity_ids": ["<entity-uuid>"] }` to the page

No structural foreign keys — just metadata pointers.

---

## UI Access

In **sunafusion-agent-shell**, navigate to `/wiki` in the app (admin-only). The hosted edge-bot container has no wiki UI; use HTTP from the agent or curl.

---

## Source Status Lifecycle

```
raw → normalized → compiled → (rejected)
```

- **raw** — just ingested, not yet processed
- **normalized** — text extracted/cleaned (future)
- **compiled** — at least one page has been generated from this source
- **rejected** — manually or automatically excluded

---

## Error Handling

All error responses follow:

```json
{
  "error": "Human-readable error message"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Missing required field or invalid input |
| 401 | Missing or invalid `Authorization` header |
| 404 | Resource not found |
| 405 | Method not allowed for this path |
| 500 | Internal server error |

---

## Related Docs

- **This repo:** `docs/WIKI_SYSTEM_OVERVIEW.md` — architecture and endpoint table
- **sunafusion-agent-shell:** [WIKI_SCHEMA.md](https://github.com/acedge123/sunafusion-agent-shell/blob/main/docs/WIKI_SCHEMA.md), [WIKI_POLICY.md](https://github.com/acedge123/sunafusion-agent-shell/blob/main/docs/WIKI_POLICY.md)
