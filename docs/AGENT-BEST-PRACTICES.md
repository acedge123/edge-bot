# TGA Agent Best Practices

Use this guide for Codex, Lovable, Cursor, Railway agents, and future client-facing agent work.

This guide adapts ideas from pstack and combines them with Jan's TGA engineering rules. It is the portable version that can live in each project under `docs/`.

## Core Rule

Agents must leave the system more reliable than they found it.

For every non-trivial task:

1. Identify the work type.
2. Define what done means.
3. Inspect the existing system before changing it.
4. Make the smallest useful change that fits the architecture.
5. Verify the real behavior.
6. Leave a concise handoff.

## Work Types

Pick one before starting.

| Work type | Use when | Required proof |
| --- | --- | --- |
| Investigation | Answering how, why, should we, or are we sure | File references, data, logs, deployed state, or cited source |
| Bug fix | A behavior is broken | Repro before, fix after, same path passes |
| Feature | New or changed behavior | User flow, API call, database write, or job path works |
| Refactor | Structure changes without behavior change | Tests or before/after behavior check |
| Parity | Web, mobile, backend, or docs must match | Side-by-side feature checklist |
| Production incident | Runtime, deploy, queue, Slack, SMS, auth, or data issue | Live path verified, not only code checked |
| Release | TestFlight, App Store, Vercel, Railway, or Supabase deploy | Version, build, commit, deploy URL, and smoke test |
| Docs | Plan, handoff, guide, or client material | Clear owner, exact steps, real paths, no stale claims |

## Define Done First

Before editing, write the proof condition in plain language.

Good examples:

- `Maybe RSVP submits RsvpStatus.maybe and paid events do not open Stripe.`
- `An approval-required app signal posts in #ops-signals and the job is not acked done if Slack delivery fails.`
- `Vercel build creates .vercel/output/functions/__server.func/index.mjs.`
- `The Supabase migration applies cleanly and RLS allows the intended actor only.`

Weak examples:

- `Looks good.`
- `Build passed.`
- `Agent said it worked.`
- `Patch applied.`

## Architecture Standard

Use the existing project architecture.

Default flow:

```text
UI/View -> State layer -> Use case or service -> Repository interface -> Repository implementation -> Data source or external system
```

Rules:

- Keep UI passive. UI renders state and dispatches intent.
- Keep business logic out of screens, route handlers, and presentation callbacks unless the task is tiny.
- Validate raw input at boundaries.
- Convert raw input into typed internal data.
- Keep persistence and external API details inside data sources or adapters.
- Use dependency injection when the repo already uses it.
- Use the repo's design tokens, shared primitives, error types, and logging patterns.
- Avoid magic strings and repeated shape assumptions.

## Model The Domain

Encode real concepts in types and data structures.

Use:

- Enums for finite states.
- Typed request and response DTOs for APIs and edge functions.
- State machines for workflows with phases.
- Registries or maps for routing rules.
- Queues and idempotency keys for async work.
- Normalized tables for shared operational facts.

Avoid:

- Scattered booleans that must stay in sync.
- Free-form strings for important states.
- Repeated if/else chains across files.
- Business rules hidden in UI text or prompt strings.

TGA examples:

- RSVP status should be a typed value, not a string guessed by widgets.
- Echelon signal status, route, severity, approval status, and feedback outcome should be constrained values.
- Forecast Flex budget recommendations should be structured requests with caps, approvals, and audit rows.

## Boundary Discipline

Treat these as boundaries:

- Webhooks.
- Supabase edge functions.
- Slack and SMS commands.
- Agent job payloads.
- CSV uploads.
- External APIs.
- Environment variables.
- Local files loaded by hosted agents.

At a boundary:

- Validate required fields.
- Clamp sizes.
- Reject unknown critical states.
- Normalize names and IDs.
- Authenticate the caller.
- Log enough context to debug without leaking secrets.

Inside the system:

- Trust typed data.
- Keep pure logic pure.
- Return typed errors.
- Do not repeat defensive checks everywhere.

## Idempotency

Every state-changing operation must handle retries.

Ask:

1. What happens if this runs twice?
2. What happens if the first run crashes halfway?
3. What key or state lets the next run converge?

Use:

- `correlation_id` and `dedupe_key` for webhooks.
- Unique indexes for event intake.
- Delivery markers for Slack, SMS, email, and webhooks.
- Approval IDs for gated actions.
- Readback checks after external mutations.
- Reconciliation steps on worker startup.

Do not mark a job `done` until the required external effect happened or was intentionally skipped with a recorded reason.

## Human Approval

Agents may prepare sensitive actions. They must not execute sensitive actions until approval exists.

Sensitive actions include:

