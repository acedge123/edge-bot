# Manual Music DNA learning review (AB-51)

The new `music-dna-learning` skill reads only explicitly approved, redacted synthetic
observations through Echelon's existing AB-48 endpoint, then writes one private JSON
review artifact. Its optional Agent Brain consultation uses aggregate counts through
the deterministic v1 intake endpoint. No model provider, database mutation, signal
job, Slack notification, memory/skill write or policy application is involved.

The client is ready for code review. Authenticated hosted Echelon → EdgeBot → Agent
Brain acceptance and production image-to-volume sync remain pending. A fixture or
localhost pass is not hosted acceptance. AB-50's unresolved deployment/account/
retention findings remain open; the caller cannot set its own acceptance/grants.

## Invoke the actual command

From the OpenClaw workspace (`workspace/` locally):

```bash
node scripts/music-dna-learning.mjs --help
node scripts/music-dna-learning.mjs fixture --output /tmp/new-review.json --consult-brain
```

`fixture` uses only shipped fake pages and a fake advice service; it never fetches
from the network, even if live variables exist. Its artifact says `offline_fixture`.
All fixture UUIDs/refs are fabricated, not copied from AB-50's private inventory.
Without `--consult-brain`, even the fake advice call is omitted.

For an accepted, separately approved live staging review:

```bash
node scripts/music-dna-learning.mjs review \
  --approval /private/operator/approval.json \
  --output /private/operator/new-review.json
# Add --consult-brain only for an explicitly requested/budgeted advice call.
```

The operator prepares a mode-0600 approval file outside Git. See
`skills/music-dna-learning/approval.example.json`; the example intentionally has
`approved=false`, `first_hop_accepted=false` and invalid identity/expiry placeholders.
It is not a grant. Bind it to the **verified** Echelon reviewer/source/tenant mapping,
AB-50 acceptance, a closed observed window (maximum 31 days), a future approval
expiry (at most 31 days away) and the reviewed budget. The local JWT claim check is
only a fail-fast scope check, not signature verification. Echelon verifies the
actual identity and grant against its source registry. Its redacted response does
not return tenant identity; independent operator mapping verification is required.
An approval file cannot replace server authorization or consent.

Only `music-dna-staging` / `staging` and `synthetic-pilot.v1` are accepted. Real data,
production sources, unknown fields, unapproved evidence and claimed observed outcomes
are rejected. AB-51 does not create grants, register sources or reopen AB-50 scopes.
Use a fresh explicitly approved synthetic result and an unexpired lifecycle window
for a later live smoke. A withdrawn subject must not be reused. If the terminal scope
has expired, stop and reconcile the approved lifecycle design under AB-49; do not
extend/recreate the used namespace just to make a demo pass.

The report file is created exclusively with 0600 permissions **before** any network
call. Existing paths fail without fetching. Failure records contain only a bounded
error code, not partial observations/cursors, response bodies or credentials. Source
read failure fails closed; unavailable advice preserves the evidence report on HOLD.
No automatic retry occurs (retry budget zero); a new human invocation may have a new
read snapshot and is not a hidden resume of the previous batch.

## Service-side configuration: names only

| Variable                            | Meaning                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ECHELON_LEARNING_REVIEWER_SESSION` | Short-lived user access JWT for the approved reviewer. Server grants still required. Never use source ingest, service-role or worker credentials. |
| `ECHELON_LEARNING_PUBLISHABLE_KEY`  | Echelon's publishable/anon client key for gateway access.                                                                                         |
| `AGENT_BRAIN_BEARER_TOKEN`          | EdgeBot caller token; same value as server's `ROUTER_RECOMMEND_BEARER_TOKEN`. Needed only for requested advice.                                   |
| `AGENT_BRAIN_URL`                   | Optional; pinned to `https://agent-brain-production-6956.up.railway.app`.                                                                         |

Echelon is pinned to `https://yczomejrvihbmydyraqg.supabase.co` and only its existing
`/functions/v1/musicdna-learning-read` endpoint. Credentials cannot follow redirects
or alternate origins. URLs are not derived from evidence or job text. Localhost is
supported by an explicit dependency-injection option in the generic Brain adapter
for tests, never by a production CLI environment bypass.

No credential is copied, generated or changed by this PR. Do not paste secrets into
chat, a report, a command argument, Git or a ticket. A permanent reviewer session or
refresh-token workflow is outside this manual first pilot.

## Limits and interpretation

- Maximum 10 pages / 100 receipts, page size 1–50, 60-second run and 5-second request;
  UTF-8 response cap 128 KiB/page. Cursor/snapshot/query limit must stay fixed. Repeated
  receipts/observation IDs, reordered rows, cursor cycles or snapshot drift fail closed.
- At most one explicitly approved advice call with a 512–4096-byte input ceiling.
  Model call/token budget is **zero**: the existing router uses deterministic code,
  so no estimated tokenizer count is misrepresented as provider token metering.
