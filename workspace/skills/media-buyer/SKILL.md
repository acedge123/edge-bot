---
name: media-buyer
description: Generate pacing-aware optimization reports for Meta/Google campaigns using a Supabase-backed Pacing API (PACING_URL + AGENT_API_KEY). Includes guardrails and an /approve-style human-in-the-loop workflow.
---

# Media Buyer Skill (Meta + Google Ads)

## What this skill does
Given a **Scenario Name** (media plan) and a **Campaign Name** (and platform: Meta or Google), generate a **pacing-aware performance report** covering:
- last **24h** performance
- **7-day** trend rollups
- pacing vs plan
- diagnostic flags (learning phase, creative fatigue, CPL rising)
- a single primary recommendation (HOLD / SCALE +10% / REDUCE -10% / PAUSE), plus notes

It also supports **existing account review** mode: when the team shares account exports, screenshots, or additional performance data, or when the agent can pull Meta structure directly via the pacing-backed endpoints, the skill should provide operator feedback on:
- campaign structure and budget allocation
- creative mix and concept spacing
- audience strategy and exclusions
- measurement quality and signal hierarchy
- early-warning health metrics
- specific next actions for media buyers and the broader team
- structural audits using synced Meta account data (campaigns → ad sets → ads)

It is designed for **human-in-the-loop execution**: the agent produces recommendations first, then waits for explicit approval before taking any spend-changing action.

## Required environment variables (never hardcode)
- `PACING_URL` — base URL for pacing API (e.g. `https://<project>.supabase.co/functions/v1/pacing` or similar)
- `AGENT_API_KEY` — value for `x-api-key` header
- `AGENT_MEDIA_ANALYTICS_KEY` — bearer token for the event analytics edge function (`agent-analytics`)

### Event analytics endpoint
Use this live edge function to pull client-level event analytics:

- URL: `https://tmdhoerieupdpnrohjtf.supabase.co/functions/v1/agent-analytics`
- Auth header: `Authorization: Bearer ${AGENT_MEDIA_ANALYTICS_KEY}`
- Content-Type: `application/json`

Request forms:
- `POST` body:
```json
{ "client": "Guild Mortgage", "from": "2026-05-01", "to": "2026-06-11" }
```
- `GET` query:
```text
?client=Guild%20Mortgage&from=2026-05-01&to=2026-06-11
```

Notes:
- `client` matches tenant name or slug, case-insensitive.
- The current canonical Guild analytics tenant name is `Guild Mortgage`.
- If `from` / `to` are omitted, the endpoint defaults to the current month.
- The env var name in this runtime is `AGENT_MEDIA_ANALYTICS_KEY`, even if some external docs refer to a slightly different endpoint key name.

### Shell execution rule
When launching `run_media_buyer.py` from a shell or subprocess, do not rely on implicit env inheritance for Vault auth.
Pass Vault vars on the same command line as the Python invocation, for example:

```bash
AGENT_VAULT_URL="$AGENT_VAULT_URL" \
AGENT_EDGE_KEY="$AGENT_EDGE_KEY" \
python skills/media-buyer/run_media_buyer.py ...
```

Or pass them explicitly as flags:

```bash
python skills/media-buyer/run_media_buyer.py \
  ... \
  --vault-url "$AGENT_VAULT_URL" \
  --vault-key "$AGENT_EDGE_KEY"
```

Use this pattern for every live run that needs the Agent Vault sink.

Preferred: use the wrapper so Vault env pass-through is enforced instead of remembered manually.

```bash
skills/media-buyer/run_with_vault_env.sh ...
```

The wrapper uses `python3` and hard-fails if `AGENT_VAULT_URL` or `AGENT_EDGE_KEY` are missing.

Optional (if your pacing stack exposes these):
- `PLATFORM_METRICS_ENDPOINT` — default `/get-analytics` (override to match your Supabase function path)
- Meta structure endpoints on the same credential set:
  - `/sync-meta-structure`
  - `/get-meta-account-structure`

