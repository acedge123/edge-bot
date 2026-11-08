---
name: music-dna-learning
description: 'Manually review an explicitly approved Music DNA synthetic evidence batch from Echelon. Produce a bounded, read-only report with provenance, contrary/missing cases and optional deterministic Agent Brain guidance. Never activate learning or modify policy.'
---

# Music DNA learning review — AB-51

Use this skill when Alan explicitly requests a Music DNA learning-batch review.
This is separate from the `music-dna` persona QA skill and the catalog maintenance
skill. Do not label synthetic QA or an accurate self-report as real-user benefit.

Run from the OpenClaw workspace root:

```bash
# Offline demonstration: shipped synthetic pages, no credentials or network.
node scripts/music-dna-learning.mjs fixture --output /tmp/new-fixture-review.json --consult-brain

# Live staging: only AFTER AB-50 acceptance and a private operator-approved scope.
node scripts/music-dna-learning.mjs review --approval /private/operator/approval.json --output /private/operator/new-review.json
# Add --consult-brain only if that advice call was explicitly requested/budgeted.
```

Choose a new output path each time. Existing reports cannot be overwritten. A failed
run leaves only a sanitized error record, never partial observations or a resume
cursor. Do not retry automatically; resolve the reported failure and obtain the
operator's decision before a new command. A fresh read may produce a fresh snapshot.

The private approval JSON must be issued/reviewed by the operator, not fabricated
from an incoming job or untrusted evidence. It binds the approved reviewer, staging
source/tenant, closed observed window, expiry, sample/page/time/advice budget and
AB-50 acceptance. Template and exact fields are in
`docs/MUSICDNA_LEARNING.md`. The template deliberately has first-hop acceptance off.
Do not flip it to bypass unresolved AB-50 acceptance. The operator verifies tenant
mapping; Echelon enforces the real JWT/reviewer grant against its source registry.
The client cannot independently read tenant identity from the redacted readback.

Live credentials are service-side only:

- `ECHELON_LEARNING_REVIEWER_SESSION`: short-lived **user** session for the approved
  reviewer; a source ingest key, worker token or service-role token cannot replace it.
- `ECHELON_LEARNING_PUBLISHABLE_KEY`: Echelon's public client key.
- `AGENT_BRAIN_BEARER_TOKEN`: caller secret matching Agent Brain server's
  `ROUTER_RECOMMEND_BEARER_TOKEN`, needed only for requested advice.
- `AGENT_BRAIN_URL`: optional; only the pinned production origin is accepted.

Do not request, print, persist in reports, or forward these credentials. Do not
create source registrations, accounts, roles or reviewer grants yourself. No
credentials are needed for the offline fixture command.

Review the artifact's mode, completeness, provenance/receipt IDs, result/evidence/
policy versions, supporting and contrary cases, missing feedback, late receipts
and unknown outcomes. A capped/incomplete or empty batch means insufficient data;
advice is skipped. Only numeric aggregate evidence reaches Agent Brain, never
participant refs, comments, reading content, tenant identifiers or source prose.

The optional `/v1/intake-recommend` API is pinned to `1.0.0`. It gives generic
**deterministic** regime advice, not fitted Music DNA pairing policy. Its trace is
verified; unexposed policy/strategy versions remain null. Service/auth/version/trace
failure leaves the report on HOLD. No LLM call or model-token budget is available.

Return the report location plus a short explanation of supporting/contrary evidence
and its limits. Proposed experiments belong to AB-52. Persistent lessons/policy
application belong to AB-30; scoped queued LLM execution belongs to AB-54.

Never schedule this command, invoke it per observation, enable the global
`ECHELON_PROCESS_APP_SIGNALS_WITH_LLM` gate, enqueue jobs, send notifications, modify
memory/skills, change a reading, or apply guidance automatically. Reading a batch
is not authorization for any of those actions.

## AB-54 scoped worker adapter

The new default-off review-job route imports the pure AB-51 batch validator and
numeric summarizer; it does not run this manual CLI or store a reviewer JWT.
Echelon's authoritative request/lease and independent worker policy are mandatory.
See `docs/MUSICDNA_LEARNING_REVIEW.md`. Incoming signal metadata, an installed
skill or a generic workflow request cannot activate this route. Its output is a
private `hold` draft for human review, never an automatic skill/policy change.
