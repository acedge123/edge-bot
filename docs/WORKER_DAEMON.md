# Running the jobs worker (daemon)

**Full architecture, contract, and OpenClaw rule:** see **docs/JOBS_AND_WAKE_REFERENCE.md**. This file only covers how to run the worker as a daemon.

---

## What the worker does (summary)

- Polls Supabase for any `jobs` row with `status = 'queued'`.
- If any: runs `openclaw system event --text "new job queued" --mode now` (CLI poke). Cooldown 30s.
- Does **not** claim or complete jobs; OpenClaw pulls via agent-vault `/jobs/next` and `/jobs/ack`.

---

## Option A: launchd (Mac)

1. Plist (replace paths), e.g. `~/Library/LaunchAgents/com.openclaw.jobsworker.plist`:

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

---

## Option B: pm2

From the workspace directory:

```bash
export $(grep -v '^#' ~/.openclaw/.env | xargs)
pm2 start scripts/jobs-worker.mjs --name openclaw-worker
pm2 save && pm2 startup
```

---

## Env (see reference)

Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or service role). Optional: `OPENCLAW_CLI_PATH`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `JOBS_POLL_INTERVAL_MS`, `JOBS_WAKE_COOLDOWN_MS`. All in `~/.openclaw/.env`. See **docs/JOBS_AND_WAKE_REFERENCE.md** §2.
