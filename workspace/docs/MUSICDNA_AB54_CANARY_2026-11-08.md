# AB-54 controlled synthetic review — November 8, 2026

**Historical initial attempt:** failed at the provider request; no draft produced in this attempt.

**Final status: AB-54 is Done.** The corrected full review completed later on November 8. See [the successful draft and measured acceptance receipt](MUSICDNA_AB54_ACCEPTANCE_2026-11-08.md). The failed attempt below and its retained reservation remain part of the audit history.
This was one owner-approved synthetic review with a USD0.05 ceiling. No real-user
learning, global signal LLM processing, policy application or automatic retry was
permitted or enabled.

## Evidence

- Echelon source: `music-dna-staging`, tenant `musicdna-acceptance`, staging.
- Source UUID: `197da0c2-8e93-4c90-ab93-1945398a474d`.
- Echelon backend reference: merged PR24, execution receipt commit `93c4f57`.
  Drizzle migration8 applied once; independent live hashes matched all eight
  recorded function bodies. Edge deployment version IDs remain unavailable.
- EdgeBot source: merged `84b1df4`; image
  `sha256:88517c6fee00a5ec92272bf9b67e1c97bc3042817032d5bf134cf437a013a502`.
- Canary settings deployment: `d4108963-bb71-4e4a-8cfa-cff069ad15aa`.
- Review policy: `ab54-synthetic-canary.v1`; pinned model
  `gpt-4o-mini-2024-07-18`. Its read-only model metadata request returned200.
  This deprecated snapshot was used only for this bounded compatibility canary,
  not selected as a new default model.
- Price reference checked: https://developers.openai.com/api/docs/models/gpt-4o-mini
  (USD0.15 input / USD0.60 output per million tokens). One-job scope: one receipt,
  4096 input bytes, 512 maximum output tokens, USD0.05 reservation/day and job,
  no automatic inference retry, 30-minute temporary authorization.
- Evidence was one fresh, validated **directly ingested synthetic contract fixture**,
  not a newly executed Music DNA user journey. Prior AB-51 sender proof was reused;
  capture and dispatch were not enabled or rerun. Ingest returned audit_only with
  null agent job/approval IDs.
- Observation: `8d137e6c-ef36-4092-9e80-34ae1a6f7eb5`.
- Receipt: `e99a7819-2411-4622-817c-4a089af16d22`.
- Review job: `afa65b13-6a4f-440e-8465-2e821c62f12e`.
- Authenticated request returned queued at `2026-11-08T17:27:06.468207Z`.
  Repeating the same request returned the **same job**, duplicate=true.
- Job recorded failed at `2026-11-08T17:27:10.461228Z`; normal authenticated read
  returned state=failed, not a successful analysis.
- Worker log at `2026-11-08T17:27:13.061683674Z` reported
  `review_provider_failed`, outbound provider attempts=1. Permit was reserved once.
- The deployed code discarded the HTTP status, provider error code and request ID.
  The specific cause therefore remains **unknown**: transport, request validation,
  access, rate limit or billing/quota cannot be distinguished from this receipt.
- Actual tokens, latency receipt and billed/estimated cost are unavailable/null,
  **not zero**. The full USD0.05 reservation remains retained conservatively.
  No second provider request, inference retry or job reset was performed.

## Cleanup and rollback verified

- Private review scope disabled; source enabled/learning_enabled both false.
- Original revoked/expired reviewer timestamps restored; normal read returned403.
- Withdrawal completed, purged one receipt, and removed draft/evidence links.
  No completed/pending reviews remain; the one failed job/audit row is retained.
- Temporary source key rotated/discarded through the normal admin API.
- Echelon's previously absent review setting deleted by Lovable at
  `2026-11-08T17:28:52Z`; subsequent normal request returned403 review_disabled.
- Both Railway scoped variables deleted. Deletion alone did not update the running
  container, so an explicit same-image restart completed as
  `a3749bcb-28fa-4cdb-9c72-bd0a40280301`. At `2026-11-08T17:34:20.648Z`, both
  variables were absent in runtime, global signal LLM=false, worker count1,
  internal gateway health200.
- Temporary operator session logged out locally (204) and removed. Local controller
  stopped; its access guard and synthetic fixture removed. No API keys were printed,
  transferred or rotated; only the isolated staging ingest credential was temporary.

## Follow-up

The companion source patch preserves only HTTP status, a closed allowlist of
provider error codes/types/parameters and a validated request ID. No raw error
message, response body, headers, credentials or evidence are logged. It distinguishes
quota exhaustion from transient rate limiting, and transport from HTTP failure.
Normal clients remain opted out. Request counts, gates, budgets and no-retry behavior
are unchanged. This reporting patch is not a fix for an unverified provider cause.

Review/merge the patch first. A separate owner decision is needed for deployment
and a fresh controlled attempt. Do not delete the failed record or change policy
versions to evade the retained daily reservation/deduplication. No efficacy or
production learning acceptance follows this failed canary.
