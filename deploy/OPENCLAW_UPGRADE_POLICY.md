# OpenClaw Upgrade Policy

OpenClaw upgrades are cost-sensitive production changes. Do not bump the image version, run automatic repair, or accept a generated config rewrite without explicitly reviewing and testing the controls below.

## Required cost controls

1. `agents.defaults.heartbeat.every` remains `0m`; no autonomous heartbeat turns.
2. Cron and cron triggers remain disabled. The Skill Workshop autonomous mode remains `off`; it otherwise schedules hidden multi-turn reviews after normal work.
3. File-memory search remains enabled with provider `none` and cross-conversation remembering disabled. This preserves local keyword retrieval without remote embedding traffic.
4. Versioned root policy replaces generic starter policy on deploy, root memory remains a compact index, and the complete pre-compaction memory is archived.
5. Automated app signals are handled deterministically without a model unless `ECHELON_PROCESS_APP_SIGNALS_WITH_LLM` is explicitly enabled.
6. Ordinary text and CSV jobs use `chat.send`. Only real image jobs use `/v1/chat/completions`.
7. The worker does not build and resend its own transcript. Sessions are isolated by transport conversation boundary and reset after 60 idle minutes.
8. Bootstrap context is injected on every turn with reviewed per-file and total caps so identity and operating policy remain available. Startup daily-memory injection and automatic pre-compaction memory flush remain disabled.
9. Narrow installed-skill capability questions bypass the model.
10. Provider quota, rate-limit, and timeout failures open the durable circuit breaker before the queue can drain into repeated paid attempts.
11. Models remain tiered: `gpt-5.6-luna` is the default; `gpt-5.6-sol` is reserved for code, debugging, architecture, security, and explicitly complex work. Do not restore `gpt-5-mini` without an authenticated production probe.
12. Mutable OpenClaw state, including cron and sessions, remains under the Railway-mounted workspace at `.openclaw-state/`.

## Upgrade procedure

1. Record the current image version, configuration, 24-hour request count, token usage, and spend baseline.
2. Read the target release notes for heartbeat, memory, session, compaction, cron, gateway, and configuration-schema changes.
3. Run `./deploy/verify-cost-controls.sh`, then build the image. Both cost-invariant checks must pass.
4. Verify text and CSV jobs use `chat.send`; verify only real images use `/v1/chat/completions`.
5. Verify logs show no heartbeat, cron, Skill Workshop review, embedding, repeated bootstrap, or repeated queue-claim traffic.
6. Deploy to a non-production service or one controlled probe job first. Compare request count, input tokens, and spend to the baseline before production rollout.
7. Roll back immediately if idle requests, embeddings, context size, or per-message cost increases unexpectedly.

Never treat a successful container start as sufficient upgrade validation.
