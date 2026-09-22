# Edge Bot Recovery Release Record

Date: `2026-09-22`
Branch: `codex/tga-298-slack-final-reply`
Base commit: `26381e0`
Target: Railway project `balanced-wisdom`, service `edge-bot`, environment `production`

## Status

The source repair is complete and ready for independent review. It has not been
pushed or deployed. Production cutover remains governed by TGA-294 and requires
a fresh backup, explicit approval, one controlled Slack canary, monitoring, and
a demonstrably executable rollback.

## Exact Source Delta

- Restore recovered workspace-local skills while preserving newer repo versions
  where both copies existed. Retire the obsolete `secure-gmail`/Composio path in
  favor of the `gmail-sa` service-account integration.
- Remove per-agent skill allowlists and prompt-count caps that hid recovered
  capabilities after the OpenClaw upgrade.
- Restore bootstrap policy on every turn with reviewed `20000` per-file and
  `150000` total caps, local file-memory search, startup context, and the
  `memory-core` plugin. Keep recurring heartbeats, cron, autonomous workshop
  work, remote memory providers, and high-risk tools disabled.
- Make the queue worker wait through commentary for the final assistant answer,
  deliver to the originating Slack channel and thread, record successful
  delivery for duplicate suppression, and acknowledge the job only afterward.
- Use Repo C Lane A with `Authorization: Bearer <EXECUTOR_SECRET>`,
  `X-Tenant-Id`, and `Content-Type` only. Do not send a consumer `X-API-Key` or
  Supabase anon key to `/internal-execute`.
- Correct the Guild lead-score auth instructions and canonical TGA Analytics
  tenant name.

## Verification

- `node --test workspace/scripts/*.test.mjs`: 37 passing.
- `bash deploy/verify-cost-controls.sh`: passing.
- Shell syntax checks for deployment scripts: passing.
- Node syntax checks for workspace scripts: passing.
- Python AST parsing for restored skill scripts: passing.
- Generated runtime JSON and jq transformation: passing.
- OpenClaw `2026.8.2` config validation: passing, apart from the expected local
  missing-token warning.
- Skill discovery: 90 active workspace skill manifests after intentional
  removal of `secure-gmail`; critical Gmail, Guild, media buyer, workbook,
  memory, and Repo C skills are visible.
- Read-only integration checks: Repo C, Gmail, Drive, Guild pacing, all three
  Guild lead-score tenants, and TGA Analytics passed.
- Secret scan found no credential files or detected literal secrets in the
  staged source.
- Docker image build was not run because Docker, Podman, Colima, and Buildah are
  unavailable on this machine. Railway build `0105bf0d-27d7-438e-b21a-15714ba810a7`
  exposed and confirmed a CLI archive issue: the broad `openclaw.json` ignore
  rule omitted the tracked runtime template. A narrow template exception is now
  part of the branch; a successful replacement build remains required.

## Rollback

Before cutover, preserve the currently running Railway deployment and take a
fresh volume backup. The source rollback point is base commit `26381e0`. If the
canary fails, immediately restore the previous deployment and, if state was
modified, the pre-cutover volume backup. Do not delete the recovery artifacts
under `/Users/rastakit/tga-workspace/recovery/edge-bot/2026-09-21/`.

## Remaining Gates

1. Independent review of the staged source and acceptance evidence.
2. Container image build with the Dockerfile's embedded config checks.
3. TGA-294 approval and fresh production backup.
4. Controlled Slack canary in the originating thread, followed by monitoring.
