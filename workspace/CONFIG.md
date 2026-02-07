# Supabase Edge Function Access

**Your workspace is this repo.** For procedures and reference (Composio, Gmail, worker, agent-vault, troubleshooting), see the **docs/** folder: AGENT_VAULT.md, JOBS_AND_WAKE_REFERENCE.md, NEW_EMAIL_TO_OPENCLAW.md, SECURE_OPENCLAW_COMPOSIO.md, WORKER_DAEMON.md, EDGE_BOT_COMMAND_EXECUTION_TROUBLESHOOTING.md. Read the relevant doc when the user asks for something that is documented there.

---

## Email and calendar – where to look (critical)

- **Email:** Use only the **secure-gmail** skill in **this workspace**: `workspace/skills/secure-gmail/`. Read `workspace/skills/secure-gmail/SKILL.md` and use that skill (Composio/Gmail API). Do **not** use `gcalcli`. Do **not** read or use `/opt/homebrew/lib/node_modules/openclaw/skills/gmail/` or any path under that – your skills are in the **workspace** (this repo), not in the bundled OpenClaw install.
- **Skills location:** All your skills are under the workspace: `workspace/skills/<skill-name>/`. When a tool says "no such file" for a path like `.../openclaw/skills/gmail/`, you are looking in the wrong place; use `workspace/skills/secure-gmail/` instead.
- **Do not run the jobs worker.** The script `workspace/scripts/jobs-worker.mjs` is a **daemon** the user runs separately. You never run it to "get email" or "pull jobs". To get email, use the **secure-gmail** skill only.

---

### Instructions
- Use the Supabase Edge Function proxy for secure access.
- Proxy URL: `$SUPABASE_EDGE_SECRETS_URL`
- Authentication: `Authorization: Bearer $SUPABASE_EDGE_SECRETS_AUTH`
### Accessing Composio to Use Gmail
1. Authenticate using the provided token.
2. Utilize the defined API endpoints as needed.
3. If you call Composio via **curl**, use **docs/COMPOSIO_CURL_EXAMPLES.md**: send proper JSON in `-d '{"arguments":{...}}'` (quoted), use `curl -sSf` so errors don’t write empty/HTML to files, and avoid unquoted `[INBOX]` (zsh glob).

---

## When you receive a wake (POST /hooks/wake)

**Canonical:** See **docs/JOBS_AND_WAKE_REFERENCE.md**.

The **worker** claims jobs and POSTs the job message to the Gateway at `/hooks/wake`. You do **not** call jobs/next or jobs/ack — the worker does that.

When you are woken with a message (e.g. "New email from inbox_messages id=123" or "New Composio trigger …"):

1. Use the **message text** as context.
2. Process it: read learnings, summarize for the user, or run the right skills.
3. No job claim or ack in the agent.
