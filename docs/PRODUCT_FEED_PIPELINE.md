# Product Feed Processing Pipeline (S3 -> Local DuckDB -> Curated Output)

## Overview

Build a robust, Railway-compatible batch pipeline to:

1. Download large product feeds from S3 by streaming to disk, never buffering the entire file in memory
2. Normalize and process them with local DuckDB
3. Filter to a curated subset, roughly 5K SKUs, based on dynamic rules
4. Output a smaller Shopify-compatible dataset plus normalized Parquet and a summary artifact
5. Optionally upload the results back to S3
6. Expose the pipeline as a callable module with a thin agent wrapper

This is a batch data pipeline, not a request/response API path.

## Current decision

Use DuckDB for this workflow.

Why this is the right default here:

- embedded engine, no extra service to run on Railway
- strong SQL ergonomics for filter logic and validation
- fast enough for hundreds of thousands of SKUs in a batch job
- easy to emit both CSV and Parquet
- keeps the first implementation simple: `S3 download -> local file -> DuckDB -> outputs`

For `edge-bot`, prefer AWS SDK stream download to local disk first and then point DuckDB at the local file. Do not make direct DuckDB S3 reads the first implementation. Direct `httpfs` / S3 reads can remain a later optimization once the local-disk path is working reliably in the Railway container with Roles Anywhere.

## Environment context

- Runs on Railway in the hosted agent container
- AWS access is configured via IAM Roles Anywhere (`credential_process`)
- Expected env vars, already used by the hosted image and entrypoint:
  - `AWS_REGION` or `AWS_DEFAULT_REGION`
  - `RA_CERT_PEM`, `RA_KEY_PEM`, `RA_TRUST_ANCHOR_ARN`, `RA_PROFILE_ARN`, `RA_ROLE_ARN`

Assume AWS credentials are already working.

## CIQ S3 access (granted)

CIQ provisioned a bucket and granted access to the Railway agent role:

- Bucket ARN: `arn:aws:s3:::ciq-thegig-agency`
- Role ARN: `arn:aws:iam::520256012531:role/railway-claw-base-role`

Minimal validation:

- `ListObjectsV2` on `ciq-thegig-agency`, optionally under a known prefix
- `HeadObject` for a known key

## Key constraints

- Do not load the entire feed into memory
- Must stream S3 downloads to disk
- Must use DuckDB SQL for filtering, not JS row iteration
- Must support large files, for example around 600K SKUs
- Must be safe to run repeatedly, bounded, and cleanup-aware
- Must preserve the upstream Shopify-compatible row shape for the curated CSV unless we explicitly decide otherwise

## Architecture

```text
S3 (TSV/CSV feed)
  ↓
AWS SDK stream download → local file
  ↓
DuckDB normalization pass
  ↓
Normalized local Parquet + canonical view
  ↓
Rule-based DuckDB filter
  ↓
Curated CSV + curated Parquet + summary.json
  ↓
Optional upload to S3
```

## Working directory layout

Prefer a configured working root and fall back to `/tmp` if no volume exists.

Example structure:

```text
${PRODUCT_FEED_WORKDIR:-/tmp/product-feeds}/{timestamp_or_run_id}/
  inbound/
    source.tsv
  normalized/
    source.parquet
  outbound/
    curated.csv
    curated.parquet
    summary.json
  run.json
  duckdb.log
```

Operational notes:

- Add a retention policy, for example keep last N runs or purge runs older than X days
- Enforce max inbound size if using `/tmp`
- Treat the working root as configuration, not a hard-coded `/data` assumption

## Real feed shape (current sample)

The current sample feed is a tab-delimited Shopify/CreatorIQ-style export. It currently includes 48 columns, including:

- `URL_HANDLE`
- `TITLE`
- `DESCRIPTION`
- `VENDOR`
- `PRODUCT_CATEGORY`
- `TYPE`
- `TAGS`
- `PUBLISHED`
- `STATUS`
- `SKU`
- `PRICE`
- `INVENTORY_QUANTITY`
- `CONTINUE_SELLING_WHEN_OUT_OF_STOCK`
- `PRODUCT_IMAGE_URL`
- `VARIANT_IMAGE_URL`
- `GOOGLE_SHOPPING_AVAILABILITY`

