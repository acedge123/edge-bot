# OpenClaw Upgrade Policy

OpenClaw upgrades are cost-sensitive production changes. Do not bump the image version, run automatic repair, or accept a generated config rewrite without explicitly reviewing and testing the controls below.

## Required cost controls

1. `agents.defaults.heartbeat.every` remains `0m`; no autonomous heartbeat turns.
2. Remote memory search/indexing remains disabled (`memory.search.enabled=false`, provider `none`). Durable files may still exist on the Railway volume without being embedded on every change.
3. Ordinary text and CSV jobs use `chat.send`. Only real image jobs use `/v1/chat/completions`.
4. The worker does not build and resend its own transcript or bootstrap bundle. OpenClaw owns session context and compaction.
5. Provider quota, rate-limit, and timeout failures open the durable circuit breaker before the queue can drain into repeated paid attempts.
6. Models remain tiered: `gpt-5.4-mini` for normal work, `gpt-5.4` for code/reasoning, and `gpt-5.6-sol` only for critical work.
7. Mutable OpenClaw state, including cron and sessions, remains under the Railway-mounted workspace at `.openclaw-state/`.

## Upgrade procedure

1. Record the current image version, configuration, 24-hour request count, token usage, and spend baseline.
2. Read the target release notes for heartbeat, memory, session, compaction, cron, gateway, and configuration-schema changes.
3. Run `./deploy/verify-cost-controls.sh`, then build the image. Both cost-invariant checks must pass.
4. Verify text and CSV jobs use `chat.send`; verify only real images use `/v1/chat/completions`.
5. Verify logs show no heartbeat runs, embedding requests, repeated bootstrap payloads, or repeated queue claims after provider failure.
6. Deploy to a non-production service or one controlled probe job first. Compare request count, input tokens, and spend to the baseline before production rollout.
7. Roll back immediately if idle requests, embeddings, context size, or per-message cost increases unexpectedly.

Never treat a successful container start as sufficient upgrade validation.
