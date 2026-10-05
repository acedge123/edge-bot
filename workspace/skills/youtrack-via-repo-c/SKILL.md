---
name: youtrack-via-repo-c
description: |
  Hosted-friendly YouTrack actions via Repo C internal-execute (no direct YouTrack token).
  Use this skill for YouTrack writes from Railway/Slack: create issues, apply command updates (assignee/state/sprint), etc.
metadata: {"clawdbot":{"requires":{"env":["CIA_URL","EXECUTOR_SECRET"]}}}
---

# YouTrack via Repo C (hosted-safe)

## When to use this skill

Use this skill **instead of** the direct `youtrack` REST skill when running hosted (Railway / Slack), or whenever direct YouTrack API tokens are not available.

This path calls **Repo C** `/functions/v1/internal-execute` which performs the YouTrack action server-side.
It uses Lane A authentication: `Authorization: Bearer $EXECUTOR_SECRET` plus
`X-Tenant-Id`. Do not send a consumer `X-API-Key` or Supabase anon key.

## Tenant selection

- Prefer the tenant from the job/session context when available.
- If unclear, default to `leadscore` for now (per current deployment convention).

## Commands

### Read an issue

```bash
node workspace/scripts/youtrack-via-repo-c.mjs issues.get \
  --issueId TGA-293 \
  --tenant-id "$DEFAULT_TENANT_ID"
```

### Create an issue

Run:

```bash
node workspace/scripts/youtrack-via-repo-c.mjs issues.create \
  --projectId 0-97 \
  --summary "Test: Edge bot can create issues in AI Gift" \
  --description "Created through Repo C from hosted agent" \
  --tenant-id leadscore
```

### Apply YouTrack command(s) to an issue

Examples:

```bash
node workspace/scripts/youtrack-via-repo-c.mjs commands.apply \
  --issueId AIGIFT-2 \
  --query "Assignee EdgeBot State Backlog" \
  --tenant-id leadscore
```

```bash
node workspace/scripts/youtrack-via-repo-c.mjs commands.apply \
  --issueId AIGIFT-2 \
  --query "Sprint {Sprint 155}" \
  --tenant-id leadscore
```

## Notes on “add to board”

Most agile boards are query-based; “add to board” is typically achieved by setting a field the board query depends on (commonly `Sprint`).