## TWIN API integration (authoritative doc)
If the repo doc `docs/TWIN_API_INTEGRATION.md` is the current source of truth, prefer its contract for forecast / structure work.

Base URL:
- `https://lrazfpvkqtjjuhinznpy.supabase.co/functions/v1`

Auth:
- `x-api-key: YOUR_AGENT_API_KEY`

Key endpoints:
- `/list-scenarios`
- `/get-pacing-data`
- `/get-forecast-data`
- `/get-media-plan`
- `/get-performance-data`
- `/get-brand-metrics`
- `/list-clients`
- `/get-product-breakdown`
- `/get-geography-breakdown`
- `/get-line-items`
- `/update-forecast-data`
- `/update-media-plan`
- `/get-campaign-performance`
- `/get-meta-account-structure`
- `/get-ad-performance`

Important contract notes:
- `/get-meta-account-structure` can take `clientId` or `clientName`, plus `statusFilter` and `audienceTypeFilter`.
- `/get-ad-performance` supports `level: adset|ad`, `datePreset`, `since`/`until`, and `limit`.
- `/get-campaign-performance` returns raw per-campaign rows, not channel aggregation.
- `get-pacing-data` still drives pacing status and recommendations, but structure review should start with synced Meta hierarchy when available.

## Inputs to ask the user for
1) Platform: `meta` or `google`
2) Scenario name (exact string)
3) Campaign name (exact string)
4) Target CPL (if not returned by pacing data)
5) Any constraints: monthly budget cap, geo/creative notes (optional)
6) If this is an account review, ask for any of:
   - client ID or client name
   - Meta ad account ID (for a fresh sync)
   - screenshots
   - exported account tables
   - Northbeam / attribution summaries
   - creative performance exports
   - notes on the business goal or offer
   - whether to use the ACE token source when syncing Meta structure

## API calls
### Paid media / pacing requests
All pacing-stack requests:
- Method: `POST`
- Header: `x-api-key: ${AGENT_API_KEY}`
- Base URL: `${PACING_URL}`

### Event analytics requests
All event-analytics requests:
- Method: `POST` (preferred) or `GET`
- Header: `Authorization: Bearer ${AGENT_MEDIA_ANALYTICS_KEY}`
- Base URL: `https://tmdhoerieupdpnrohjtf.supabase.co/functions/v1/agent-analytics`

### 1) List scenarios (optional)
`POST ${PACING_URL}/list-scenarios`
- Use when user isn’t sure of exact scenario name.

### 2) Get pacing data
`POST ${PACING_URL}/get-pacing-data`
Body (recommended):
```json
{ "scenarioName": "<Scenario Name>" }
```
Expected (logical) fields (actual schema may differ):
- plan period (start/end)
- planned spend / planned leads
- current spend to date / leads to date
- target CPL
- per-campaign pacing rows

### 3) Get analytics (last 24h + 7d)
For now, analytics are served by the Supabase pacing service itself.

Endpoint: `POST ${PACING_URL}${PLATFORM_METRICS_ENDPOINT}`
- default: `PLATFORM_METRICS_ENDPOINT=/get-analytics`

Body (recommended):
```json
{ "platform": "meta", "campaignName": "<Campaign Name>", "windowHours": 24, "windowDays": 7 }
```

Later, if you add proxy endpoints to Meta/Google, keep the same contract and just swap the backend implementation.

### 4) Sync Meta account structure
Use this when reviewing a Meta account structurally, especially before giving account-shape feedback.

Endpoint: `POST ${PACING_URL}/sync-meta-structure`

Body:
```json
{
  "clientId": "<client uuid>",
  "adAccountId": "<meta ad account id without act_>",
  "tokenSource": "ace"
}
```

Notes:
- Uses the same `x-api-key: ${AGENT_API_KEY}` auth as the pacing stack.
- Safe to re-run; the backend uses upsert.
- Pulls all campaigns, including paused/archived, for a complete structural picture.
- Budget values are normalized to dollars.
- `budget_type` is inferred by the backend as `CBO` or `ABO`.