Important observations from the sample:

- there is no `COLLECTION` column in the sample file
- the handle field is `URL_HANDLE`, not `HANDLE`
- the feed appears to be variant-level, not one-row-per-product
- multiple rows can share the same handle, so reporting must distinguish:
  - distinct `sku`
  - distinct `url_handle`

## Canonical normalization map

Normalize raw column names to canonical internal names:

| Raw column | Canonical name | Notes |
|------------|----------------|-------|
| `URL_HANDLE` | `url_handle` | product handle |
| `TITLE` | `title` | preserve source text |
| `DESCRIPTION` | `description` | upstream body copy |
| `VENDOR` | `vendor` | supplier or brand |
| `PRODUCT_CATEGORY` | `product_category` | Google or catalog taxonomy |
| `TYPE` | `type` | product type |
| `TAGS` | `tags` | delimiter semantics may need normalization |
| `PUBLISHED` | `published` | boolean-like string |
| `STATUS` | `status` | for example `active`, `archived` |
| `SKU` | `sku` | primary variant identifier |
| `PRICE` | `price` | numeric |
| `INVENTORY_QUANTITY` | `inventory_quantity` | numeric |
| `CONTINUE_SELLING_WHEN_OUT_OF_STOCK` | `continue_selling_when_out_of_stock` | policy flag |
| `PRODUCT_IMAGE_URL` | `product_image_url` | product image |
| `VARIANT_IMAGE_URL` | `variant_image_url` | variant image |
| `GOOGLE_SHOPPING_AVAILABILITY` | `google_shopping_availability` | availability signal |

The first curated CSV should preserve the original upstream columns unless Shopify ingestion requirements force a projection later.

## Modules (contracts)

### 1) `downloadS3File`

Inputs:

- `bucket: string`
- `key: string`
- `localPath: string`

Behavior:

- Use AWS SDK `GetObject`
- Stream the response body to a file with no full buffering
- Ensure parent directories exist
- Return metadata:
  - `path`
  - `size`, if available from headers or after write

### 2) `normalizeFeedWithDuckDb`

Inputs:

- `inputPath: string`
- `normalizedParquetPath: string`
- `detectedFormat?: 'csv' | 'tsv'`

Behavior:

- Open DuckDB locally
- Read the raw local file with delimiter-aware parsing
- Normalize column names into a canonical lowercase and underscore form
- Write a normalized Parquet copy for the actual filter step
- Return:
  - `inputRowCount`
  - `normalizedParquetPath`
  - `rawColumns`
  - `canonicalColumns`

Notes:

- The sample client feed is tab-delimited, so the first version must explicitly support TSV input
- Keep both the raw downloaded file and the normalized Parquet copy for reproducibility and easier debugging

### 3) `runDuckDbFilter`

Inputs:

- `inputParquetPath: string`
- `outputCsvPath: string`
- `outputParquetPath?: string`
- `summaryJsonPath: string`
- `rules: Rules`

Behavior:

- Open DuckDB locally
- Read the normalized local Parquet file
- Create a canonical `products` view or table
- Log schema, for example `DESCRIBE` or `PRAGMA table_info`
- Apply filtering logic
- Validate row counts and duplicate SKUs
- Write `summary.json`
- Return:
  - `inputRowCount`
  - `filteredRowCount`
  - `distinctSkuCount`
  - `distinctHandleCount`
  - output paths
  - selected schema or columns
  - warnings

### 4) `uploadS3File`

Inputs:

- `bucket: string`
- `key: string`
- `localPath: string`

Behavior:

- Upload file to S3
- Return destination info such as bucket, key, etag, and version if available

### 5) `processProductFeed` (orchestrator)

Inputs:

