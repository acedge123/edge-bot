# Supabase Edge Function Access

### Instructions
- Use the Supabase Edge Function proxy for secure access.
- Proxy URL: `$SUPABASE_EDGE_SECRETS_URL`
- Authentication: `Authorization: Bearer $SUPABASE_EDGE_SECRETS_AUTH`
### Accessing Composio to Use Gmail
1. Authenticate using the provided token.
2. Utilize the defined API endpoints as needed.

---

## When you receive a wake (POST /hooks/wake)

**Canonical:** See **docs/JOBS_AND_WAKE_REFERENCE.md**.

The **worker** claims jobs and POSTs the job message to the Gateway at `/hooks/wake`. You do **not** call jobs/next or jobs/ack — the worker does that.

When you are woken with a message (e.g. "New email from inbox_messages id=123" or "New Composio trigger …"):

1. Use the **message text** as context.
2. Process it: read learnings, summarize for the user, or run the right skills.
3. No job claim or ack in the agent.