- Password or account access changes.
- Refunds, billing changes, ad spend changes, and campaign pauses.
- Permission grants or revokes.
- Deletes, deploys, and production data writes.
- Any action that uses a secret or privileged connector.

Approval flows must include:

- The requested action.
- The risk.
- The exact object being changed.
- The before and after values.
- The approver.
- The resulting execution job or rejection record.

## Verify The Real Thing

Verification must match the changed behavior.

Examples:

- Flutter: run targeted tests and, for UI-risk changes, inspect the screen or widget behavior.
- Supabase: apply or type-check migrations, test RLS expectations, invoke the edge function when possible.
- Echelon signals: post a real or synthetic signal, inspect `app_signal_events`, `agent_jobs`, approvals, and feedback.
- Railway worker: verify the code in git, the Docker image path, the running process logs, and the live queue behavior.
- Vercel or Lovable web: run the production-shaped build and inspect the generated output.
- Docs: verify paths, command names, ticket IDs, and current product state.

Do not use proxies when the real check is available.

Proxies include:

- File timestamps.
- A green compile only.
- A summary from another agent.
- A local patch that was not committed.
- A prompt that says Slack should be notified, without checking Slack or the delivery path.

## Debugging Standard

For bugs:

1. Reproduce the symptom.
2. Identify the mechanism.
3. Fix the root cause.
4. Check for the same pattern elsewhere.
5. Verify the original repro path.

When runtime behavior differs from code, check each layer:

- Local working tree.
- Remote branch.
- Deployed commit.
- Built artifact or Docker image.
- Persistent runtime volume.
- Running process.
- External system state.

This matters for Railway and Echelon. A live workspace patch is not the same thing as a deployed git-backed worker.

## Documentation Standard

Docs should help the next engineer act.

Write:

- Short sentences.
- Real file paths, symbols, commands, endpoints, and ticket IDs.
- One owner per step.
- Current state and next action.
- Acceptance criteria that can be tested.

Avoid:

- Marketing language.
- Long background sections.
- Stale "pending" notes after work ships.
- Vague phrases such as "integrate with the agent" without naming the queue, endpoint, or payload.

Use one doc mode per file:

- How-to: steps to complete a task.
- Reference: exact schema, endpoint, field, or command facts.
- Explanation: why the design works this way.
- Plan: phased implementation with owners and proof.

## Handoff Format

Every completed task should end with:

- What changed.
- Where it changed.
- How it was verified.
- What remains.
- Whether code was committed, pushed, deployed, or only changed locally.

For long or risky work, keep a small decision trail:

```text
time | phase | decision | why | evidence | result
```

Use evidence such as a commit SHA, PR, file line, command output, screenshot, database row, deployment URL, or Slack timestamp.

## Repo-Specific Notes

### Mom Walk Flutter

- Follow BLoC, use case, repository, data source, and DI patterns.
- Keep widgets declarative.
- Put business rules outside widgets unless the change is tiny.
- Add focused tests for user-visible workflow changes.
- Bump the build number after any uploaded TestFlight or Apple build.

### Mom Walk Web And Lovable

- Preserve Supabase contracts and RLS assumptions.
- Keep generated docs concise and current.
- For TanStack Start on Vercel, verify the production-shaped build.
- Commit lockfiles when deployment depends on exact package resolution.

### Echelon

- Treat Echelon as the control plane.
- Keep signal intake, approvals, audit, feedback, and routing explicit.
- Use typed statuses and idempotent inserts.
- Do not put secrets in signal payloads.
- Do not ack agent work as done until feedback or delivery is recorded.

### edge-bot And Railway Agents

- Treat git as deploy truth.
- Treat `/app/.openclaw/workspace` as runtime state, not source control.
- Do not claim a Railway patch is deployed unless it is committed, pushed, rebuilt, and verified live.
- Check Slack and SMS delivery paths end to end.
- Fail closed when required delivery or approval context is missing.

### Forecast Flex And Media Planning

- Forecast Flex owns ad platform credentials, policy validation, caps, audit rows, and execution.
- Agents may recommend or request budget changes.
- Agents must not mutate Meta, Google, or other ad platforms directly.
- Echelon should record approval and feedback around each requested change.

## How To Use This In Project Repos

Place a copy of this file in each active project as:

```text
docs/AGENT-BEST-PRACTICES.md
```

Add a short link from the repo README or local agent instructions.

For Lovable tasks, paste the relevant section into the task prompt and include:

- The work type.
- The done proof.
- The files or systems likely involved.
- Any explicit constraints.

For Codex or Cursor tasks, reference this file and the ticket ID.

## Attribution

This guide adapts workflow ideas from pstack and combines them with TGA engineering rules. Keep pstack attribution and license notices when copying original pstack material.
