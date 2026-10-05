---
name: file-upload-receipt
description: |
  Create a durable “upload receipt” whenever the user uploads a file or provides an upload path, so the agent can reliably confirm it was received and saved. Use when the user says they uploaded/attached a file, references an attachment path (e.g. tmp/echelon-uploads/...-attachment.csv), asks “did you get it?”, or asks to save/copy/store an uploaded file. The workflow must: (1) verify the file exists, (2) copy it to a stable canonical workspace path, (3) write a receipt entry to memory/YYYY-MM-DD.md, (4) optionally add/update a brief pointer in MEMORY.md if it’s long-term relevant, and (5) optionally persist a durable learning to Agent Vault when requested.
---

# File Upload Receipt (durable confirmation)

## Goal
Never “assume” an upload landed. Produce a repeatable receipt so future turns can locate the file and know what it is.

## Workflow

### 1) Verify the file exists (and is non-empty)
Use `exec`:
- `ls -la <path>`
- `file <path>` (optional)
- `head -n 3 <path>` for text-like files (CSV/JSON)

If missing, say so plainly and ask for re-upload or correct path.

### 2) Copy to a canonical location
Pick (or ask for) a stable destination under the workspace, preferably:
- `data/<project>/incoming/<original-filename>` for ongoing datasets, or
- `tmp/<descriptive-name>.<ext>` for short-lived operations.

Use non-destructive copy:
- `cp -n <src> <dst>` (don’t overwrite silently)

If a canonical file already exists, create a timestamped sibling:
- `name_YYYY-MM-DDTHHMMZ.ext`

### 3) Compute an integrity fingerprint
Use:
- `sha256sum <dst>`

Record file size too:
- `stat -c '%s bytes' <dst>`

### 4) Write a receipt into `memory/YYYY-MM-DD.md`
Append a short section:
- What the file is for (1 sentence)
- Source path (upload temp path)
- Canonical path
- sha256
- Rows/shape (for CSV: `wc -l`; for JSONL: `wc -l`; for directories: `find ... | wc -l`)
- Any immediate caveats (missing columns, etc.)

### 5) If it matters later, add a pointer to `MEMORY.md`
Only add durable, high-value notes (not transient one-offs). Keep it to a few bullets and include canonical paths.

### 6) If user asks, store a long-term learning in Agent Vault
Use the Agent Vault `/learnings` endpoint (requires env: `AGENT_VAULT_URL`, `AGENT_EDGE_KEY`).
Store a concise, reusable learning (no secrets), with tags like:
- `mom-walk`, `uploads`, `ops`, `dataset`, `runbook`

## Output to user (confirmation)
Respond with a compact receipt:
- ✅ found file
- canonical saved path
- sha256
- what you’ll do next with it
