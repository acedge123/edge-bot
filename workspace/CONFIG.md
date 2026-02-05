# Supabase Edge Function Access

### Instructions
- Use the Supabase Edge Function proxy for secure access.
- Proxy URL: `$SUPABASE_EDGE_SECRETS_URL`
- Authentication: `Authorization: Bearer $SUPABASE_EDGE_SECRETS_AUTH`
### Accessing Composio to Use Gmail
1. Authenticate using the provided token.
2. Utilize the defined API endpoints as needed.

---

## When you receive "new job queued" or "check for jobs"

**Canonical rule:** See **docs/JOBS_AND_WAKE_REFERENCE.md** §3 (single source of truth).

Short version: when system event text is **"new job queued"** or **"check for jobs"**:

1. **Claim:** `POST $AGENT_VAULT_URL/jobs/next` with `Authorization: Bearer $AGENT_EDGE_KEY`, body `{}` or `{ "agentId": "openclaw-agent" }`. 204 = no job; 200 = `{ job, payload }`.
2. If 200: **process** the job (e.g. `payload.text`, learnings), then **ack:** `POST $AGENT_VAULT_URL/jobs/ack` with `{ "jobId": "<id>", "status": "done" }` or `{ "status": "failed", "error": "..." }`.
3. Optionally repeat until 204 (or one job per wake).