- Missing accuracy/rating, late receipts, unknown outcomes, pairing vs chat result
  versions and experiment tags remain separate. A tagged experiment is not an
  observed outcome. Empty/incomplete batches skip advice and say insufficient data.
- Receipt/observation IDs and exact version codes support provenance. Subject,
  decision, result and feedback pseudonymous refs are validated then excluded from
  reports/advice. No reading text, comments, user ID or opaque read cursor is saved.
- Advice is generic regime selection, not Music DNA pairing knobs, fitted policy or
  demonstrated improvement. The API is pinned to `1.0.0`; intake body trace is verified.
  Policy/strategy versions and serving source revision are not exposed by that API;
  they remain unverified/null instead of being invented from its schema version.
- Reports always HOLD for human review. They contain descriptive supporting/contrary
  cases, a hypothesis and next experiment step. AB-52 designs/evaluates the experiment;
  AB-30 governs lessons/application; AB-54 owns separately approved queued model work.

## AB-41 reconciliation and current runtime evidence

Checked November 7 Pacific / November 8 UTC using read-only Railway SSH:

- Repo main `9ab7a603c7ad5cf384e563c2a91f982043301766` contains the AB-41 skill but no
  `scripts/agent-brain-router.mjs`; recorded commit `9d90718` is unavailable in local
  history and GitHub returns 422 for that ref.
- The **mounted** EdgeBot workspace does contain the old client, SHA-256
  `6b1dea41ccca5a1d8b648e2fed1aee6002c46d1017d148e0bfdb5e3e43a52578`.
  Its bytes were recovered and checksum-verified after removing SSH PTY CRLF framing.
  The baked workspace lacks it. This was source/image drift, not proof the deployed
  client was absent. AB-51 restores its intake/recommend CLI and adds import safety,
  bounded input/HTTP, fixed origins, auth, version/trace checks and sanitized errors.
- The mounted and baked AB-41 skill hashes both equal
  `e764229dea7a32549dae93781343be1b9094404d519e47abc421bb86db8f3d18`.
- New learning helper is not yet in either deployed workspace. Presence after merge/
  image sync is not established by local source checks.
- EdgeBot runtime: correct `AGENT_BRAIN_URL` present; `AGENT_BRAIN_BEARER_TOKEN`
  absent; global app-signal LLM gate false. Service revision not exposed by env.
- Agent Brain runtime: server `ROUTER_RECOMMEND_BEARER_TOKEN` present, local bypass
  false (`/ready`), deployed revision `ef9b3b9e1b529637c80c614e4305a6bed51762df`.
  Health/readiness return 200; missing and deliberately wrong bearer requests return 401. No secret values were returned or transferred.
- Existing backend is the Lovable-managed Echelon project; current owner read-only
  report cannot inspect deployment inventories/bundles. Repository hashes and
  earlier deployment receipts are not current serving bundle verification. No
  approved disposable acceptance non-admin is available; another-tenant account's
  disposable-test authorization is unverified. Do not reset/impersonate that account.

## Verification and release sequence

```bash
node --test workspace/scripts/*.test.mjs tools/*.test.mjs
bash deploy/verify-cost-controls.sh
```

Tests include fake-service request/response boundaries, actual CLI output/overwrite/
permissions, and execution of the existing entrypoint's **real** seeding/sync block
against disposable fresh/existing mounted directories followed by actual fixture CLI
invocation. Durable memory sentinel is preserved. A separate local run called the
reviewed Agent Brain server code with a disposable test bearer and verified v1/trace.
These are local checks; no production source, data, credential, service or gate changed.

1. Review/merge this code PR; CI runs the existing tools plus new client/sync tests
   on Node 22. No runtime/entrypoint/Docker/config change or dependency install added.
2. Verify the existing EdgeBot image rollout, then hash the restored adapter, HTTP
   helper, learning CLI, skill, template and fixtures in baked **and** mounted paths.
   Execute `--help` and the offline fixture command from the mounted workspace.
   Compare against the merged tree; do not overwrite mounted files manually.
3. Resolve the caller token configuration through Railway's approved secret channel.
   No new token is needed if the current server secret is approved for this caller.
   Verify auth in the running container; variable presence alone is not a pass.
4. Close/approve AB-50's stated evidence limitations and authorize the exact temporary
   reviewer session/grant, source/window and fresh synthetic fixture for a bounded
   live batch. Keep export/global LLM/recurring workers off unless separately approved.
5. Record Echelon snapshot/receipt IDs → EdgeBot report → Agent Brain API/trace and
   provider deployment revisions. Revoke the temporary reviewer access afterwards.
   Preserve HOLD if evidence is insufficient; do not reopen a terminal scope.

AB-51 remains Under Review until hosted sync/authenticated smoke evidence is complete.
AB-54 may reuse this client but must add its own explicit scoped execution boundary;
no worker import, global switch or automatic per-observation work is added here.
