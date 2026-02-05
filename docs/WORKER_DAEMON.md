# Running the jobs worker (daemon)

**Full architecture and contract:** see **docs/JOBS_AND_WAKE_REFERENCE.md**. This file only covers how to run the worker and the Gateway.

---

## What runs on the Mac

**1. OpenClaw Gateway (the brain) — always on**

```bash
openclaw gateway --port 18789
```

This is the always-on process: channels, sessions, agent, hooks, memory, skills. It exposes `POST http://127.0.0.1:18789/hooks/wake`. Do **not** run `openclaw agent` in a loop from bash.

**2. Jobs worker (the pulse) — daemon**

The worker script: **claim one job** (agent-vault `/jobs/next`) → **POST** it to the Gateway at `/hooks/wake` → **ack** the job (`/jobs/ack`). Repeat. Polling every ~2s when idle.

**Run from the repo root** (paths in this doc are relative to the OpenClaw_Github repo):

```bash
cd /Users/edgetbot/OpenClaw_Github
node workspace/scripts/jobs-worker.mjs
```

Or use the full path: `node /Users/edgetbot/OpenClaw_Github/workspace/scripts/jobs-worker.mjs`

---

## What the worker does (summary)

- Calls agent-vault `POST /jobs/next` to **claim** one job.
- **POSTs** the job payload to `http://127.0.0.1:18789/hooks/wake` with `{ "text": "<message>", "mode": "now" }`.
- Calls agent-vault `POST /jobs/ack` to mark the job **done** (or **failed** if the wake POST failed).
- No CLI poke. No OpenClaw pull — the worker pushes the job to the Gateway.

---

## Env (worker)

In `~/.openclaw/.env` (worker loads it):

| Variable | Purpose |
|----------|---------|
| `AGENT_VAULT_URL` | Agent-vault Edge Function base URL |
| `AGENT_EDGE_KEY` | Bearer token for /jobs/next and /jobs/ack |
| `GATEWAY_HTTP_URL` | Optional; default `http://127.0.0.1:18789` |
| `JOBS_POLL_INTERVAL_MS` | Optional; default 2000 |

See **docs/JOBS_AND_WAKE_REFERENCE.md** §5.

---

## Option A: launchd (Mac)

1. Plist, e.g. `~/Library/LaunchAgents/com.openclaw.jobsworker.plist`:

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
    <string>/path/to/OpenClaw_Github/workspace/scripts/jobs-worker.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/OpenClaw_Github/workspace</string>
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

2. Worker loads `~/.openclaw/.env` itself.
3. `launchctl load ~/Library/LaunchAgents/com.openclaw.jobsworker.plist` / `unload` to stop.

Run the **Gateway** separately (e.g. in a terminal or its own launchd plist).

---

## Option B: pm2

From the workspace directory:

```bash
export $(grep -v '^#' ~/.openclaw/.env | xargs)
pm2 start scripts/jobs-worker.mjs --name openclaw-worker
pm2 save && pm2 startup
```

Run the **Gateway** separately (e.g. `pm2 start "openclaw gateway --port 18789" --name openclaw-gateway` or in another process).
