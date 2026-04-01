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

## Future extensions (do not implement yet)

- Direct DuckDB S3 reads with `httpfs`
- Rule manifests and dated rule snapshots in S3
- Partitioned feeds
- Cross-account AssumeRole
- Scheduling, cron or event-driven
