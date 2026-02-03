# Supabase Edge Function Access

### Agent Vault (Composio / Gmail)
- **Send email:** POST to this exact URL (do not use a placeholder like `your-email-endpoint`):
  `https://nljlsqgldgmxlbylqazg.supabase.co/functions/v1/agent-vault/composio/tools/execute`
- Auth: `Authorization: Bearer $AGENT_EDGE_KEY`
- Body: `{"toolSlug":"GMAIL_SEND_EMAIL","input":{...}}`
- Full details: see workspace `TOOLS.md` → "Using Gmail via Composio proxy".

### Optional: secrets proxy (only if configured)
- Use only if `SUPABASE_EDGE_SECRETS_URL` and `SUPABASE_EDGE_SECRETS_AUTH` are set in `~/.openclaw/.env`.
- Proxy URL: `$SUPABASE_EDGE_SECRETS_URL`
- Authentication: `Authorization: Bearer $SUPABASE_EDGE_SECRETS_AUTH`