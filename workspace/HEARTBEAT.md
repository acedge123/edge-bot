# Heartbeat checklist

## When you are woken (POST /hooks/wake)

**Canonical:** See **docs/JOBS_AND_WAKE_REFERENCE.md**.

The **worker** claims jobs and POSTs the job message to the Gateway at `/hooks/wake`. You do **not** call jobs/next or jobs/ack — the worker does that.

- Use the **message text** as context.
- Process it: read learnings, summarize for the user, or run the right skills.
- If a **skill or command fails**, say what failed (e.g. which skill, which tool, or the error) and that the user can check **docs/EDGE_BOT_COMMAND_EXECUTION_TROUBLESHOOTING.md** — avoid vague "command execution issues" messages.
- If nothing else needs attention, reply `HEARTBEAT_OK`.

## When a scheduled cron job runs

If the gateway has a scheduled job (see `openclaw cron list` / `~/.openclaw/cron/` on that host), treat the **job payload** as the instruction set—follow it literally (which skills to use, what to write, what status line to return).

**Hosted Railway:** Cron definitions should live on the workspace volume (see **deploy/RAILWAY_SKILLS_AND_LEARNINGS.md** § OpenClaw gateway cron and `deploy/entrypoint.sh` symlink).

When nothing in the payload needs user-visible output, reply `HEARTBEAT_OK` unless the payload says otherwise.

Other jobs will have their own payload text; process each accordingly.