### Runner modes
Treat campaign-level and ad-level as separate explicit runner modes, not as an inferred fallback.

- `--entity-level campaign` for campaign-level reporting
- `--entity-level ad` for ad-level reporting with required structure joins

Ad-level runs should require `--client-id` or `--client-name` so the structure join is deterministic.

### 5) Get Meta account structure
After syncing, read the nested campaign → ad set → ad tree.

Endpoint: `POST ${PACING_URL}/get-meta-account-structure`

Body examples:
```json
{ "clientId": "<client uuid>" }
```

```json
{ "clientName": "<fuzzy client name>", "statusFilter": "ACTIVE" }
```

```json
{ "clientId": "<client uuid>", "audienceTypeFilter": "prospecting" }
```

Expected summary fields:
- `total_campaigns`
- `total_ad_sets`
- `total_ads`
- `budget_types` (`CBO`, `ABO`)
- `audience_types` (`prospecting`, `retargeting`, `retention`)
- `creative_types` (`image`, `video`, `carousel`, `collection`)

### 6) Get client event analytics
Use this when the team wants on-site, form, funnel, or UTM/event performance for a client.

Preferred request:
```json
{ "client": "<client name or slug>", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }
```

Expected response areas:
- tenant info
- summary
  - page views
  - leads
  - qualified
  - conversion rate
  - form starts
  - form completes
  - form errors
  - form completion rate
- top pages
- top UTM sources
- top UTM campaigns
- top referrers
- full event counts
- per-form breakdown
  - `form_id`
  - `product_slug`
  - completion rate
- daily time series

Use cases:
- diagnose landing-page or form leakage after ad click
- compare media-platform lead volume vs site-side lead / qualified volume
- identify which pages, UTMs, campaigns, and referrers are actually driving qualified outcomes
- separate traffic problems from conversion problems

### UTM efficiency endpoint
Use this for finance lead gen campaigns, especially Guild Mortgage-style funnels where credit events matter more than raw lead volume.

- URL: `${PACING_URL}/get-utm-efficiency`
- Auth header: `x-api-key: ${AGENT_API_KEY}`
- Method: `POST`

Request:
```json
{
  "scenarioId": "uuid",
  "channelName": "all",
  "monthNumber": 7,
  "utmDim": "utm_campaign",
  "benchmarkChannel": "google"
}
```

Response rows include:
- `utm`
- `leads`
- `contacted`
- `creditEvent` , same as Credit Pulls
- `prequal`
- `underContract`
- `funded`
- `spend`
- `spendMatched`
- `cpl`
- `cpce`
- `efficiency_score`

Scoring rule:
- `efficiency_score = benchmarkCPCE / rowCPCE`
- benchmark is Google `branded-search-exact`
- `1.00` = benchmark, `2.00` = twice as efficient, `0.50` = half as efficient
- `null` = no matched spend or no credit events

Important constraints:
- spend matching only works for `utm_campaign`
- `utm_content`, `utm_medium`, and `utm_source` rows will usually not have spend matched
- rows are pre-sorted by `efficiency_score` descending, nulls last

Interpretation:
- prioritize budget toward rows with `efficiency_score > 1.00`
- high leads with low `creditEvent` usually means downstream funnel friction, not just cost pressure
- for Meta, use the same Google benchmark so scores are directly comparable across channels

## Metrics to compute / display
For **24h** and **7d** (and where possible, 7d daily trend):
- spend
- impressions
- clicks
- CTR
- CPM
- CPC
- leads
- CPL
- ROAS
- frequency
- conversions (7-day)

When event analytics are available, also surface:
- page views
- site-side leads
- qualified leads
- credit events / Credit Pulls
- visit → lead conversion rate
- form start rate
- form completion rate
- form error rate
- per-form completion rate
- top landing pages
- top UTM sources / campaigns
- top referrers
- daily event trend breaks