- `sourceBucket: string`
- `sourceKey: string`
- `workingDir: string`
- `outputBucket?: string`
- `outputPrefix?: string`
- `rules: Rules`

Flow:

1. Download source feed by streaming to disk
2. Normalize raw feed to local Parquet with DuckDB
3. Run DuckDB filter
4. Upload outputs, optional
5. Return structured result

Return shape:

```json
{
  "success": true,
  "inputRowCount": 612443,
  "filteredRowCount": 4872,
  "distinctSkuCount": 4872,
  "distinctHandleCount": 3510,
  "inputPath": "/tmp/product-feeds/.../inbound/source.tsv",
  "normalizedParquetPath": "/tmp/product-feeds/.../normalized/source.parquet",
  "outputCsvPath": "/tmp/product-feeds/.../outbound/curated.csv",
  "outputParquetPath": "/tmp/product-feeds/.../outbound/curated.parquet",
  "summaryJsonPath": "/tmp/product-feeds/.../outbound/summary.json",
  "outputBucket": "my-bucket",
  "uploadedKeys": {
    "csv": "curated/feeds/run-123/curated.csv",
    "parquet": "curated/feeds/run-123/curated.parquet",
    "summary": "curated/feeds/run-123/summary.json"
  },
  "schema": ["url_handle", "title", "vendor", "status", "sku", "price"]
}
```

## Filtering logic (initial)

### Rules object example

```json
{
  "allowedSkus": ["99104989069"],
  "blockedSkus": ["99100000000"],
  "vendors": ["J.CREW"],
  "productTypes": ["Apparel & Accessories > Clothing > Pants"],
  "tagsContains": ["gifting", "creator"],
  "minPrice": 25,
  "maxPrice": 250,
  "minInventory": 0,
  "inStockOnly": false,
  "activeOnly": true,
  "limit": 5000,
  "sortBy": ["sku"]
}
```

Notes:

- Keep `minInventory` and inventory filtering in the design even though the sample file is not representative
- For the real feed, assume inventory becomes meaningful and we want to filter out `inventory_quantity < 0`
- During testing with the current sample, we can either:
  - set `inStockOnly: false`
  - or modify fixture rows to positive inventory
- `collections` should be treated as optional future support, not a required first-version rule, unless the real feed or a separate rules source provides collection data

### SQL pattern (illustrative)

```sql
CREATE TABLE products AS
SELECT *
FROM read_parquet('{{INPUT_PARQUET}}');

CREATE TABLE filtered AS
SELECT *
FROM products
WHERE 1=1
  AND (lower(status) = 'active' OR status IS NULL)
  AND (inventory_quantity IS NULL OR inventory_quantity >= 0)
  AND (price IS NULL OR price BETWEEN 25 AND 250)
  AND (
    sku IN ('99104989069')
    OR lower(vendor) IN ('j.crew')
    OR lower(tags) LIKE '%gifting%'
  )
ORDER BY sku
LIMIT 5000;
```

If we later enable strict stock filtering, prefer an explicit rule and clear precedence, for example:

```sql
AND (
  lower(google_shopping_availability) = 'in stock'
  OR inventory_quantity > 0
)
```

The exact stock rule should remain configurable because the current sample shows `GOOGLE_SHOPPING_AVAILABILITY = 'in stock'` on many rows where `INVENTORY_QUANTITY = 0`.

## Candidate set vs publish manifest

Treat these as separate layers:

1. **Source feed**
   - full CIQ or J.Crew feed, potentially hundreds of thousands of variant rows
2. **Candidate set**
   - deterministic DuckDB output, for example `600K rows -> 5K variant rows / ~1K products`
   - generated from structural rules such as status, inventory, price, vendor, tags, product type, and hard include or exclude lists
3. **Publish manifest**
   - the final approved assortment to sync into Shopify for the gifting storefront
   - smaller than the candidate set, intentionally curated for creator gifting

This split matters because DuckDB should be excellent at deterministic net-down, while the final Shopify assortment should remain explicit, inspectable, and reproducible.

