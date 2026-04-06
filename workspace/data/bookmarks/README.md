# Bookmarks for wiki ingest (local / Railway workspace)

- **`bookmarks.jsonl`** — your newline-delimited JSON (NDJSON). **Gitignored**; create it locally or on the Railway volume. Do not commit if URLs or titles are private.
- **`bookmarks.example.jsonl`** — shape reference (safe to commit).

**Hosted agent path:** `/app/.openclaw/workspace/data/bookmarks/bookmarks.jsonl`  
**Repo path:** `workspace/data/bookmarks/bookmarks.jsonl`

**ft-bookmarks export:** Lines often look like `{"id","tweetId","url","text",...}`. For wiki-engine use `source_type: "tweet"` when `tweetId`/`url` point at X/Twitter; map `text` → `raw_text` and derive `title` from the first line or a short prefix.

## Workflow

1. Export or paste bookmarks into `bookmarks.jsonl` (one JSON object per line).
2. Ask the agent to read the file and, for each entry, call **wiki-engine** `POST /sources` (see `workspace/skills/wiki-engine/SKILL.md` and `workspace/docs/WIKI_USAGE_GUIDE.md`): use `source_type: "url"` when `url` is present, optional `title`, `tags`, `raw_text` for notes-only lines.
3. Optionally `POST /compile/source` then `POST /reindex` per the usage guide.

Suggested fields per line (all optional except one of `url` or `raw_text`):

| Field | Use |
|-------|-----|
| `url` | Page to ingest as a wiki source |
| `title` | Display title |
| `tags` | string array |
| `raw_text` | Note without URL (use `source_type: "note"` in API) |
| `created_at` | ISO string from exporter (ignored by wiki unless you map it) |

The **`workspace/data/`** tree is not overwritten by deploy entrypoint (only `scripts/`, `skills/`, `docs/` are synced), so bookmarks on a Railway volume stay put across redeploys.