When reviewing an existing account, also try to surface:
- campaign count and structure clarity
- spend concentration by campaign / ad set / ad
- creative mix by format
- winner vs loser concepts
- audience overlap / exclusion hygiene when visible
- net new reach trend when available
- contribution margin or MER if the team provides it
- ad sets per campaign (single-ad-set CBO prospecting is a strong default)
- ads per ad set (roughly 3–6 is healthy; >10 usually means over-testing or muddled learning)
- CTA concentration and copy repetition across ads
- stale structures: many paused ads, archived-heavy accounts, or old syncs without active simplification
- UTM efficiency: strongest and weakest rows by `efficiency_score`, plus benchmark CPCE context for finance funnels

Derived flags:
- **Learning phase:** conversions(7d) < 50
- **Creative fatigue:** frequency > 3.5 OR CTR decline > 20% WoW
- **CPL trend alert:** yesterday CPL > 1.5 * (7-day avg CPL) ⇒ flag **CPL RISING** (even if below target)
- **Structure risk:** spend is too fragmented or one campaign is carrying nearly all delivery without a clear reason
- **Budgeting risk:** too much ABO outside testing, or CBO used without clear consolidation
- **Fragmentation risk:** too many ad sets per prospecting campaign or too many ads per ad set
- **Audience hygiene risk:** prospecting / retargeting / retention are blurred or inferred audience types conflict with naming
- **Measurement gap:** platform ROAS is being treated as the only decision signal
- **UTM efficiency gap:** spend is concentrated in low-scoring or null-scoring UTM rows versus the Google branded-search benchmark

## Pacing calculation
Compute spend pacing as:
- `pacingPct = actualSpendToDate / plannedSpendToDate * 100`

Bucket:
- **AHEAD:** > 105%
- **ON-TRACK:** 95–105%
- **BEHIND:** < 95%

## Decision framework (Efficiency-Weighted – Option C)
| Spend Pacing | CPL vs Target | Action |
|------------|---------------|--------|
| AHEAD (>105%) | Below target (good) | HOLD |
| AHEAD (>105%) | Above target (bad) | REDUCE 10% |
| BEHIND (<95%) | Below target | SCALE 10% |
| BEHIND (<95%) | Above target | HOLD or slight increase |
| ON-TRACK (95-105%) | Any | MAINTAIN |

## 2026 Optimization Guardrails (hard rules)
- Never scale >10% per adjustment.
- **Never scale on weekends (Sat/Sun)** in America/Los_Angeles.
- **Never scale during learning phase** (<50 conversions in 7 days).
- Creative fatigue alert ⇒ recommend creative refresh.
- CPL rising alert ⇒ flag **CPL RISING**.
- Never exceed monthly budget by >5%.
- Never scale if CPL is >20% above target.
- If signals conflict or guardrails block the framework action ⇒ **ALERT HUMAN** with why.

## Account review heuristics
When the team asks for feedback on an existing account, prioritize these observations:
- **Campaign structure:** prefer simple, legible structures; isolate prospecting, retargeting, and retention when possible.
- **Creative system:** look for concept diversity, format balance, and whether new assets are being introduced into live winners instead of endlessly rebuilding.
- **Audience strategy:** favor broad targeting with clean exclusions; treat creative as the targeting layer.
- **Offer testing:** call out whether the team is testing offer angles, not just ad copy or edits.
- **Health signals:** watch frequency, CPMr, net new reach, CTR trend, and creative win rate together instead of in isolation.
- **Measurement hierarchy:** blended revenue and contribution margin outrank in-platform ROAS; attribution tools are support, not the source of truth.
- **Structure-first review:** if Meta structure data is available, start with synced campaigns → ad sets → ads before making performance judgments.
- **Actionability:** always end with 2–3 concrete next moves for media buyers and the team.

## Meta structure review workflow
Use this when you have pacing credentials and need an operator-grade Meta account audit.

1. Resolve the client via your client list / known client UUID.
2. Run `POST /sync-meta-structure` with `clientId`, `adAccountId`, and optional `tokenSource: "ace"`.
3. Run `POST /get-meta-account-structure` with `clientId` (or `clientName`).
4. Review the summary first:
   - Is prospecting cleanly separated from retargeting / retention?
   - Is CBO the dominant budget type, with ABO mostly reserved for testing?
   - Is the creative mix overly skewed, or does it include both static and video?
   - Are there too many ad sets per campaign?
   - Are there too many ads per ad set?
