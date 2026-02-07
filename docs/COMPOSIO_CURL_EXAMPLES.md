# Composio API: curl examples (avoid JSONDecodeError + zsh globbing)

When calling Composio from the shell (curl), use **proper JSON** and **quoting** so (1) zsh doesn’t treat `[INBOX]` as a glob, and (2) the response is valid JSON and doesn’t leave empty/HTML files.

---

## Rules

- **Quote the whole `-d` body** as a single JSON string: `-d '{"arguments":{...}}'`
- **Use `curl -sSf`** so curl fails on HTTP errors instead of writing empty or error HTML to the file.
- **Send real JSON**: e.g. `label_ids` must be an array `["INBOX"]`, not `arguments:label_ids:[INBOX]`.

---

## Load env then curl

```bash
set -a
source /Users/edgetbot/.openclaw/.env
set +a
```

Ensure `COMPOSIO_API_KEY` is set in that `.env`.

---

## Gmail: fetch emails

```bash
curl -sSf -X POST "https://backend.composio.dev/api/v3/tools/execute/GMAIL_FETCH_EMAILS" \
  -H "x-api-key: ${COMPOSIO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"arguments":{"label_ids":["INBOX"]}}' \
  | tee /tmp/gmail_fetch.json
```

Then read the result: `cat /tmp/gmail_fetch.json` or `python3 -c "import json; print(json.load(open('/tmp/gmail_fetch.json')))"`. If curl got an error page, `-f` will make curl exit non‑zero and you won’t write garbage to the file.

---

## Google Calendar: create event

```bash
curl -sSf -X POST "https://backend.composio.dev/api/v3/tools/execute/GOOGLECALENDAR_CREATE_EVENT" \
  -H "x-api-key: ${COMPOSIO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"arguments":{"attendees":["alan@thegig.agency"]}}' \
  | tee /tmp/gcal_create.json
```

Adjust `arguments` as needed (e.g. summary, start/end time). Always pass a JSON object; quote the whole `-d` string.

---

## If you get JSONDecodeError

- **Expecting value: line 1 column 1** usually means the file is empty or not JSON (curl failed and wrote nothing, or wrote HTML).
- Check: `ls -l /tmp/gmail_fetch.json` and `head -50 /tmp/gmail_fetch.json`.
- Fix: use `curl -sSf` so curl fails loudly on HTTP errors; use proper `-d '{"arguments":{...}}'` and valid JSON.

## If you get “zsh: no matches found”

- zsh is interpreting `[INBOX]` (or similar) as a glob. **Quote the entire `-d` argument** and use valid JSON, e.g. `-d '{"arguments":{"label_ids":["INBOX"]}}'`.
