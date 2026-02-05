# Secure OpenClaw with Docker + Composio (canonical path)

**Source:** [How to secure OpenClaw (Composio blog)](https://composio.dev/blog/secure-openclaw-moltbot-clawdbot-setup).  
Use this guide instead of running OpenClaw with raw credentials and no isolation.

---

## Why this path

- The **jobs worker + agent-vault** flow we built is optional and has been problematic (env loading, complexity). You can ignore it for now.
- Running OpenClaw on the host with API keys in `.env` is **unsafe**: Root risk (RCE), Agency risk (unintended actions), Keys risk (credential leakage).
- The Composio guide gives: **Docker hardening** (root risk) + **Composio managed auth** (keys + agency risk). No raw Gmail/GitHub tokens on disk; brokered OAuth + audit logs + kill switch.

---

## 1. Threat model (RAK)

| Risk | Meaning | Mitigation |
|------|--------|------------|
| **Root** | Agent or dependency gets RCE on your machine | Hardened Docker (non-root, read-only FS, cap-drop, network allowlist) |
| **Agency** | Agent does bad things in apps (e.g. delete instead of archive) | Composio least-privilege tools + audit logs + revocation |
| **Keys** | API keys / OAuth tokens leak (file read, context leak) | **Zero** raw secrets in `.env`; use Composio managed auth only |

---

## 2. Harden OpenClaw with Docker (root risk)

Run OpenClaw in a **hardened** container, not on the host.

**Hardened run (from the blog):**

```bash
docker run \
  --name openclaw-secure \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64M \
  --security-opt=no-new-privileges \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --cpus="1.0" \
  --memory="2g" \
  -u 1000:1000 \
  -v /path/to/your/workspace:/app/workspace:rw \
  openclaw/agent:latest
```

- **Read-only root FS** so RCE can’t persist.
- **No new privileges** and **cap-drop=ALL** to limit privilege escalation.
- **Strict volume:** only mount the workspace (or specific dirs), not your whole home.

**Network egress:** Restrict outbound to required APIs only (e.g. allowlist `api.openai.com`, `backend.composio.dev`, `api.anthropic.com`). Use a proxy (e.g. Squid) and `--network none` + socket or bridge to that proxy so the agent cannot exfiltrate to arbitrary hosts.

---

## 3. Use Composio for auth (keys + agency risk)

- **No** Gmail OAuth files or API keys in `.env` for third-party apps. Use **Composio** for Gmail, GitHub, Slack, etc.
- OAuth happens on Composio; tokens stay in Composio’s vault. OpenClaw only gets a **connected account ID**; Composio executes API calls. The agent never sees raw credentials.
- **Least privilege:** In Composio you enable only the actions you need (e.g. Gmail: fetch, read, create draft — **not** send or delete). Unwanted actions are rejected.
- **Audit:** Every tool call is logged in the Composio dashboard.
- **Kill switch:** Revoke the connected account in the dashboard to cut access immediately.

---

## 4. Secure Gmail skill (tutorial from the blog)

This repo includes a **secure-gmail** skill that uses Composio with least-privilege Gmail access (read + draft only; no send/delete).

**Location:** `workspace/skills/secure-gmail/` (SKILL.md, agent.py, requirements.txt, .env.example)

**Setup:**

1. **Composio account and API key**  
   Sign up at [app.composio.dev](https://app.composio.dev). Get an API key and put it in the skill’s `.env` (or a single place the skill reads):
   ```bash
   cd workspace/skills/secure-gmail
   echo 'COMPOSIO_API_KEY="your-composio-api-key"' > .env
   ```

2. **Connect Gmail in Composio (no local OAuth file)**  
   - In Composio dashboard: **Connected Accounts** → **Gmail** → **Connect**.  
   - Complete OAuth in the browser. No `client_secret.json` on your machine.

3. **Install deps and point OpenClaw at the skill**  
   ```bash
   pip install python-dotenv composio
   ```  
   Ensure OpenClaw’s skill path includes `workspace/skills` (or copy/symlink `secure-gmail` into your OpenClaw skills dir, e.g. `~/clawd/skills/`).

4. **Restart the gateway**  
   ```bash
   openclaw gateway restart
   ```

5. **Verify**  
   - `openclaw skills list | grep secure-gmail`  
   - Ask OpenClaw to “Check my latest emails”; it should use the skill and Composio. Check the Composio dashboard for the `GMAIL_FETCH_EMAILS` log.

**Allowed actions in the skill:** fetch emails, fetch by message ID, create draft, get profile. **Not** allowed: send email, delete message. If the agent tries send/delete, Composio rejects it.

---

## 5. Production checklist (from the blog)

**Infrastructure (root)**  
- [ ] OpenClaw runs in a container (hardened as above).  
- [ ] `--security-opt=no-new-privileges` and `--cap-drop=ALL`.  
- [ ] Root FS read-only (`--read-only`).  
- [ ] Network egress restricted (proxy allowlist).  
- [ ] Volumes scoped to required dirs only.

**Authentication (keys)**  
- [ ] **Zero** plaintext API keys for Gmail/GitHub/etc. in `.env`.  
- [ ] Third-party integrations use **Composio** (or similar) managed auth only.

**Permissions (agency)**  
- [ ] Least-privilege tool sets (only the actions you need).  
- [ ] No write access to critical systems the agent doesn’t need.

**Monitoring (agency)**  
- [ ] Composio dashboard (or equivalent) logs tool execution.  
- [ ] You know how to revoke a connected account (kill switch) immediately.

---

## 6. Summary

- **Ignore** the previous worker/agent-vault flow for now if it’s not working.
- **Do** run OpenClaw in a hardened Docker container and use **Composio** for Gmail (and other integrations): brokered auth, least-privilege tools, audit logs, revocation.
- Use the **secure-gmail** skill in `workspace/skills/secure-gmail/` as the reference implementation.

Reference: [Composio – How to secure OpenClaw (Moltbot / Clawdbot)](https://composio.dev/blog/secure-openclaw-moltbot-clawdbot-setup).
