# OpenClaw Upgrade Policy

OpenClaw upgrades are cost-sensitive production changes. Do not bump the image version, run automatic repair, or accept a generated config rewrite without explicitly reviewing and testing the controls below.

Before any upgrade, read and reconcile every entry in
[`TGA_OPENCLAW_WRAPPERS.md`](./TGA_OPENCLAW_WRAPPERS.md). The wrapper inventory is
a compatibility contract, not optional historical documentation.

## Required cost controls

1. `agents.defaults.heartbeat.every` remains `0m`; no autonomous heartbeat turns.
2. Cron and cron triggers remain disabled. The Skill Workshop autonomous mode remains `off`; it otherwise schedules hidden multi-turn reviews after normal work.
3. File-memory search remains enabled with provider `none` and cross-conversation remembering disabled. This preserves local keyword retrieval without remote embedding traffic.
4. Versioned root policy replaces generic starter policy on deploy, root memory remains a compact index, and the complete pre-compaction memory is archived.
5. Automated app signals are handled deterministically without a model unless `ECHELON_PROCESS_APP_SIGNALS_WITH_LLM` is explicitly enabled.
6. All model-backed Echelon jobs use synchronous `/v1/chat/completions`. `chat.send` plus `chat.history` polling is prohibited because flattened history can expose commentary as if it were a final response.
7. The worker keeps a bounded, volume-backed transcript of at most 12 recent messages. Sessions remain isolated by transport conversation boundary; unbounded transcript replay is prohibited.
8. Bootstrap context is injected on every turn with reviewed per-file and total caps so identity and operating policy remain available. Startup daily-memory injection and automatic pre-compaction memory flush remain disabled.
9. Narrow installed-skill capability questions bypass the model.
10. Provider quota, rate-limit, and timeout failures open the durable circuit breaker before the queue can drain into repeated paid attempts.
11. Models remain tiered: `gpt-5.6-luna` is the default; `gpt-5.6-sol` is reserved for code, debugging, architecture, security, and explicitly complex work. Do not restore `gpt-5-mini` without an authenticated production probe.
12. Mutable OpenClaw state, including cron and sessions, remains under the Railway-mounted workspace at `.openclaw-state/`.

## Upgrade procedure

1. Record the current image version, configuration, 24-hour request count, token usage, and spend baseline.
2. Read the target release notes for heartbeat, memory, session, compaction, cron, gateway, and configuration-schema changes.
3. Compare every wrapper in `TGA_OPENCLAW_WRAPPERS.md` against the proposed native behavior and record preserve, migrate, or retire decisions.
4. Run `./deploy/verify-cost-controls.sh`, then build the image. Both cost-invariant checks must pass.
5. Verify every model-backed Echelon job uses `/v1/chat/completions` and the worker contains no `chat.send` or `chat.history` polling path.
6. Run the multi-step artifact, continuation, isolation, and channel-delivery acceptance tests from the wrapper contract.
7. Verify logs show no heartbeat, cron, Skill Workshop review, embedding, repeated bootstrap, or repeated queue-claim traffic.
8. Deploy to a non-production service or one controlled probe job first. Compare request count, input tokens, and spend to the baseline before production rollout.
9. Roll back immediately if completion, integration routing, idle traffic, context size, or per-message cost regresses.

Never treat a successful container start as sufficient upgrade validation.
