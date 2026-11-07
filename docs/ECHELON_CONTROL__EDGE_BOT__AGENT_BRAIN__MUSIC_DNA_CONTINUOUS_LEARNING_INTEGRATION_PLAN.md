# Unified Continuous-Learning Integration Plan — The-Gig-Agency/echelon-control + acedge123/edge-bot + The-Gig-Agency/agent-brain + acedge123/music-dna

**Status:** Proposed cross-repository implementation plan; no code changes authorized by this document.
**Date:** 2026-11-06 (America/Los_Angeles)
**Canonical file:** `docs/ECHELON_CONTROL__EDGE_BOT__AGENT_BRAIN__MUSIC_DNA_CONTINUOUS_LEARNING_INTEGRATION_PLAN.md`
**Copies:** The same content is installed in all four repositories. Do not let the copies drift; update them together (prefer a future generated sync/checksum process).
**Owners:** ACE for product direction and approval; coding agents may implement bounded work in separate reviewed PRs.
**Sources reviewed:** Repository code and documentation on each default branch; deployment/configuration and production data were **not** verified.

## Executive decision

The four repositories are complementary, not substitutes:

1. **Music DNA**: user-facing music preference experiment, server-authoritative choices/reactions/feedback, real-time LLM commentary (Lovable or direct OpenAI). Keep the existing recommendation and evidence paths intact.
2. **Echelon Control**: authenticated source onboarding, ingest/dedupe/routing of app signals, durable operational signal/feedback records, approvals, agent-job queue.
3. **EdgeBot / OpenClaw**: asynchronous analyst/orchestrator using Echelon jobs, approved tools, relational/narrative memory (Agent Vault), and versioned skills.
4. **Agent Brain**: deterministic terrain assessment/search-regime recommendation, strategy/parameter guidance, counter-regime checks and replay evaluations. It currently **routes strategies; it does not fit a production ML model or learn automatically from outcomes**.

**Target loop:** domain decision → eligible evidence event → Echelon signal/evidence → EdgeBot analysis → Agent Brain strategy choice (when useful) → hypothesis + proposed experiment → measured outcome → evaluation → human-approved lesson/skill/policy change → canary → new domain decision. No automatic promotion from a single anecdote.

**First proving ground:** Music DNA's existing six-round diagnostic and its local Agent Brain shadow router; test *cross-session diagnostic quality*, not a hypothetical unlimited personalized music feed. Keep Guild/media buying as a second, slower-outcome validation lane.

## Evidence from current code (verified statically)

| Repo | Confirmed | Incomplete / verify |
| --- | --- | --- |
| `acedge123/music-dna` | `src/musicdna/router/*` includes a local deterministic router and pairing knobs; `docs/musicdna/agent-brain-integration-plan.md` documents `regime_recommended`, shadow picks, `event_log`, `result_feedback`, and an opt-in live-mode gate. `src/musicdna/adapters/llm-gateway.ts` supports Lovable AI and direct OpenAI. | No reviewed sender that forwards eligible learning outcomes to Echelon. Shadow metrics and volume need a live readback. Local copied scoring may drift from Agent Brain's service. Existing six-round UX restricts learning opportunities per user. |
| `The-Gig-Agency/echelon-control` | `app-signal-inbound` authenticates/normalizes/dedupes and can queue agent jobs. `app-signal-feedback` records operational agent results and approvals. Sender guide documents source-scoped ingest keys. | Signal types currently emphasize operational incidents/workflows; `app_signal_feedback` is **not** a joined recommendation/business-outcome learning dataset. Learning signals need explicit routing, retention, and privacy policy. Current guide lists `mom-walk`, `tga-analytics`, `listing-cred`, `tga-media-planning`, not Music DNA. |
| `acedge123/edge-bot` | Echelon worker polls/acks jobs; OpenClaw skills and persistent Agent Vault learning schema exist. `workspace/skills/agent-brain-router/SKILL.md` defines intended Agent Brain HTTP calls. | The referenced `workspace/scripts/agent-brain-router.mjs` was absent from the reviewed tree. App-signal model processing is off by default (`ECHELON_PROCESS_APP_SIGNALS_WITH_LLM=false`). Agent Vault stores approved/draft records, but no evidenced outcome-eval → skill promotion pipeline. `workspace/AGENTS.md` explicitly disables automatic background memory/cron until deliberately changed. |
| `The-Gig-Agency/agent-brain` | Internal `/v1/recommend` and `/v1/intake-recommend`; repeatable replay evals; domain adapter under `src/cognitive-router/integrations/musicdna/`; recommendation/outcome event **schema** and validation. | Production event persistence, later-outcome joins, calibration/training, and approved policy promotion are not established. Strategy families are not equivalent to executing corresponding ML algorithms. |