## Publish model for Shopify

For this gifting storefront, Shopify is the serving layer, not the master catalog.

Recommended biweekly publish behavior:

1. Generate the new candidate set
2. Generate and persist a versioned publish manifest
3. Sync the new manifest into Shopify successfully
4. Prune Shopify products that are not present in the new manifest

This is effectively a full-refresh assortment, but it is safer than `delete everything first` because Shopify does not go empty if the refresh fails halfway through.

Assumptions behind this model:

- this Shopify store is dedicated to gifting
- products are disposable storefront artifacts, not long-lived customer catalog assets
- we do not need to preserve legacy carts, legacy links, or long-term product continuity between cycles

## Manifest contract

The publish manifest should be a first-class artifact, versioned per run.

Suggested outputs:

- `publish-manifest.json`
- optionally `publish-manifest.csv` for easier inspection

### Manifest purpose

The manifest is the exact source of truth for what should exist in Shopify after a given run.

It should answer:

- which products or variants were selected
- why they were selected
- which run and config produced them
- what should be created, updated, or pruned in Shopify

### Manifest shape

Use a top-level run object plus row-level selections.

```json
{
  "manifestVersion": "2026-04-01",
  "runId": "2026-04-01T12-00-00Z",
  "source": {
    "bucket": "ciq-thegig-agency",
    "key": "incoming/raw/2026-04-01/full-feed.tsv"
  },
  "configVersion": "client-jcrew-gifting-v3",
  "candidateSummary": {
    "candidateVariantCount": 5000,
    "candidateProductCount": 1000
  },
  "publishSummary": {
    "publishVariantCount": 1200,
    "publishProductCount": 280
  },
  "selections": [
    {
      "urlHandle": "cashmere-pointelle-mockneck-sweater",
      "sku": "99106760930",
      "title": "Cashmere pointelle mockneck sweater",
      "vendor": "J.CREW",
      "price": 138.0,
      "status": "active",
      "inventoryQuantity": 12,
      "selectionReason": "matched seasonal knitwear theme and premium gifting band",
      "ruleHits": ["theme:winter-soft-luxury", "priceBand:premium", "vendor:jcrew"],
      "assortmentBucket": "women-knitwear",
      "rankWithinBucket": 4,
      "publish": true
    }
  ]
}
```

### Required row-level fields

- `urlHandle`
- `sku`
- `title`
- `vendor`
- `price`
- `publish`
- `selectionReason`
- `ruleHits`

### Strongly recommended row-level fields

- `assortmentBucket`
- `rankWithinBucket`
- `inventoryQuantity`
- `status`
- `productType`
- `tags`

## Client configuration contract

The client should not edit the skill text as the normal control surface. Instead, the skill should read a versioned configuration object plus optional allowlists and blocklists.

That gives you flexibility without making the core agent behavior unauditable.

### Configuration purpose

The config should control how the agent turns the candidate set into the publish manifest.

It should define:

- what kinds of products are eligible
- what kinds of products are preferred
- diversity and assortment constraints
- hard includes and excludes
- publish size limits

### Suggested config shape

```json
{
  "configVersion": "client-jcrew-gifting-v3",
  "candidateRules": {
    "activeOnly": true,
    "minInventory": 0,
    "minPrice": 25,
    "maxPrice": 250,
    "allowedVendors": ["J.CREW"],
    "allowedProductTypes": [
      "Apparel & Accessories > Clothing",
      "Apparel & Accessories > Shoes"
    ],
    "requiredTagMatchesAny": ["giftable", "creator-favorite"],
    "blockedTagMatchesAny": ["final-sale", "restricted"]
  },
  "manifestRules": {
    "targetProductCount": 300,
    "targetVariantCount": 1200,
    "maxVariantsPerProduct": 5,
    "maxProductsPerBucket": 40,
    "bucketTargets": [
      { "bucket": "women-knitwear", "targetProducts": 30 },
      { "bucket": "mens-shirts", "targetProducts": 25 },
      { "bucket": "accessories", "targetProducts": 20 }
    ],
    "diversityAxes": ["product_type", "price_band", "gender_theme"],
    "selectionMode": "balanced"
  },
  "hardRules": {
    "forceIncludeSkus": ["99104989069"],
    "forceExcludeSkus": ["99100000000"],
    "forceIncludeHandles": [],
    "forceExcludeHandles": []
  }
}
```

