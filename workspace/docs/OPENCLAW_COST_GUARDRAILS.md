# Hosted OpenClaw Cost Guardrails

These are production invariants for edge-bot on Railway. They were restored after the 2026.8 upgrade caused repeated context, heartbeat, embedding, and queue-driven model traffic. Do not upgrade or rewrite OpenClaw configuration without reviewing each invariant and comparing spend before and after.

1. Recurring heartbeats stay disabled with `agents.defaults.heartbeat.every = "0m"`.
2. Hosted memory search stays disabled with `memory.search.enabled = false`, `provider = "none"`, and `rememberAcrossConversations = false`. Durable files and Agent Vault do not justify automatic embedding traffic.
3. Ordinary text and CSV jobs use `chat.send`, allowing OpenClaw to own compact session context. Only real image jobs use `/v1/chat/completions`.
4. The queue worker never assembles and resends a parallel transcript or repeated workspace bootstrap context.
5. Provider quota, rate-limit, and timeout failures open the persistent circuit breaker before more jobs are claimed.
6. Models stay tiered: `gpt-5.6-sol` is the reliable default and `gpt-5-mini` is used only for explicit or narrowly classified lightweight work.
7. Mutable state and cron live under `workspace/.openclaw-state/` on the Railway volume. Startup must not run automatic update repair.

Before an upgrade, record a 24-hour request/token/spend baseline, run `deploy/verify-cost-controls.sh`, test one controlled job, and inspect logs for idle turns, embeddings, repeated context, and queue churn. A container that merely starts is not a successful upgrade.
