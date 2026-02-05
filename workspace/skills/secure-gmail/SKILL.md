---
name: secure-gmail
description: Read emails and create drafts using Composio managed authentication. Cannot send or delete emails (least privilege).
---

# secure-gmail

Gmail access via **Composio** with least-privilege: read and draft only. No send or delete. No local OAuth files or tokens.

## Prerequisites

1. **Composio API key** in `.env` in this skill folder or in `~/.openclaw/.env`:
   ```bash
   COMPOSIO_API_KEY="your-composio-api-key"
   ```

2. **Gmail connected in Composio** (no local credentials):
   - Go to [app.composio.dev](https://app.composio.dev) → Connected Accounts → Gmail → Connect.
   - Complete OAuth in the browser. Tokens stay in Composio's vault.

3. **Python deps:**
   ```bash
   pip install python-dotenv composio
   ```

## Allowed actions (only these)

- List emails (`GMAIL_FETCH_EMAILS`)
- Read a message by ID (`GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID`)
- Create a draft (`GMAIL_CREATE_EMAIL_DRAFT`)
- Get profile (`GMAIL_GET_PROFILE`)

**Not allowed:** send email, delete message. Composio rejects them even if the agent tries.

## Usage

When the user asks to check email, list messages, read an email, or draft a reply, use this skill. The agent script (`agent.py`) uses the Composio SDK with the scoped tools above.

## Restart gateway after adding

```bash
openclaw gateway restart
openclaw skills list | grep secure-gmail
```

Reference: [Composio – Secure OpenClaw setup](https://composio.dev/blog/secure-openclaw-moltbot-clawdbot-setup).
