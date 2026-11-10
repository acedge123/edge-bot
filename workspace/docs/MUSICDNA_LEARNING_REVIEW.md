# AB-54 scoped draft review

Delivery milestone: **one manual batch -> one draft -> Alan's review**. The worker
implementation is prepared; no AB-54 deployment, activation or paid canary is
claimed. Reuse the existing OpenAI key, as approved by Alan on November 8, 2026.

Canonical operator runbook and Lovable deployment handoff live in Echelon:
`docs/musicdna/learning-review.md` and `docs/musicdna/lovable-ab54-handoff.md`.
The paired branch is `The-Gig-Agency/echelon-control:codex/ab-54-learning-review`.
Apply its migration and deploy its claim/ack guards and two review endpoints before
this worker is deployed. Do not activate while either half is missing.

## Small execution boundary

The existing worker claims jobs with `musicdna-learning-review-job.v1` capability.
Candidate markers select `music-dna-review-job.mjs`, but only Echelon's private
review row, current reviewer authority, approved source/tenant/environment/purpose,
worker binding and lease authorize execution. Forged markers cannot invoke a model.
The generic worker model/Slack/SMS/session/ack paths are never used for a review.

The actual AB-51 helper `summarizeFrozenLearningPage` validates the closed redacted
batch and builds numeric aggregates. One authenticated deterministic Brain v1.0.0
call provides generic regime/confidence. This is not AB-52's pinned domain scorer.
One synchronous direct OpenAI `/v1/chat/completions` call produces only a draft
hypothesis and limitations. No agent bootstrap, transcripts, tools, memory/skill
writes, approval, policy changes or messaging occur. The normal gateway agent path
can contain internal model turns/tools and cannot guarantee this one-turn bound.
Global model tiers and ordinary job behavior are unchanged.

## Independent gates and bounds

- Echelon AND EdgeBot: `ECHELON_MUSICDNA_LEARNING_REVIEW_ENABLED=1`, independently
  configured. Absent/any other value is off.
- EdgeBot: `ECHELON_MUSICDNA_LEARNING_REVIEW_SOURCE_IDS` contains only explicitly
  approved source UUIDs. Empty by default.
- Echelon: an operator-owned private review scope binds requester, worker, source,
  tenant, staging, policy/model snapshot, verified prices, evidence minimum and
  budget/expiry. No rows are seeded. Current reviewer/lifecycle authority required.
- **Keep `ECHELON_PROCESS_APP_SIGNALS_WITH_LLM=false`.** No schedule/heartbeat changes.

Hard maxima: 20 synthetic receipts/one closed page, 8192 input bytes, 2048 output
tokens, 60s local execution, 30s provider timeout, 90s lease, one active source job,
no inference retries, five jobs/day, USD0.05/job and USD0.50/day. Scope settings may
be smaller. Model access, supported pinned model ID and current official prices
must be verified before an owner-authorized live canary; gateway aliases are not
proof of direct OpenAI access. The cost ceiling covers this route, not other users
of the shared key. Unknown usage retains its reservation; known usage records a
price-based estimate rather than asserting a provider billing receipt.

Quota/rate/timeout failures feed the existing persistent provider circuit breaker.
Permission is reserved once before HTTP. A crash/timeout never automatically repeats
inference. Only an identical completion receipt may retry once after transport
failure; unresolved completion is logged `completion_unconfirmed`.

## Verification and rollback

Source tests cover off/forged/wrong-scope/real-data/incomplete/duplicate/injected
batches, price/spend bounds, provider failures, wrong served model, output truncation,
receipt ambiguity and kill. Full worker/tool regression and cost-control checks
remain required. Native Echelon tests exercise permissions, atomic claims/replay,
lease binding, revocation, unknown attempt expiry and withdrawal of finished drafts.

A future single live canary must record serving image/mounted code hashes, actual
source/tenant/environment/policy/model, provider request/Brain trace, input/output
usage, estimated cost, latency, draft and rollback evidence. Fixture passes cannot
substitute for that receipt. Reuse prior AB-51 manual smoke unless its boundary
changed. Do not repeat the entire synthetic pipeline to prove unrelated UI edits.

Disable the Echelon scoped flag/scope and the worker flag/allowlist to stop new
attempts. An already permitted/in-flight call cannot be uncalled; completion
rechecks gates and suppresses its draft. Withdrawal clears private draft/evidence
links. Preserve claim/ack guards while review records exist; no generic ack fallback
may mark a review done. Ordinary deterministic signals remain unchanged.

The first owner-approved canary failed at its OpenAI request and was fully rolled
back. See `MUSICDNA_AB54_CANARY_2026-11-08.md`. The reporting patch logs only bounded,
allowlisted provider failure metadata (HTTP status, code/type/parameter, request ID)
to distinguish request/access/quota/rate/transport failures without raw error text.
It does not authorize or perform a retry; current production behavior is unchanged
until a separately authorized deployment.


## AB-57 real QA

The owner authorized moving testing to real Music DNA feedback on November 9, 2026. The server-authorized review adapter also accepts the narrowly allowlisted `music-dna` / `production` path with `learning-observation.v2`, `real-qa.v1` and `consented_qa`. Production QA rejects synthetic or mixed receipts. The existing manual staging CLI remains synthetic-only.

Only numeric feedback aggregates and an explicit evidence-class label reach the model/Agent Brain. Multiple feedback events may belong to one tester. They do not prove independent listener benefit or causal improvement. Existing per-job/daily limits, fresh pricing, source/reviewer/worker bindings, circuit breaker, one-call/no-tools/no-inference-retry behavior and human draft approval remain unchanged. No global app-signal LLM flag, cron, heartbeat, autonomous work or memory writes are enabled by this patch.

Deploy this adapter before setting the existing review flag and allowlisting the new approved production source. Default to manual requests pending an owner-approved recurring schedule and daily cap. No new live synthetic demonstration is required.