### What should be configurable

- price bands
- product type preferences
- gifting themes or assortment buckets
- max products to publish
- max variants per product
- force include or exclude SKU lists
- force include or exclude handle lists
- inventory thresholds
- diversity rules across categories, price bands, or themes

### What should remain in stable code or skill logic

- how the feed is downloaded
- how normalization works
- how candidate SQL is compiled safely
- how manifests are written and versioned
- how Shopify sync and prune are executed
- how logging and summary artifacts are emitted

## Output

### CSV

```sql
COPY filtered TO '{{OUTPUT_CSV}}' WITH (HEADER, DELIMITER ',');
```

### Parquet

```sql
COPY filtered TO '{{OUTPUT_PARQUET}}' (FORMAT PARQUET);
```

### Summary JSON

Write a summary artifact with at least:

```json
{
  "runId": "2026-04-01T12-00-00Z",
  "source": {
    "bucket": "ciq-thegig-agency",
    "key": "incoming/raw/2026-04-01/full-feed.tsv"
  },
  "inputRowCount": 612443,
  "filteredRowCount": 4872,
  "distinctSkuCount": 4872,
  "distinctHandleCount": 3510,
  "duplicateSkuCount": 0,
  "warnings": []
}
```

## Logging requirements

Log at minimum:

- source bucket and key
- local file paths, inbound, normalized, and outbound
- file sizes, inbound and outbound, if available
- row counts, before and after
- distinct handles and distinct SKUs
- output destinations if uploaded
- a stable `run_id` or timestamp

## Agent integration (critical)

The hosted agent should:

- decide filtering rules
- choose bucket and key within allowed bounds
- evaluate results

The pipeline should:

- execute deterministically
- enforce limits and safety
- return structured results for follow-up reasoning

Preferred first implementation surface:

- a local module, for example `processProductFeed(...)`
- optionally wrapped by:
  - a workspace skill
  - a CLI script

Do not start with a long-running internal service unless we prove we need it. A local callable module plus a thin agent-facing wrapper is simpler and fits this repo better.

### Preferred callable interface

```ts
await processProductFeed({
  sourceBucket,
  sourceKey,
  rules,
  outputBucket,
  outputPrefix
});
```

## Guardrails

- Max output rows default: `5000`
- Validate rules before execution
- Restrict allowed S3 buckets and prefixes, deny by default
- No filesystem access outside the working dir
- Fail loudly if expected columns are missing from the real feed or from the normalization map
- Avoid SQL injection: compile SQL from a whitelist of clauses, do not concatenate raw agent strings
- Always apply a stable `ORDER BY` before `LIMIT`
- Report both variant-level and product-level counts when possible
- Preserve upstream columns in the curated CSV unless a later Shopify contract says otherwise

## Test harness (smoke test)

Implement a small test that:

1. Downloads a small fixture from S3
2. Normalizes it to Parquet
3. Runs the DuckDB query
4. Writes filtered output plus `summary.json`
5. Logs counts plus sample keys or rows

For the current sample TSV, testing may need one of these approaches:

- temporarily set a few fixture rows to `INVENTORY_QUANTITY = 1`
- or disable `inStockOnly` in the smoke test config while keeping `minInventory = 0`

## Assumptions, dependencies, and risks

This section is for operators and partner engineering (for example CIQ): what we depend on, what can go wrong, and what is explicitly out of scope for the first implementation.

### Dependencies (external)