5. Then inspect campaign-level details:
   - naming clarity
   - objective / buying type consistency
   - active vs paused clutter
   - audience-type inference vs actual targeting summary
   - CTA repetition, copy repetition, and creative-type concentration
6. If performance data is also available, combine it with pacing and structure before recommending changes.

## Structural health checks the agent should answer
- Is prospecting isolated from retargeting?
- Is ABO being used mostly for testing, not as the default account architecture?
- Is the account over-fragmented at the campaign, ad set, or ad level?
- Does the creative mix match the team’s intended operating model (static-heavy with enough video / creator variation)?
- Are there stale or cluttered campaigns that should be archived or simplified?
- Are CTA and copy patterns too repetitive across live ads?
- Does the structure support clean learning, or is it muddy enough to hide real winners?

## Meta Ads Account Review Checklist
Use this when the team wants a structured review of an existing Meta account.

### 1) Account shape
- What is the business goal and primary offer?
- Is the account cleanly split into prospecting, retargeting, and retention?
- Is spend concentrated in a few understandable campaigns, or fragmented without reason?
- Is CBO the main structure, with ABO isolated for testing?
- How many ad sets exist per campaign, and is that justified?

### 2) Creative system
- How many new concepts shipped in the last 30 days?
- Are there enough distinct angles, or just small edits on the same idea?
- Are static, video, creator, and motion formats represented appropriately?
- Are winning concepts getting variants instead of being replaced too early?
- Are there too many ads crammed into individual ad sets?
- Are CTA and headline patterns varied enough to support real testing?

### 3) Audience and exclusions
- Is targeting broad enough for Meta to learn?
- Are buyer / email / visitor exclusions clean and current?
- Is creative doing the targeting, or is the team overfitting audiences?

### 4) Offer and landing page
- Is the team testing bundle, pricing, free shipping, guarantee, and urgency angles?
- Does the landing page support the creative promise?
- Are there obvious conversion blockers after click or landing page view?

### 5) Health and measurement
- Are frequency, CPMr, CTR, and net new reach moving in the right direction?
- Is platform ROAS being over-weighted relative to blended revenue and contribution margin?
- Is creative win rate healthy, or are too many assets being launched without traction?

### 6) Next actions
End with:
- 1 thing to keep
- 1 thing to cut
- 1 thing to test next

## Combining structure with performance
For the strongest review, combine four layers:
1. **Structure** — `get-meta-account-structure` tells you what exists and how the account is organized.
2. **Platform performance** — `get-pacing-data` and paid-media analytics tell you what is working or failing inside Meta/Google.
3. **Site event analytics** — `agent-analytics` tells you what happened after the click: page views, forms, leads, qualified, UTMs, referrers, and daily event trends.
4. **Business truth** — blended revenue, MER, contribution margin, and any attribution support.

Rule:
- structure tells you **what is running**
- platform performance tells you **how ads are behaving**
- site event analytics tell you **whether traffic is converting and where it leaks**
- business metrics tell you **whether it actually matters**

### Combined diagnostic workflow
Use this sequence when possible:
1. Pull pacing and platform performance for the paid channel question.
2. Pull `agent-analytics` for the same client and date range.
3. Compare platform leads vs site-side leads / qualified counts.
4. Check whether the issue is:
   - traffic quality
   - landing-page mismatch
   - form friction
   - tracking mismatch
   - healthy funnel but weak media efficiency
5. Recommend the next action at the correct layer.

### Combined diagnostic patterns
- **High CTR, weak site conversion** → landing page, offer, or form problem.
- **Strong site conversion, weak ad CPL** → traffic cost / audience / creative efficiency problem.
- **Platform leads materially exceed site leads** → tracking or attribution mismatch.
- **High form starts, weak completes, high errors** → form UX or technical issue.
- **One page / UTM / referrer dominates qualified volume** → consolidate learning there before broadening.

