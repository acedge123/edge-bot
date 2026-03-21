---
name: agent-learnings
description: |
  Read and write durable learnings in Agent Vault via /learnings endpoints. Use when the user asks to save important findings, decisions, runbooks, or retrieve prior learnings.
metadata: {"clawdbot":{"requires":{"env":["AGENT_VAULT_URL","AGENT_EDGE_KEY"]}}}
---

# Agent Learnings (Agent Vault)

Use this skill to persist and retrieve durable memory in **Agent Vault**.

- **Write:** `POST /learnings`
- **Search:** `GET /learnings/search`
- **Read by id:** `GET /learnings/get`

This is for long-lived memory (decisions, policies, proven fixes), not transient chat text.

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

---

## API quick reference

Base: `${AGENT_VAULT_URL}` (normalized to include `/agent-vault`)

- `GET ${AGENT_VAULT_URL}/learnings/search?q=<query>&limit=<n>`
- `GET ${AGENT_VAULT_URL}/learnings/get?id=<uuid>`
- `POST ${AGENT_VAULT_URL}/learnings`

### POST /learnings body

Use native shape:

```json
{
  "learning": "Use governance-runtime skill for heartbeat/authorize/audit-ingest.",
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

Also supported by Agent Vault:

- CGPT-style mapping (`topic` -> category, `repo` -> tags, `meta` -> metadata).

Validation reminders (from Agent Vault docs):

- `learning` required (max 8000 chars)
- `confidence` is 0..1
- `limit` for search is 1..50

---

## When to save a learning

Save learnings when the result is reusable and likely to matter later:

- auth model decisions (e.g. kernel vs tenant key)
- endpoint conventions and gotchas
- stable runbooks/troubleshooting fixes
- tenant-specific governance patterns

Do **not** save secrets or raw credentials.

---

## Suggested categories/tags

- categories: `governance`, `slack`, `ciq`, `youtrack`, `deploy`, `troubleshooting`, `ops`
- tags: tenant slug, endpoint names, integration names, environment (`railway`, `supabase`)

---

## Example calls (curl)

```bash
# Normalize URL once
AGENT_VAULT_BASE="${AGENT_VAULT_URL%/}"
case "$AGENT_VAULT_BASE" in
  */agent-vault) ;;
  *) AGENT_VAULT_BASE="$AGENT_VAULT_BASE/agent-vault" ;;
esac

# Search
curl -sS -G "${AGENT_VAULT_BASE}/learnings/search" \
  -H "Authorization: Bearer ${AGENT_EDGE_KEY}" \
  --data-urlencode "q=governance runtime auth" \
  --data-urlencode "limit=10"

# Create
curl -sS -X POST "${AGENT_VAULT_BASE}/learnings" \
  -H "Authorization: Bearer ${AGENT_EDGE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "learning":"Use X-API-Key only on endpoints that explicitly support tenant auth.",
    "category":"governance",
    "source":"openclaw",
    "tags":["tenant-auth","policy-propose"],
    "confidence":0.97
  }'
```

---

## Never do this

- Do not store secrets (`*_KEY`, tokens, passwords, raw API keys) in learnings.
- Do not post noisy per-message chat text as learnings.
- Do not call `/jobs/next` or `/jobs/ack` for memory tasks; those are worker queue endpoints.
