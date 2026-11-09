# AB-54 provider retest — November 8, 2026

**Historical provider diagnostic stage.** The fix was subsequently merged/deployed and the full coordinated review completed. See [AB-54 final acceptance and actual generated draft](MUSICDNA_AB54_ACCEPTANCE_2026-11-08.md). The probe below alone was not the acceptance job.

Owner requested a retest after merging PRs #20 and Music DNA #25. Verification completed before **18:21:50 UTC**. Reused EdgeBot's existing runtime `OPENAI_API_KEY`; no key was read into chat, transferred, replaced or rotated.

## Reproduced request failure

Railway was still serving deployment `a3749bcb-28fa-4cdb-9c72-bd0a40280301`, the prior worker image. The mounted worker/helper hashes were `8aae5815739e02e7f969ee36d9702a1e1b199cafdf211eb7a894d050c815f22a` and `0c0fd2c38f42738f78f374306014f3e778089e1fc42075a2f9eb138b6088b34a`; PR #20's diagnostics were not deployed. Merging this CLI-deployed repository does not by itself update Railway.

A bounded synthetic request from that runtime reproduced **HTTP 400**, type `invalid_request_error`, parameter `tool_choice`. The provider rejected the combination of `tool_choice: "none"` with no `tools` field. Request ID: `req_cd96cdf19d47420b9b4b713aea01f865`; latency 1,126 ms. No raw provider message/body was retained. Usage/cost for the rejected request were unavailable, not asserted zero. This establishes the currently reproducible payload defect; the original canary's discarded error cannot be recovered retroactively.

## Corrected compatibility probe

Removed only the unnecessary `tool_choice` option and repeated the standalone synthetic provider probe, using the same runtime/key, endpoint, pinned model and JSON schema. [Official OpenAI documentation](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) documents that no tools is the default when tools are absent.

- Endpoint: OpenAI Chat Completions; model `gpt-4o-mini-2024-07-18` (preserved, no migration).
- HTTP **200**; request ID `req_adf2aa0ffad34e2d9c2f2f35be8cbe67`; latency **2,783 ms**.
- Valid strict-schema hypothesis/limitations JSON; finish reason `stop`; **0 tool calls**.
- Usage: **85 input + 61 output = 146 tokens**.
- Conservative pre-request ceiling: **1,787 micro-USD ($0.001787)**, below the owner's $0.05 retest cap. Successful-call estimate using the [verified model rates](https://developers.openai.com/api/docs/models/gpt-4o-mini), $0.15/$0.60 per million input/output tokens: **50 micro-USD ($0.000050), rounded up**. This is an estimate, not a billing receipt.

There were two explicit diagnostic HTTP attempts, one rejected and one successful; no automatic retry. The successful probe proves runtime network/key/model/structured-output compatibility. It did **not** create or finish an Echelon review job, execute Agent Brain, consume live evidence, deploy new code or verify the full coordinator/worker/receiver workflow. The production worker file remained unchanged during the probe.

## Fix and next step

The worker now omits `tool_choice` when it supplies no tools. Its test transport rejects the exact invalid combination that previous mocks accepted. The existing strict output validation, spend bounds, single inference, provider diagnostics and all gates remain unchanged. Full script/tool regression: **208 passed**; focused review/diagnostics: **36 passed**; cost invariants passed.

Review/merge this fix, then deploy the combined merged worker to the existing Railway service with reviews off. Verify serving image plus mounted code hashes before a separately scoped full AB-54 acceptance job. Do not reopen the prior expired/withdrawn scope or retry the original terminal job. Both `ECHELON_MUSICDNA_LEARNING_REVIEW_ENABLED` and global signal LLM remained off; source allowlist remained empty. No credentials, environment settings, schedules, database records or runtime files changed during this retest.
