# Edge Bot: "Command Execution Issues" and Restoring Full Functionality

When the Edge bot says it **can access emails via Composio** but **can't do other things** or has **"command execution issues"**, it usually means:

- **Composio API calls** (Gmail, etc.) work — they go over HTTP to Composio; no local shell/exec.
- **Local command/tool execution** fails — e.g. running a skill script (Python/Node/Bash), or any tool that runs a subprocess on the machine where the Gateway runs.

Below: likely causes and how to fix them.

---

## 1. Two different kinds of "doing something"

| Kind | Example | Where it runs | Often works? |
|------|--------|----------------|---------------|
| **API / Composio** | Gmail fetch, create draft | HTTP to Composio; no local exec | Yes (you said emails work) |
| **Command / skill execution** | Running a skill’s `agent.py`, Bash tool, or CLI | OpenClaw Gateway process runs subprocess on your Mac (or in Docker) | Can break (sandbox, permissions, env) |

So the bot isn’t "broken" in one single way: **Composio path is fine; the path that runs local commands is what’s failing.**

---

## 2. Likely causes (and what to check)

### A. Gateway not running or worker not reaching it

- If the **Gateway** isn’t running, nothing can run skills. If the **worker** isn’t running or can’t reach the Gateway, the bot might not be getting wake events at all — or you might be talking to a **different** bot (e.g. a web/chat client that only has Composio and no command execution).

**Check:**

```bash
# Gateway listening?
curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:18789/hooks/wake \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_HOOK_TOKEN" \
  -d '{"text":"test","mode":"now"}'
# Expect 200.

# Worker running?
launchctl list | grep openclaw
# or
pm2 list | grep -E "openclaw|worker"
```

- If the **Gateway** isn’t running: start it (`openclaw gateway --port 18789`) and keep it running (or run via launchd/pm2).
- If the **worker** isn’t running: start it from repo root (`node workspace/scripts/jobs-worker.mjs`) and ensure `~/.openclaw/.env` has `AGENT_VAULT_URL`, `AGENT_EDGE_KEY`, `OPENCLAW_HOOK_TOKEN`, and optionally `GATEWAY_HTTP_URL`. See **docs/WORKER_DAEMON.md** and **docs/JOBS_AND_WAKE_REFERENCE.md**.

### B. Gateway running in a restricted environment (Docker / sandbox)

If OpenClaw runs in **Docker** with hardening (e.g. `--cap-drop=ALL`, read-only root, `noexec` on `/tmp`), the container may **block** or **limit** running scripts (Python, Node, Bash). Composio still works (outbound HTTP); local `exec`/subprocess fails.

**Fix:**

- Run the Gateway **on the host** (not in a hardened container) if you need full skill/command execution, **or**
- Relax the container so the process can execute scripts (e.g. writable `/tmp`, or allow the capabilities/paths needed for the skills you use). We don’t change your Docker here; just be aware that “command execution issues” often match “Gateway in a very locked-down container.”

### C. OpenClaw config or version disables command execution

Some OpenClaw setups or versions can restrict **which** tools or commands the agent is allowed to run (e.g. “Bash” or “run script” disabled for safety). If that’s enabled, the agent will report that it can’t run commands.

**Check:**

- OpenClaw config (e.g. `~/.openclaw/openclaw.json` or wherever your gateway config lives): look for options like “allow commands”, “allowed tools”, “sandbox”, or “exec”.
- Release notes / docs for your OpenClaw (or openclaw-core) version: see if a recent update turned on stricter execution controls.

### D. Env vars / paths for skills

Skills (e.g. **secure-gmail**) need **env** (e.g. `COMPOSIO_API_KEY`) and sometimes **Python/Node on PATH**. If the **Gateway** process runs with a different environment (e.g. no `.env` loaded, or minimal PATH), skill scripts can fail even though Composio from another context works.

**Check:**

- Ensure the Gateway is started with the same env you use for Composio (e.g. load `~/.openclaw/.env` before starting the gateway, or set vars in the launchd/pm2 config).
- From the **same user and env** that runs the Gateway, run the skill manually (e.g. `python workspace/skills/secure-gmail/agent.py`) to see if it runs; if it fails, fix PATH/env for the Gateway.

### E. You’re talking to a different “bot” (e.g. web UI with only Composio)

If the **Edge bot** you talk to is a **web or chat client** that only has Composio tools and **no** ability to run local skills or commands, it will correctly say it can use Composio (emails) but has “command execution issues” for anything that requires running a script or tool on the host.

**Fix:**

- Use the **OpenClaw Gateway** (the one that receives `/hooks/wake` and runs skills) as the main agent, and ensure the UI you use is that instance, **or**
- Add/integrate the same skills or tool-execution path to the client you’re talking to.

---

## 3. Short checklist to restore “full” functionality

1. **Gateway** is running and responds to `POST /hooks/wake` with 200 (and correct `Authorization: Bearer` token).
2. **Worker** is running and can claim jobs and POST to the Gateway (e.g. `node workspace/scripts/jobs-worker.mjs --check`).
3. **OpenClaw config** allows the tools/commands your skills need (no “block all commands” or similar).
4. **Gateway process** has the right env (e.g. `COMPOSIO_API_KEY`, PATH) and, if in Docker, can actually run scripts (not overly restricted).
5. You’re talking to the **same** bot that has both Composio **and** command execution (the Gateway-backed agent), not a client that only has Composio.

---

## 4. What to tell the bot (so it doesn’t over-claim)

If you want the bot to **stop** saying vague “command execution issues” and instead report useful details, you can add something like this to **workspace/CONFIG.md** or **workspace/HEARTBEAT.md** (or your agent instructions):

- When a **command or skill fails**, say *what* failed (e.g. “secure-gmail script failed with …” or “Bash tool returned …”) and that the user should check Gateway logs and the troubleshooting doc (**docs/EDGE_BOT_COMMAND_EXECUTION_TROUBLESHOOTING.md**), rather than a generic “command execution issues are complicating things.”

That way the bot stays accurate and you get clearer signals for debugging.

---

**Summary:** Emails via Composio work because they don’t need local command execution. “Command execution issues” almost always mean the **local** path (Gateway running skills/scripts) is blocked or misconfigured. Use the checks above to fix that path; then the bot can do both API calls and command-based tasks again.