- **AWS access**: The runtime principal (Roles Anywhere → IAM role) can perform the agreed S3 actions on the agreed prefixes. **Bucket-level** permissions (`s3:ListBucket` on the bucket ARN) and **object-level** permissions (`GetObject` / `PutObject` on `bucket/key*`) must both match how the job reads and writes. A common failure mode is granting object read without list, or mismatch between bucket policy and role policy.
- **Feed delivery**: Someone or something places the authoritative feed in the agreed location (for example `incoming/raw/<date>/`) on the expected cadence, or updates a **manifest** that points to the current file. If the feed is late, empty, or dropped in the wrong prefix, the pipeline cannot invent correct outputs.
- **Schema contract**: The feed remains compatible with the normalization map (column names and meanings). Breaking changes require coordination and a doc or version bump, not silent drift.
- **Downstream handoff**: Who consumes `outgoing/curated/...` (for example a Shopify loader) is defined; file naming and column preservation match that tool’s contract.
- **Hosting**: Railway (or successor) runs the job with sufficient disk for inbound + normalized + outbound peaks, and with `RA_*` and other secrets configured and renewed before expiry.

### Assumptions (internal)

- Batch **biweekly** (or as agreed) is sufficient; near-real-time sync is not required for v1.
- Curation rules and allow/block lists are **versioned or snapshotted** for reproducibility when runs are audited or disputed.
- The orchestrator **fails closed**: on validation errors, missing columns, or suspicious counts, it does not publish a curated file as if the run succeeded.

### Risks (what can stall or derail)

| Risk | Typical symptom | Mitigation direction |
|------|-----------------|---------------------|
| IAM or bucket policy gap | `AccessDenied` on list or get | Prefix-scoped policies; explicit checklist (STS identity + list prefix + get head object); CIQ/TGA joint verification |
| Feed late or missing | No new raw object by cutoff | Monitoring on **freshness** of `incoming/` or manifest; alert if SLA missed |
| Schema drift | Pipeline throws or drops columns | Strict validation against expected columns; fail with clear error; summary records warnings |
| Bad rules or data | Curated row count near zero or huge | Bounds on `filteredRowCount`; compare to prior run; human review threshold |
| Disk or OOM on Railway | Job killed mid-run | Streamed download; Parquet normalization; max inbound size; volume or larger instance if needed |
| Silent partial success | Old curated file looks “still there” | Write outputs to a **new dated path**; treat success as **new** `summary.json` for that run, not “any file exists” |

### Non-goals (v1)

- Multi-tenant analytics warehouse or ad hoc SQL for many users (Athena or a database may come later).
- Direct DuckDB reading from S3 (`httpfs`) as the first path; local disk + SDK first.
- Guaranteed SLA or 24/7 on-call unless separately agreed; this doc describes the **technical** shape so SLA can be layered on.

### Ownership (typical split)

Clarify in the engagement letter or runbook who owns: S3 bucket and IAM changes, feed upload timing, running the job, first-line triage, and notifying the brand or CIQ. Ambiguity here is a common source of delays, not code defects.

## Operational monitoring and alerting (biweekly flow)

The pipeline should be **observable** without relying on a human remembering to run it. Prefer **deterministic** checks such as timestamps, files, structured run records, and JSON summaries over a second LLM “watching” the process; an agent may **start** a run, but **verification** should be scriptable.

### What “success” looks like (signals)

After each scheduled or manual run, success should be provable from artifacts and logs:

- A new **`summary.json`** under the agreed output prefix (for example `outgoing/curated/<YYYY-MM-DD>/summary.json`) with stable fields: `runId`, source bucket/key, row counts, and `warnings` (may be empty).
- Companion outputs as agreed: for example `shopify-feed.csv` (and optionally Parquet) in the same dated folder.
- Application logs or structured run records show a single run with a stable `run_id`, clear start/end markers, and no unhandled exceptions.
- Optional: a **manifest** in S3 updated to point at the latest curated path for downstream consumers.

Define **expected bands** for `filteredRowCount` (for example not zero when the catalog is live, and not above `limit` without explanation) so automation can flag anomalies.

### What breaks at each step (how you know)

