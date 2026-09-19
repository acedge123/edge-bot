# Hosted OpenClaw Cost Guardrails

These are production invariants for edge-bot on Railway. They were restored after the 2026.8 upgrade caused repeated context, heartbeat, embedding, and queue-driven model traffic. Do not upgrade or rewrite OpenClaw configuration without reviewing each invariant and comparing spend before and after.

1. Recurring heartbeats stay disabled with `agents.defaults.heartbeat.every = "0m"`.
2. Cron and cron triggers stay disabled. Skill Workshop autonomous mode stays `off`; OpenClaw 2026.8.2 otherwise defaults it to `auto` and can run hidden multi-turn experience reviews.
3. Hosted memory search stays disabled with `memory.search.enabled = false`, provider = `none`, and `rememberAcrossConversations = false`. Durable files and Agent Vault do not justify automatic embedding traffic.
4. The versioned hosted `AGENTS.md` replaces generic starter policy on each deploy. Root `MEMORY.md` stays a compact index; its pre-compaction contents remain archived on the volume.
5. Automated app signals use deterministic handling and no LLM unless `ECHELON_PROCESS_APP_SIGNALS_WITH_LLM` is explicitly enabled.
6. Ordinary text and CSV jobs use `chat.send`, allowing OpenClaw to own compact session context. Only real image jobs use `/v1/chat/completions`.
7. The queue worker never assembles and resends a parallel transcript. Sessions are isolated by SMS sender, Slack thread, app signal, or Echelon actor/conversation and reset after 60 idle minutes.
8. Repeated bootstrap injection is skipped on continuation turns, startup daily-memory injection and pre-compaction memory flush are disabled, and old tool output is pruned.
9. Installed-skill capability checks are deterministic and bypass the model.
10. Provider quota, rate-limit, and timeout failures open the persistent circuit breaker before more jobs are claimed.
11. Models stay tiered: `gpt-5-mini` handles ordinary work; `gpt-5.6-sol` handles code, debugging, architecture, security, and explicitly complex work.
12. Mutable state and cron live under `workspace/.openclaw-state/` on the Railway volume. Startup must not run automatic update repair.

Before an upgrade, record a 24-hour request/token/spend baseline, run `deploy/verify-cost-controls.sh`, test one controlled job, and inspect logs for idle turns, embeddings, repeated context, and queue churn. A container that merely starts is not a successful upgrade.