**Important scope limits:** Static review does not demonstrate that a Railway service is reachable, an Echelon source is registered, credentials exist, queues are operating, or real users have sufficient feedback volume. Documented plans are not production evidence. Also verify that tracked `.env` files in Music DNA and Echelon contain no live credentials; do not copy their contents into tickets or logs.

## Contract A — Domain evidence (Music DNA first)

Create an **allowlisted server-side exporter**, not a browser-authored learning verdict. Respect `music-dna/AGENTS.md`: choices commit atomically, server-only evidence events, `buildLedger` / `evaluateClaim` remain authoritative, result versions are immutable, public sharing requires consent, and V1 API rollout stays gated.

Suggested minimal redacted schema (version it, don't silently replace existing event payloads):

```json
{
  "schema_version": "learning-observation.v1",
  "event_id": "uuid",
  "domain": "music_dna",
  "tenant_or_source": "registered_source_key",
  "correlation_id": "stable_unique_id",
  "observed_at": "ISO-8601",
  "subject_ref": "pseudonymous_session_ref",
  "decision_ref": "pairing_or_result_version_ref",
  "strategy": {"id": "legacy_or_agent_brain", "version": "pinned_version", "variant": "control_or_treatment"},
  "action": {"kind": "pairing_shown_or_reading", "opaque_ref": "id"},
  "outcome": {"kind": "choice_skip_reaction_or_final_feedback", "value": "minimal_allowed_signal"},
  "measurement_window": {"start": "ISO-8601", "end": "ISO-8601"},
  "provenance": {"source_event_ids": ["ids"], "evidence_version": "version"},
  "privacy": {"consent_basis": "approved_purpose", "redacted": true}
}
```

Rules:
- Export only fields necessary for evaluation. No raw songs-as-personal-profile, chat transcripts, auth tokens, unconsented identifying data, or raw proprietary customer content.
- A *song choice* is not automatically a validated quality outcome. Prefer explicit interpretation feedback, skips, satisfaction, and repeat-session evidence; predefine metrics and their limitations.
- Use durable outbox/retry/idempotency when control-grade signals matter; Music DNA's shadow fire-and-forget `event_log` is acceptable only for exploratory diagnostics, **not** sole authoritative outcome evidence.
- Never alter the session scoring, evidence gates, pairing invariants, stop logic, or critic voice just to wire learning telemetry.

## Contract B — Echelon signal and learning routing

Use existing `app-signal-inbound` / approved source-onboarding mechanisms; do **not** bypass source authorization or tenant scoping. Existing allowed types include `workflow` and `ops`: initially use a `workflow` type with `metadata.purpose = "learning_observation"`, or introduce a deliberately versioned `learning_observation` type with validation and migration. Do not pretend the old allowed-type list accepts new types.

- Register Music DNA as a distinct Echelon source with a source-scoped `esk_` ingest key stored **server-side** in the sender.
- Carry `observation_id`, `decision_ref`, `strategy_version`, `outcome_ref` and a safe evidence locator; preserve stable `correlation_id` and dedupe behavior.
- Add **learning routing** separate from operational remediation: routine evidence should persist without creating an LLM job for every vote; aggregate by complete sessions/cohorts/windows.
- Implement an approved `learning_review_candidate` queue trigger after a minimum sample or scheduled readout. Explicitly opt in to model processing **for that bounded route only**; preserve `ECHELON_PROCESS_APP_SIGNALS_WITH_LLM=false` by default for other signals.
- Keep existing app-signal incident feedback (fixed/mitigated/etc.) distinct from business outcome events and learning-evaluation decisions. Join them by trace/reference where relevant; do not overload one status to mean everything.
- Enforce source/tenant isolation, redaction, retention limits, duplication checks, and approval gates for external effects.

## Contract C — EdgeBot ↔ Agent Brain and learning records

First repair/verify the documented HTTP adapter. `workspace/skills/agent-brain-router/SKILL.md` references `scripts/agent-brain-router.mjs`, which was not in the reviewed repository tree. Implement it or correct the skill to the real existing tool path, with:
- `AGENT_BRAIN_URL`, `AGENT_BRAIN_BEARER_TOKEN` kept in secret configuration, never Git.
- Bounded request body, timeout, non-secret logs, trace propagation, clear 401/503 handling, no retry storm, deterministic tests.
- Clear distinction between **regime selection** and *execution* of a chosen statistical/ML learner. Agent Brain currently provides the former.
- Document and test the difference between Music DNA's **local mirrored router** and the Agent Brain **hosted service**. Pin strategy version; in V1, avoid adding a live network dependency to every pairing.

Define `LearningRecord.v1` as a separate review artifact (not simply an `agent_learnings` free-text note):

```json
{
  "learning_id": "uuid",
  "domain": "music_dna",
  "tenant_id": "authorized_tenant",
  "hypothesis": "under specified conditions, A beats baseline B",
  "context_and_applicability": ["explicit_conditions"],
  "supporting_evidence_refs": ["refs"],
  "contradicting_evidence_refs": ["refs"],
  "sample_and_exposure": {"n": 0, "window": "time_window", "assignment": "random_or_observational"},
  "metrics": {"primary": "predeclared_metric", "guardrails": ["metrics"]},
  "uncertainty": {"confidence_or_interval": "calibrated_method", "limitations": ["caveats"]},
  "candidate_change": {"type": "prompt_or_skill_or_router_weight_or_pairing_knob", "artifact_ref": "versioned_ref"},
  "evaluation": {"baseline_ref": "immutable_ref", "holdout_ref": "immutable_ref", "result": "pending"},
  "approval": {"status": "draft", "approved_by": null, "approved_at": null},
  "rollout": {"status": "not_deployed", "rollback_ref": null}
}
```

States: `observed → hypothesis_draft → evaluation_pending → rejected | human_review → approved → canary → deployed → deprecated/rolled_back`. Store evidence provenance and state transitions append-only. Agent Vault may hold a human-readable synopsis and references; GitHub stores approved versioned skills/rules/PRs. Do **not** overwrite an approved lesson just because a new run disagrees; supersede with provenance.

## Phase 1 — Instrument and connect (first cross-repo milestone)

**Goal:** One end-to-end redacted Music DNA session/outcome reaches Echelon with reliable IDs and audit evidence, without changing a user's experience.

| Repo | Tasks | Acceptance |
| --- | --- | --- |
| Music DNA | Confirm current `event_log` + `result_feedback` semantics, extract approved session-level evidence, implement opt-in server sender with outbox/retries/dedupe; preserve immutable result version/atomic vote. | Golden session fixture maps to exact v1 evidence contract; no PII/secrets in emitted event; disabled flag leaves experience identical. |
| Echelon | Register authorized `music-dna` source; add validated learning-purpose route/metadata, persistent ingest receipt, correlation IDs and read-only admin visibility. | Duplicate delivery returns same logical receipt; wrong source/key rejected; learning evidence does not create unbounded agent jobs or approval spam. |
| EdgeBot | No new autonomous work yet; add read-only smoke skill/script to retrieve and summarize one authorized learning batch. | Can report provenance of one batch without editing any skill or memory. |
| Agent Brain | Publish pinned version/schema for regime/strategy and measurement guidance; no automatic tuning. | Offline test confirms field mappings, compatibility, and stable output. |

**Gate to Phase 2:** Trace a sample from a Music DNA decision → database event → Echelon receipt → approved EdgeBot readout, including deliberate duplicate delivery, missing outcomes, and tenant access denial.

## Phase 2 — Run a controlled learning experiment

**Goal:** Show that an Agent Brain-guided pairing policy improves a predeclared Music DNA diagnostic outcome versus the unchanged legacy policy.

1. Audit shadow-routing logs and sample size before changing `MUSICDNA_ROUTING_MODE`; do not assume the design document's historical shadow status is current production status.
2. Run an offline comparison on existing six-round sessions. Analyze whether counterfactual picks are actually comparable; *shadow disagreement alone cannot prove better outcomes*.
3. After reviewed consent/rollout gates, randomize **eligible sessions**, not per-click changes mid-session, into pinned legacy/control and limited adaptive treatment cohorts. Respect the existing `MUSICDNA_ROUTING_MODE=shadow` default and make canary opt-in.
4. Predeclare primary metric (for example, explicit final-reading agreement after six rounds) and guardrails (skips, completion, artist diversity, error rate, latency, cost). Report sample sizes and uncertainty; avoid treating user taste as a single objective truth.
5. Have EdgeBot run a bounded human-triggered or explicitly approved batch analysis; use Agent Brain to recommend explore/prune/compound and **propose** parameter changes. Compare to a simple baseline and holdout.
6. Produce a `LearningRecord.v1`, an evaluator report, a candidate PR (or patch proposal), a rollback plan, and a human decision. Do not merge automatically.

**Gate to Phase 3:** An independently reviewed result shows a reproducible improvement or a credible negative/null finding, with complete provenance. A negative result is useful learning; it should not be disguised as success.

## Phase 3 — Governed EdgeBot organizational learning

**Goal:** EdgeBot can discover a candidate pattern, form a testable hypothesis, request the right learning approach from Agent Brain, evaluate evidence, and propose a skill/policy update **with human approval by default**.

Design a bounded EdgeBot `learning-review` skill/workflow with these steps:

1. **Trigger**: authorized Echelon cohort/window signal or human request, with tenant, domain, dataset and budget caps.
2. **Observe**: load relevant redacted observations plus contradictory cases; reject insufficient/biased or stale data.
3. **Hypothesize**: explicitly state anticipated benefit, applicability, confounders, counter-hypothesis, and failure conditions.
4. **Route**: call Agent Brain for an appropriate *learning/search approach*; distinguish A/B experimentation, contextual bandits, Bayesian modeling, case-based judgment, and pure qualitative review. If it only provides regime labels, don't claim an ML model was trained.
5. **Evaluate**: compare pinned control vs treatment on a holdout or defensible observational design; show uncertainty, cost, fairness/coverage, contamination, and failure modes.
6. **Propose**: draft `LearningRecord.v1` and a specific versioned change to a named skill, prompt, router weight, or pairing parameter; include expected effect and rollback.
7. **Approve**: human reviews evidence and signs off on any persistent behavior-changing merge/deploy. Low-confidence patterns remain draft memory.
8. **Canary + monitor**: deploy a bounded change, observe new outcomes, and roll back on guardrail regression. Retire superseded lessons explicitly.
9. **Share**: publish only approved, properly redacted, tenant-permitted generalized lessons into authorized agents' retrieval scope. Do not share client-specific information across customers by default.

**Critical runtime policy:** `edge-bot/workspace/AGENTS.md` currently disables recurring heartbeats, cron, autonomous background work and automatic memory-writing. Phase 3 must **not** turn these on incidentally. Obtain explicit owner approval and review `workspace/docs/OPENCLAW_COST_GUARDRAILS.md` before modifying those behaviors. Initial Phase 3 can run on a human-triggered batch.

## Operational safety and ownership

- No new raw-data sharing or cross-tenant generalized learning absent approval, lawful basis and privacy review. Pseudonyms alone are not sufficient if individual behavior remains linkable.
- No automatic skill edits, prompt changes, production writes, payments or deployment from unvalidated learning. Route through existing Echelon approval and GitHub review.
- Separate `memory of facts`, `hypotheses`, and `approved procedures`. Confidence values must refer to a specified, defensible measurement method.
- Idempotent producer, event ingest, worker and outcome writes. Distinguish observed `unknown` from failure; retain event and policy version to reproduce a decision.
- Evaluate on unseen data and avoid benchmark leakage; keep the Agent Brain frozen evaluation lanes immutable.
- Minimize token and network spend. Aggregate low-level events; rate limit LLM calls. Use a circuit breaker and explicit retry policy.
- **Repository hygiene:** Inspect tracked `.env` files in Music DNA and Echelon for secrets without exposing their contents in logs; rotate any real credentials found. These files are visible in repository trees.
- Music DNA is deployed from its own repo and uses a server-only LLM adapter. Do not route every latency-sensitive music interaction through EdgeBot.
- Treat Agent Vault as an additional service dependency: the memory API described in EdgeBot docs is not the same as Echelon's `app_signal_feedback` endpoint. Verify ownership, permissions and source-of-truth before building glue.

## Definition of done and agent handoff

A coding agent should create small, reviewable PRs, one concern per repo, with:
- Data-flow/sequence diagram and schema fixtures.
- Tests for idempotency, malformed payloads, missing outcomes, source isolation, opt-out, rollback and old clients.
- Pre- and post-change behavior evidence; no user-facing Music DNA regression.
- Deployment steps, secret names (never secret values), monitoring/alert plan, cost ceilings.
- Exact commit SHAs and links for any multi-repo contract version changes.
- A **cross-repo smoke test** run at the end of each phase; a unit test in one repo is insufficient.
- Explicit list of remaining blocked items and owner decisions (consent, metrics, gating, cron authorization, production rollout).

### Suggested PR order

1. Music DNA: contract + server-side evidence exporter behind a disabled flag.
2. Echelon: source onboarding + learning-purpose ingestion/receipt and batch read endpoint.
3. EdgeBot: repair Agent Brain client; read-only Echelon learning batch skill (manual invocation).
4. Agent Brain: pin/music diagnostic recommendation and evaluation contract, reconcile local Music DNA router parity.
5. Integration: cross-repo test harness + staging evidence, then gated experiment.
6. EdgeBot: `learning-review` skill and approval/proposal pipeline (Phase 3 only).

**Avoid PRs that simultaneously introduce a live routing change, new telemetry, automatic memory writes and autonomous scheduling.** They are too difficult to evaluate and roll back.

## Relevant repository reference paths

- Music DNA: `AGENTS.md`, `docs/musicdna/agent-brain-integration-plan.md`, `docs/musicdna/instrumentation.md`, `src/musicdna/router/`, `src/musicdna/adapters/llm-gateway.ts`, `src/routes/api/v1/session.$id.feedback.ts`.
- Echelon: `AGENTS.md`, `docs/APP-SIGNAL-SENDER-GUIDE.md`, `supabase/functions/app-signal-inbound/index.ts`, `supabase/functions/app-signal-feedback/index.ts`, `supabase/functions/_shared/app-signal-helpers.ts`.
- EdgeBot: `workspace/AGENTS.md`, `workspace/skills/agent-brain-router/SKILL.md`, `workspace/skills/agent-learnings/SKILL.md`, `docs/AGENT_LEARNINGS_SCHEMA.md`, `workspace/scripts/echelon-agent-worker.mjs`, `workspace/scripts/echelon-app-signal-policy.mjs`, `workspace/docs/OPENCLAW_COST_GUARDRAILS.md`.
- Agent Brain: `README.md`, `src/server/`, `src/cognitive-router/scoring.ts`, `src/cognitive-router/outcome-events-v1.ts`, `src/cognitive-router/integrations/musicdna/`, `project-brain/echelon/canonical-claims-and-frozen-lanes-v0.1.md`.

**One-line product test:** A later recommendation must improve because of a prior, traceable and evaluated result—not merely because an agent stored a memory.