| Step | If it fails | How you notice |
|------|-------------|----------------|
| Credentials / IAM | `AccessDenied`, STS or SDK errors | Logs; smoke test; missing success summary for the expected run |
| Download | Timeout, 404, partial file | Logs; missing or tiny inbound file; checksum/size if implemented |
| Normalize (DuckDB) | Parse error, type error | Logs; no `normalized/` parquet; DuckDB error text |
| Filter / validate | SQL or rule error | Logs; missing outbound files |
| Upload | `AccessDenied`, network | Logs; S3 has no new dated `outgoing/` objects |
| Downstream | Loader rejects file | Their logs; optional post-check of file headers |

### How to run every two weeks (scheduling options)

Pick one primary mechanism; combine with **post-run verification** below.

1. **Time-based cron invoking a one-shot runner (recommended for v1)**  
   - **GitHub Actions** `schedule` calling a small workflow that runs a CLI wrapper or one-shot job command on the agreed day/time.  
   - **Railway**: use a scheduled job if your plan supports running a dedicated one-shot command for the pipeline.  
   - **External cron** (for example a managed scheduler) invoking a CLI/job-runner path, not a new long-running app service.

2. **Calendar + human trigger (early prototype)**  
   - Operator or agent starts the run on the agreed day. Acceptable only if paired with **freshness alerts** so a missed human step is detected.

3. **Event-driven (later)**  
   - S3 `ObjectCreated` on `incoming/raw/` triggers a worker (Lambda, queue consumer, or webhook). Strong when CIQ controls uploads; requires infra on their side or yours and is listed under future extensions for a reason.

4. **Webhook-triggered service endpoint (later, only if needed)**  
   - Keep this out of v1 unless we decide we need a network-facing trigger surface. The current preferred architecture is a local module plus thin wrapper, not a new always-on service dedicated to feed runs.

**Avoid** depending on a second “monitoring agent” as the **only** safety net: it adds nondeterminism and cost. Use an agent to **kick off** or **summarize** a failed log if you want; use **cron + checks** for whether the business event happened.

### How to alert TGA and CIQ when something is wrong

Separate **“job failed”** from **“job didn’t run.”**

- **On failure**: The orchestrator (or wrapper script) catches errors and sends one structured notification: run id, step, error class, and **no secrets**. Channels often used: Slack incoming webhook, email via provider API, or PagerDuty/Opsgenie if severity warrants it.
- **On missed schedule**: A **freshness checker** runs on an independent schedule (for example daily) and verifies that within the last **N** days there is a new successful `summary.json` (or manifest updated). If not, alert with the last successful run timestamp, for example: “No successful product-feed run since {last_summary_timestamp}.” This checker can be GitHub Actions, a tiny cron container, or CIQ-owned monitoring if they have bucket read access to `outgoing/curated/`.

**Sharing proof with CIQ**: For v1, use `summary.json` and curated outputs as the shared proof surface. Grant read access to `outgoing/curated/` if appropriate, or export the latest `summary.json` to them via email or Slack so they can correlate with their feed delivery. Treat Railway application logs as an internal operator surface unless we explicitly add S3-hosted run logs to the contract later.

### Minimal monitoring checklist (v1)

- [ ] Every run writes **`summary.json`** with counts and source key.  
- [ ] Railway (or host) retains logs long enough to debug the last failed run.  
- [ ] **Freshness** job: alert if no successful run by **cutoff** after the expected biweekly drop.  
- [ ] **Anomaly** rule: alert if `filteredRowCount` is outside agreed bounds compared to the previous run.  
- [ ] Runbook line: who is paged first (TGA vs CIQ) and what information to attach (run id, log excerpt, `summary.json`).

## Future extensions (do not implement yet)

- Direct DuckDB S3 reads with `httpfs`
- Rule manifests and dated rule snapshots in S3 (partially specified in the Shopify feed curation skill; promote to first-class when implemented)
- Partitioned feeds
- Cross-account AssumeRole
- Full event-driven runs (S3 notifications → queue → worker) in addition to cron