## Router-ready media normalization
When the user wants decision support, emit a compact normalized payload before any recommendation.

### Stable windows
Always normalize into:
- `last_24h`
- `last_7d`
- `month_to_date`

When using `agent-analytics`, align the date range to the same analysis window whenever possible. If the endpoint only has date-grain ranges, use the nearest practical equivalent and state it clearly.

### Minimum payload shape
```json
{
  "entity_level": "account | campaign | adset | ad | keyword | audience | creative",
  "channel": "meta | google | mixed",
  "intent_layer": "brand | nonbrand | retargeting | prospecting | mixed",
  "primary_goal": "scale | efficiency | learning | cleanup | recovery",
  "windows": {
    "last_24h": {},
    "last_7d": {},
    "month_to_date": {}
  },
  "site_analytics": {
    "summary": {},
    "top_pages": [],
    "top_utm_sources": [],
    "top_utm_campaigns": [],
    "top_referrers": [],
    "forms": [],
    "daily": []
  },
  "utm_efficiency": {
    "benchmark": {},
    "rows": [],
    "best_rows": [],
    "worst_rows": []
  },
  "derived_flags": {
    "underpacing": false,
    "over_target_cpl": false,
    "low_signal": false,
    "fragmentation_risk": false,
    "saturation_risk": false,
    "tracking_gap": false,
    "landing_page_gap": false,
    "form_friction": false,
    "lead_quality_gap": false,
    "utm_efficiency_gap": false
  },
  "decision": {
    "recommended_action": "explore | prune | hold | scale | diagnose | reallocate | test_next",
    "confidence": 0.0,
    "rationale": "string"
  }
}
```

### Decision boundaries
- **explore** when signal is noisy, sample is small, or a plausible new path exists.
- **prune** when a branch is consistently underperforming and strategically low value.
- **hold** when signal is mixed or insufficient to cut/scale.
- **scale** when efficiency is strong and volume is sufficient.
- **diagnose** when outcome is bad but root cause is unclear.
- **reallocate** when spend should move elsewhere, not just pause.
- **test_next** when the best next step is a hypothesis test, not a budget move.

### Failure-closed behavior
If the data is incomplete, stale, or contradictory, do not force a confident recommendation. Mark the missing piece explicitly and fall back to **diagnose** or **hold**.

If pacing/platform data and `agent-analytics` disagree materially, call out the likely mismatch type explicitly:
- tracking mismatch
- attribution-window mismatch
- landing-page loss
- form instrumentation gap
- date-range mismatch

If `get-utm-efficiency` disagrees with platform CPL or lead volume materially, call out the likely issue explicitly:
- spend matching failure
- UTM grouping mismatch
- credit-event lag
- benchmark skew

## Approval workflow (chat-driven)
For now, there are **no automated actions** (Meta/Google changes). The agent only posts recommendations.

Keep the approval verbs reserved for the future, when you add proxy endpoints:
- `/approve scale` / `/approve reduce` / `/approve pause` / `/approve hold` / `/approve dismiss`

Until then:
- The report can be posted immediately (no approval needed) and should clearly label any suggested actions as **RECOMMENDATIONS ONLY**.

## Implementation notes (this workspace)
A reference script lives at:
- `skills/media-buyer/run_media_buyer.py`

Operational requirements for live runs:
- pass `AGENT_VAULT_URL` and `AGENT_EDGE_KEY` on the same shell command line, or use `--vault-url` / `--vault-key`
- do not assume child shells inherit the main runtime env snapshot
- use `--debug-outbound` when validating request construction for `/get-ad-performance` or related endpoints
- for Meta ad-level exploration, provide `--client-id` or `--client-name`
- use canonical `level` values only: `ad` or `adset`

Use `--emit-json` when you want the router-ready normalized payload before the human report. This script expects the pacing API to provide enough data to compute the above metrics. If response schemas differ, adapt the parser in one place.

Related operational playbook:
- `vault/playbooks/meta-account-review.md`
