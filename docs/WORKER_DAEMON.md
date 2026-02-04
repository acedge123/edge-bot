# Running the jobs worker as a daemon (Mac)

The worker in `workspace/scripts/jobs-worker.mjs` polls the Supabase `jobs` table, claims one job, POSTs to your local OpenClaw gateway (`/hooks/wake`), then marks the job done or failed. Run it **persistently** so it keeps processing.

---

## 1. Prerequisites

- Supabase: run `docs/JOBS_SCHEMA.sql` in the SQL editor (creates `jobs` table and `claim_next_job` / `complete_job` functions).
- Lovable / Agent Vault: when you insert into `agent_learnings` with `category = 'composio_trigger'`, also insert a row into `jobs`:
  - `type`: e.g. `email_received`
  - `payload`: e.g. `{ "text": "New Composio trigger (new email). Check latest composio_trigger learnings." }`
  - `status`: `queued`
- Env on the Mac: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `OPENCLAW_HOOK_URL` (default `http://127.0.0.1:18789/hooks/wake`), `OPENCLAW_HOOK_TOKEN` (if your hooks use auth). E.g. in `~/.openclaw/.env`.

---

## 2. Option A: launchd (Mac-native, restarts on crash)

1. Create a plist (replace `YOUR_USER` and path to repo):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.jobsworker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>/Users/YOUR_USER/OpenClaw_Github/workspace/scripts/jobs-worker.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USER/OpenClaw_Github/workspace</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/openclaw-worker.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/openclaw-worker.err</string>
</dict>
</plist>
```

2. Load env from `~/.openclaw/.env`: launchd does not source `.env`. Either add each variable to the plist `EnvironmentVariables`, or wrap the script in a shell that sources the file first (e.g. `ProgramArguments`: `["/bin/bash", "-lc", "source ~/.openclaw/.env 2>/dev/null; exec node /path/to/jobs-worker.mjs"]`).

3. Install and start:
   - `cp com.openclaw.jobsworker.plist ~/Library/LaunchAgents/`
   - `launchctl load ~/Library/LaunchAgents/com.openclaw.jobsworker.plist`
   - Stop: `launchctl unload ~/Library/LaunchAgents/com.openclaw.jobsworker.plist`

---

## 3. Option B: pm2 (Node, easy restart + logs)

1. Install pm2 (global): `npm install -g pm2`
2. From the **workspace** directory, with env loaded:
   - `export $(grep -v '^#' ~/.openclaw/.env | xargs)`
   - `pm2 start scripts/jobs-worker.mjs --name openclaw-worker`
3. Save process list so it restarts on reboot: `pm2 save` then `pm2 startup` (run the command it prints).
4. Logs: `pm2 logs openclaw-worker`. Stop: `pm2 stop openclaw-worker`.

---

## 4. Option C: nohup / screen (quick test only)

From the workspace directory:

```bash
export $(grep -v '^#' ~/.openclaw/.env | xargs)
nohup node scripts/jobs-worker.mjs >> /tmp/openclaw-worker.log 2>&1 &
```

Or run inside `screen` or `tmux` so you can reattach. Not ideal for long-term (no automatic restart on crash or reboot).

---

## 5. Summary

| Option   | Restart on crash | Start on boot | Best for        |
|----------|------------------|---------------|-----------------|
| launchd  | Yes (KeepAlive)  | Yes (RunAtLoad) | Native Mac      |
| pm2      | Yes              | Yes (after pm2 startup) | Node users   |
| nohup    | No               | No            | Quick testing   |

The worker only needs to reach **localhost** (OpenClaw gateway). No public URL or tunnel required.
