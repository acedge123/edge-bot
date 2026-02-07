# Heartbeat checklist

## When you are woken (POST /hooks/wake)

**Canonical:** See **docs/JOBS_AND_WAKE_REFERENCE.md**.

The **worker** claims jobs and POSTs the job message to the Gateway at `/hooks/wake`. You do **not** call jobs/next or jobs/ack — the worker does that.

- Use the **message text** as context.
- Process it: read learnings, summarize for the user, or run the right skills.
- If a **skill or command fails**, say what failed (e.g. which skill, which tool, or the error) and that the user can check **docs/EDGE_BOT_COMMAND_EXECUTION_TROUBLESHOOTING.md** — avoid vague "command execution issues" messages.
- If nothing else needs attention, reply `HEARTBEAT_OK`.

## When a heartbeat/cron runs (e.g. hourly email check)

Your cron includes an **Email Check** job that runs every hour (see `~/.openclaw/cron/jobs.json`). When that fires:

- **Check email** using the **secure-gmail skill** and **Composio** (Gmail API). See **docs/NEW_EMAIL_TO_OPENCLAW.md** and **workspace/skills/secure-gmail/SKILL.md**.
- Do **not** run a shell command named `email` — there is no such command. Use the skill/Composio flow only.
- Summarize new or relevant messages for the user; if nothing needs attention, reply `HEARTBEAT_OK`.

Other cron jobs (e.g. Security Hooks Audit) will have their own payload text; process those accordingly.
