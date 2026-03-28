# Supabase Edge Function Access

**Your workspace is this repo.** For procedures and reference (Composio, Gmail, worker, agent-vault, troubleshooting), see the **docs/** folder: AGENT_VAULT.md, JOBS_AND_WAKE_REFERENCE.md, NEW_EMAIL_TO_OPENCLAW.md, SECURE_OPENCLAW_COMPOSIO.md, WORKER_DAEMON.md, EDGE_BOT_COMMAND_EXECUTION_TROUBLESHOOTING.md. Read the relevant doc when the user asks for something that is documented there.

**Multi-repo orientation (TGA):** use the **`repo-map`** skill — `workspace/skills/repo-map/SKILL.md` — for which GitHub repo owns a feature, boundaries between repos, and preferred commands. That skill mirrors the human file **`WORKSPACE_REPO_MAP.md`** at the `tga-workspace` root (renamed from `AGENTS.md` to avoid clashing with Codex/Cursor `AGENTS.md`).

**Redacted business financials:** for bank statements, exports, and tax/bookkeeping *assistance* (not CPA advice), use the **`small-business-finance-tax`** skill — `workspace/skills/small-business-finance-tax/SKILL.md`. Prefer redacted uploads; the user may attach PDFs/CSVs via the hosted agent UI or place files under the agent workspace when available.

---

## Email and calendar – where to look (critical)

- **Email:** Use only the **secure-gmail** skill in **this workspace**: `workspace/skills/secure-gmail/`. Read `workspace/skills/secure-gmail/SKILL.md` and use that skill (Composio/Gmail API). Do **not** use `gcalcli`. Do **not** read or use `/opt/homebrew/lib/node_modules/openclaw/skills/gmail/` or any path under that – your skills are in the **workspace** (this repo), not in the bundled OpenClaw install.
- **Skills location:** All your skills are under the workspace: `workspace/skills/<skill-name>/`. When a tool says "no such file" for a path like `.../openclaw/skills/gmail/`, you are looking in the wrong place; use `workspace/skills/secure-gmail/` instead. If the agent reports *no workspace-local skills*, the OpenClaw workspace dir (e.g. `/root/.openclaw/workspace`) may be missing the `skills/` tree — see **docs/WORKSPACE_LOCAL_SKILLS.md** for how to copy or symlink this repo’s `workspace/skills/` into that directory.
- **Agent Vault learnings:** To save/retrieve durable learnings in Agent Vault, use `workspace/skills/agent-learnings/SKILL.md` (skill name: `agent-learnings`). Use this for meaningful reusable memory, not transient chat text.
- **Governance Hub runtime:** For heartbeat, authorize, audit-ingest, policy-propose, or tenant rules (e.g. onsite-affiliate, mom-walk-connect), use the **governance-runtime** skill: `workspace/skills/governance-runtime/`. The skill is named **governance-runtime** (not "access governance"); it lives in `workspace/skills/governance-runtime/SKILL.md`.
- **Google Places + sponsors:** To search venues or enrich a **local sponsors list**, use **`google-places`** (`workspace/skills/google-places/SKILL.md`) with env **`GOOGLE_MAPS_API_KEY`**, and **`sponsors-database`** (`workspace/skills/sponsors-database/SKILL.md`) for the JSON workflow under `workspace/data/sponsors/`.
- **Do not run the jobs worker.** The script `workspace/scripts/jobs-worker.mjs` is a **daemon** the user runs separately. You never run it to "get email" or "pull jobs". To get email, use the **secure-gmail** skill only.

---

## Slack-origin conversations (worker-owned delivery)

When the conversation is from **Slack** (Echelon Slack channel), your reply is delivered by the **worker** via the slack-reply edge function — not by you calling the Slack skill/tool.

- **Do not** use the Slack skill or `message.send` (or any slack send action) to deliver your response in this context. The worker will post your reply to Slack using the job metadata (channel, thread).
- If your session key starts with `agent:main:slack:`, you are in a Slack-origin conversation: respond with plain text only; do not invoke the Slack tool for delivery. You may still use the Slack skill for other actions (e.g. react, read, pin) if needed, but **never for sending the main reply**.
- **"Say hi to @X" / "message @X" / "tell @X"**: When the user asks you to greet or message someone (e.g. "say hi to @jamie"), **do not** use the Slack skill to send a DM or a separate message. Instead, **reply in the current thread** with your message and include the @mention (e.g. "Hi @jamie!"). The worker will post that reply in the same channel/thread. Using the Slack send tool for a user target often fails (e.g. "Unknown target"); replying in-thread with an @mention avoids that and keeps the reply in channel.

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
