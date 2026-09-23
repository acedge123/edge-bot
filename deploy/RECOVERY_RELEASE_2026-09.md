# Edge Bot Recovery Release Record

Date: `2026-09-22`
Branch: `codex/tga-298-slack-final-reply`
Base commit: `26381e0`
Target: Railway project `balanced-wisdom`, service `edge-bot`, environment `production`

## Status

The recovery branch is pushed and deployed to production with explicit user
approval. Final Railway deployment `c4a0e212-ba2b-485e-b290-29247cee2bb6`
built and started successfully from commit `87d62cf`. Private and user-initiated
channel canaries passed: Edge Bot responds in Slack and the buyechelon.com
message channel and retains prior-conversation context.

Follow-up repair deployment `333d91d4-3efc-44ea-a802-34578e16ee4c`
restored synchronous `/v1/chat/completions` delivery after a real multi-step
task proved that OpenClaw 2026.8 `chat.history` flattened commentary/final
phase metadata. The replacement image digest is
`sha256:aba0397ef3571eb1ecf50f3fa39a8c2c9233db306fa4a9ad6b4863d523628b2a`.

## Exact Source Delta

- Restore recovered workspace-local skills while preserving newer repo versions
  where both copies existed. Retire the obsolete `secure-gmail`/Composio path in
  favor of the `gmail-sa` service-account integration. Startup removes only that
  explicitly retired directory from the durable volume; it does not broadly
  prune preserved skills or user-authored state.
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
- Railway build `0105bf0d-27d7-438e-b21a-15714ba810a7` failed safely before
  deployment because the CLI archive omitted the tracked runtime template. The
  narrow ignore exception fixed that issue.
- Replacement deployment `8f6705f5-52d7-4552-870b-a8bfef9da6db` passed the
  Dockerfile's jq invariants and OpenClaw validation and produced image digest
  `sha256:2ad3801267f153368097da48184f910e3b32e068421811890b84f38cb5a271a7`.
- Runtime startup confirmed the persistent volume, required Codex and Brave
  plugins, disabled heartbeat, gateway readiness, and authenticated worker poll.
- Private production canary run `e36b96e0-991a-4574-81a5-b56ddfba0115`
  completed on `gpt-5.6-luna` with a substantive final answer in about 4.9s.
- Final cleanup deployment `c4a0e212-ba2b-485e-b290-29247cee2bb6` produced
  image digest
  `sha256:29355c63b081f0f3f10d0d16009c6562ae1f6ef6b207785e246a761fdd5a4d84`.
  Startup logged the exact retirement of `secure-gmail/Composio`; live skill
  discovery reports zero `secure-gmail` entries and all five critical recovery
  skills eligible. The worker authenticated and returned `204` for an empty
  queue, and the public endpoint returned the expected authenticated `403`.
- Exact-image private canary run `86d82067-ad5f-485b-adc5-4a81ee8c6b99`
  completed on `gpt-5.6-luna` with a final answer in about 5.9s. Its prompt
  inventory includes `gmail-sa` and `Guild Leadscore` and excludes
  `secure-gmail`.
- Follow-up deployment `333d91d4-3efc-44ea-a802-34578e16ee4c` built and
  started successfully. Startup confirmed the persistent volume, workspace
  skill precedence, disabled heartbeat, gateway readiness, and worker startup.
- A direct production tool-loop canary through `/v1/chat/completions` created
  `tmp/completion-canary.txt`, read back `completion-canary-ok`, and returned
  exactly `COMPLETION_CANARY_OK created-and-read` in one completed response.
- Automated Echelon queue injection could not be used for this follow-up
  because the configured service-account email/password returned `401` from
  Supabase Auth. No credentials were changed. The next user-originated
  buyechelon.com request remains the final queue/channel acceptance check.
- `deploy/TGA_OPENCLAW_WRAPPERS.md` now records the custom TGA wrapper contract,
  credential routes, acceptance tests, native-replacement criteria, and the
  known incomplete GitHub override.

## Rollback

The immediate image rollback is successful recovery deployment
`c4a0e212-ba2b-485e-b290-29247cee2bb6`. The pre-recovery Railway rollback is
`aba2e1ec-75ca-4755-922a-f08da8e63afa`, with image digest
`sha256:b5c9a3fcc03e0aed8136d98125aa5762cdc04ae73aeb0106ca19b06bba6ed4b9`.
The source rollback point is base commit `26381e0`. If the channel canary fails,
restore the appropriate deployment and, if state was modified, the encrypted
pre-cutover volume backup. Do not delete the recovery artifacts
under `/Users/rastakit/tga-workspace/recovery/edge-bot/2026-09-21/`.

## Remaining Gates

1. Complete the independent closeout review.
2. Resolve the recovery tickets after the review confirms the recorded build,
   channel canaries, monitoring, and rollback evidence.
