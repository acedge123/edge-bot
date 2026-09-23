# TGA OpenClaw Wrapper Contract

This document is the canonical inventory of TGA behavior layered around
OpenClaw in the hosted Edge Bot. These wrappers are intentional product and
security decisions. An OpenClaw upgrade must preserve them unless a separately
reviewed change proves that a native replacement is compatible and better.

Never put secret values in this file. Environment-variable names and trust
boundaries are part of the contract.

## Why the wrappers exist

OpenClaw provides a useful gateway, agent runtime, tool loop, and skill loader.
TGA owns the surrounding behavior needed for reliable production operation:

- a user receives the completed answer, not progress commentary;
- Slack, Echelon, and SMS replies return to the originating conversation;
- sessions do not leak between users, channels, or tenants;
- existing TGA credentials and service identities are used instead of a new
  OpenClaw account-connection system;
- sensitive actions pass through reviewed, constrained clients;
- automated signals do not create surprise model traffic;
- memory, skills, and mutable state survive image replacement;
- provider failures stop queue consumption instead of multiplying cost.

## Wrapper inventory

| Wrapper | TGA behavior | Native behavior replaced or constrained | Primary implementation |
|---|---|---|---|
| Echelon completion transport | Every model-backed queue job uses synchronous `/v1/chat/completions`; the worker acknowledges only the returned completed response. | `chat.send` plus `chat.history` polling can expose phase-less progress commentary as a final answer. | `workspace/scripts/echelon-agent-worker.mjs` |
| Bounded conversation continuity | Preserve at most 12 recent system/user/assistant messages in a volume-backed log, isolated by transport conversation. | OpenClaw session history is not used to infer queue completion. | `echelon-agent-worker.mjs`, `echelon-session-key.mjs` |
| Model routing | Ordinary work routes to Luna; code, architecture, debugging, security, or an explicit request routes to Sol. | One global default model for all work. | `echelon-model-route.mjs` |
| Slack reply delivery | Echelon owns inbound jobs and posts the completed answer through `slack-reply` to the original channel and thread, with durable duplicate suppression. | The agent does not use OpenClaw's Slack sender for its main reply. | `echelon-agent-worker.mjs`, `echelon-slack-delivery.mjs`, `workspace/CONFIG.md` |
| SMS delivery | Send through Repo C Lane A, then acknowledge the job. | Direct provider credentials are not exposed to the agent. | `echelon-agent-worker.mjs`, `repo-c-lane-a.mjs` |
| File ingestion | Download validated CSV/workbook uploads to the persistent workspace and give the agent an inspectable path; images remain multimodal content. | Do not rely on a generic attachment summary or ephemeral path. | `echelon-agent-worker.mjs`, `echelon-workbook-attachment.mjs` |
| Automated app signals | Handle signals deterministically by default and route approval notices to the operations Slack channel. | No automatic LLM turn unless explicitly enabled. | `echelon-app-signal-policy.mjs` |
| Capability checks | Answer narrow installed-skill questions from the actual workspace filesystem. | Avoid a paid model guess about skill availability. | `echelon-capability-query.mjs` |
| Provider circuit breaker | Pause queue claims after repeated quota, rate-limit, or timeout failures; persist breaker state on the volume. | Avoid draining a queue into repeated provider failures. | `echelon-agent-worker.mjs` |
| Google Workspace | Use the `edge@thegig.agency` service user through domain-wide delegation and `gmail-sa`; never use retired Composio or a personal OAuth connection. | OpenClaw-native Gmail/Drive connection flow. | `workspace/skills/gmail-sa/`, `workspace/CONFIG.md` |
| YouTrack | Hosted agents call Repo C `/internal-execute` with Lane A bearer auth and tenant context. | No direct hosted `YOUTRACK_TOKEN` calls and no consumer `X-API-Key`. | `workspace/skills/youtrack-via-repo-c/`, `workspace/scripts/youtrack-via-repo-c.mjs` |
| Durable memory | Use Agent Vault for intentional durable learnings and relational memory; keep ordinary chat from writing memory automatically. | No autonomous memory writes, dreaming, or remote embedding traffic. | `workspace/skills/agent-learnings/`, `workspace/AGENTS.md`, runtime config |
| Media buying and analytics | Use pacing, Guild, and TGA Analytics endpoints with the reviewed env names and auth headers. | Do not substitute generic ad-platform connectors. | `workspace/skills/media-buyer/`, Guild skills |
| Governance | Use Governance Hub's explicit kernel and tenant auth lanes. | Do not improvise HMAC or proxy flows. | `workspace/skills/governance-runtime/` |
| Mom Walk administration | Use the root-owned allowlisted `mom-walk-manage` executable with target confirmation and parameter validation. | No generic shell/curl recreation of privileged `/manage` calls. | `tools/mom-walk-manage.mjs`, `workspace/skills/mom-walk-manage/` |
| Workspace skill precedence | Version TGA skills in this repo and direct the agent to workspace skills when a local replacement exists. | Bundled OpenClaw skills are not authoritative for TGA integrations. | `workspace/skills/`, `workspace/CONFIG.md`, `deploy/entrypoint.sh` |
| Persistent runtime | Mount `/app/.openclaw/workspace`, seed reviewed image content, and store mutable OpenClaw state beneath the volume. | Container replacement must not erase skills, memory, sessions, or cloned repos. | `deploy/entrypoint.sh`, `deploy/RAILWAY_RUNTIME.md` |

