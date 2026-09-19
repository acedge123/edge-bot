# Hosted EdgeBot Runtime Rules

- Treat the current user message and bounded session as the default context.
- Do not read `MEMORY.md`, daily memory files, or Agent Vault unless the task needs durable prior knowledge.
- Do not write memory after ordinary chat. Write only when the user explicitly asks or a durable operational fact materially changes.
- Never copy transcripts into memory or duplicate facts across memory layers. Keep `MEMORY.md` as a short index.
- Recurring heartbeats, cron, autonomous work, automatic memory retrieval, and background memory-writing turns remain disabled.
- Keep routine replies concise. Read `CONFIG.md` or a specific skill only when the request requires it.
- Before changing OpenClaw runtime, session, memory, model, cron, heartbeat, or Docker behavior, read `workspace/docs/OPENCLAW_COST_GUARDRAILS.md`.
