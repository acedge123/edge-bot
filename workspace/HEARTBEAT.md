# Heartbeat checklist

- When you are **woken** (e.g. via `POST /hooks/wake`), the **message text** is your context. The worker already claimed the job and will mark it done; you do **not** call jobs/next or jobs/ack.
- **Process the message:** e.g. if the text says "New email from inbox_messages id=123" or "New Composio trigger …", read the relevant learnings or data and summarize for the user (or run the appropriate skills).
- If nothing else needs attention, reply `HEARTBEAT_OK`.