## Credential routing contract

| System | Canonical hosted variables | Required route |
|---|---|---|
| Echelon queue and Slack reply | `AGENT_HOSTED_EDGE_KEY` | Echelon `agent-next`, `agent-ack`, and `slack-reply` |
| Repo C trusted execution | `CIA_URL`, `EXECUTOR_SECRET` | Bearer `EXECUTOR_SECRET`, `X-Tenant-Id`, JSON content type; never consumer `X-API-Key` |
| Google Workspace | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_IMPERSONATED_USER` | `gmail-sa` service-account helper |
| Agent Vault | `AGENT_VAULT_URL`, `AGENT_EDGE_KEY` | `agent-learnings` and approved Vault-aware skills |
| TGA Analytics | `AGENT_MEDIA_ANALYTICS_KEY` | Bearer auth to `agent-analytics` |
| GitHub | `EDGE_BOT_PERSONAL`, `TGA_GH_TOKEN`, purpose-specific tokens such as `GITHUB_SDR_TOKEN` | TGA token wrapper, once repaired; do not use OpenClaw account identity as proof of repository access |
| Governance Hub | `ACP_BASE_URL`, `ACP_KERNEL_ID`, `ACP_KERNEL_KEY` | `governance-runtime` auth lanes |
| Mom Walk manage | `MOM_WALK_AGENT_MINT_SECRET` | Root-owned `mom-walk-manage` only |

## Known gap: GitHub override

The Railway service contains the TGA GitHub credentials, but the current
workspace `github` skill tells the agent to use `gh`; the image does not install
`gh`, and OpenClaw's native `github_identity_status` checks a different account
connection system. This can incorrectly report that GitHub access is not
configured even when a TGA token is available.

Until the wrapper is repaired, treat native GitHub identity output as
non-authoritative. The repair should provide a constrained helper that selects
the approved token by repository/purpose, tests access without printing the
credential, and supports only reviewed read/write operations. Do not alias all
GitHub credentials into one global token without defining repository scope.

## Switching back to native OpenClaw behavior

Native behavior may replace a wrapper only when all of the following are true:

1. The replacement uses the same TGA service identity and trust boundary.
2. It supports the same conversation isolation, idempotency, and final-response
   guarantees.
3. It does not expose credentials to prompts, logs, URLs, or model output.
4. It passes the wrapper's existing tests plus a production-like acceptance
   test on a non-production service.
5. Token use, latency, failure behavior, and cost are measured against the
   current wrapper.
6. The migration and rollback are documented and explicitly approved.
7. This inventory, the upgrade policy, and verification scripts are updated in
   the same reviewed change.

"Native is newer" or "the container starts" is not sufficient evidence.

## Required acceptance tests

Before any OpenClaw upgrade or wrapper replacement:

1. Submit a multi-step Echelon request that reads a skill, invokes a tool,
   creates a file, and returns the artifact in the originating channel.
2. Confirm no commentary-only message is stored as `response_text`.
3. Continue the same conversation and verify prior-turn context; start another
   actor/thread and verify isolation.
4. Verify a Slack reply lands once in the correct channel and thread.
5. Verify Gmail/Drive through `gmail-sa`, YouTrack through Repo C, media
   analytics through its bearer key, and GitHub through the TGA wrapper.
6. Restart the container and confirm volume-backed skills, state, and session
   history remain available.
7. Run `node --test workspace/scripts/*.test.mjs` and
   `bash deploy/verify-cost-controls.sh`.

## Change discipline

- Read this file and `OPENCLAW_UPGRADE_POLICY.md` before changing OpenClaw,
  plugins, skills, worker transport, authentication, or persistent paths.
- Update this file whenever a wrapper, credential name, endpoint, or trust
  boundary changes.
- Never delete a workspace skill merely because OpenClaw ships a similarly
  named bundled skill. Compare behavior and migrate deliberately.
- Keep rollback image/source identifiers in the release record.
