# Agent Memory Policy

## What to store where

### `agent_learnings`
- Durable observations, preferences, decisions
- Summaries and incident notes
- Runbook/playbook documentation
- Project knowledge and reference material
- Research notes that may age out

### `entities` — create when:
- A named person, org, project, repo, system, or ticket appears
- It is likely to be referenced again
- Use `external_key` for stable identifiers when possible

### `entity_relationships` — create when:
- The relationship is explicit and reasonably durable
- Examples:
  - person `works_at` org
  - person `owns` project
  - repo `related_to` project
  - system `depends_on` service

### `commitments` — create when:
- There is an explicit promise, follow-up, TODO, or open loop
- Set `due_at` if a date is mentioned or parseable
- Link to relevant entities via assigned/counterparty/project fields

## Confidence guidelines

- `1.0`: explicitly stated fact
- `0.8`: strong inference from context
- `0.5–0.7`: reasonable guess, may need verification
- `< 0.5`: weak signal, store as learning only

## Do NOT create structured rows for

- weak guesses or speculative connections
- temporary or ephemeral information
- fuzzy associations with no likely reuse

When uncertain:
- store the information as a learning
- lower confidence if appropriate
- avoid creating firm entity relationships unless the input supports them

## Practical Edge Bot Rules

When the agent learns something reusable:
- if it is narrative or explanatory, store it in `agent_learnings`
- if it introduces a reusable named subject, create or reuse an `entity`
- if it states a durable link between two entities, create an `entity_relationship`
- if it creates an obligation or open loop, create a `commitment`

## Prefer composite `POST /learnings` when multiple rows apply

When a single user turn (or your own judgment after reading a message) warrants **both** a narrative learning **and** one or more structured rows, the agent should use **one** Vault call: **`POST /learnings`** with the normal learning fields **plus** optional composite arrays (requires **`owner_id`**):

| Field | Use when |
|-------|----------|
| `create_entities` | New or upserted people/orgs/projects/repos/systems/tickets for this fact |
| `entity_links` | Link this learning to **existing** entity UUIDs with an optional `role` |
| `create_relationships` | Durable directed edges (`from_entity_id`, `relationship_type`, `to_entity_id`) |
| `create_commitments` | Open loops / promises (`title`, optional `due_at`, `assigned_entity_id`, …) |

Do **not** rely on a separate keyword-only extractor for this decision: the **LLM** should apply the rules above and in this doc. If the stack includes `memoryExtractor.ts` or similar heuristics, treat those as optional signals only; **judgment** should match this policy and **`workspace/skills/agent-learnings/SKILL.md`**.

Full JSON examples and column detail: **`docs/AGENT_LEARNINGS_SCHEMA.md`**. Operational curl and env: same skill.

The agent should prefer structured memory for:
- people it interacts with repeatedly
- projects, repos, systems, and tickets it will revisit
- follow-ups and obligations that need status tracking

The agent should prefer plain learnings for:
- one-off observations
- temporary context
- long-form explanation
- notes that are useful but not worth structuring
