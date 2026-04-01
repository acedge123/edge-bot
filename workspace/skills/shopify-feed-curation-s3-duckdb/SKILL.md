---
name: shopify-feed-curation-s3-duckdb
description: Use when an agent needs to curate a small Shopify-ready product feed from a much larger catalog stored in Amazon S3, using AWS SDK stream download plus local DuckDB and deterministic rules such as SKU allowlists, blocklists, tags, vendors, status, inventory, or price filters.
---

# Shopify Feed Curation from S3 with DuckDB

Use this skill when the job is operational feed curation, not warehouse analytics. For a catalog around hundreds of thousands of SKUs on a biweekly cadence, default to `S3 + local DuckDB` instead of building a full database.

## Decision

Default to DuckDB for this workflow.

Why:

- embedded engine, no extra service to deploy
- strong SQL ergonomics for curation and validation logic
- fast enough for large batch feeds
- easy to emit both CSV and Parquet
- fits a simple operational path: `S3 download -> local normalize -> curate -> upload`

For the first implementation on Railway, prefer:

1. AWS SDK stream download from S3 to local disk
2. local DuckDB normalization and filtering
3. upload curated artifacts back to S3

Do not make direct DuckDB S3 reads the first implementation. `httpfs` can remain a later optimization once the local-disk path is proven in the hosted container.

## When to use

Use this skill if most of the logic is:

- exact SKU includes or excludes
- vendor, product-type, or tag matching
- simple status, inventory, or price rules
- writing a curated subset back to S3 for a downstream Shopify loader

Do not default to a full database unless the user needs shared ad hoc querying, multi-system access, historical analytics across many feed versions, or complex relational joins.

## Recommended storage layout

Keep the bucket structure explicit:

```text
s3://<bucket>/
  incoming/
    raw/<YYYY-MM-DD>/full-feed.tsv
    normalized/<YYYY-MM-DD>/full-feed.parquet
  rules/
    active/
      allowed_skus.csv
      blocked_skus.csv
      allowed_tags.csv
      allowed_vendors.csv
      config.json
    versions/<YYYY-MM-DD>/
  working/
    <run-id>/
  outgoing/
    curated/<YYYY-MM-DD>/
      shopify-feed.csv
      shopify-feed.parquet
      summary.json
  logs/
    <run-id>.log
    <run-id>-summary.json
```

Bucket guidance:

- `incoming/raw/` is the client drop zone
- `incoming/normalized/` stores Parquet copies of raw feeds
- `rules/active/` holds the rules for the next run
- `rules/versions/` snapshots the exact rule files used for reproducibility
- `working/` is optional scratch space for intermediate artifacts
- `outgoing/curated/` is the Shopify handoff location
- `logs/` stores row counts, source paths, warnings, and run metadata

## Preferred file flow

Use this sequence:

1. Read the newest authoritative source feed from `incoming/raw/` or a manifest
2. Stream the source feed down from S3 to local disk
3. Normalize the raw feed to Parquet with DuckDB
4. Load the active rule files from `rules/active/`
5. Filter with DuckDB
6. Validate row counts, duplicate SKUs, and required Shopify fields
7. Write the curated feed to `outgoing/curated/<date>/`
8. Write a JSON summary and log entry to `logs/`
9. Return the curated S3 path to the downstream Shopify ingestion tool

Prefer a manifest file when available so the agent does not guess the current source feed:

```json
{
  "current_source_feed": "incoming/raw/2026-03-15/full-feed.tsv",
  "normalized_feed": "incoming/normalized/2026-03-15/full-feed.parquet",
  "rule_version": "rules/versions/2026-03-15/"
}
```

## Real sample feed notes

The current sample client feed is tab-delimited and already Shopify-shaped.

Observed columns include:

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

Important notes from the sample:

- there is no `COLLECTION` column in the current sample
- the handle field is `URL_HANDLE`
- the feed appears to be variant-level, not one row per product
- multiple rows can share the same handle, so report both distinct `sku` and distinct `url_handle`

## Schema normalization

Normalize column names before filtering so the logic stays stable:

- lowercase all column names
- replace spaces with underscores
- keep canonical fields such as `url_handle`, `sku`, `title`, `description`, `vendor`, `price`, `inventory_quantity`, and `google_shopping_availability`
- standardize tag delimiters if upstream formatting varies

Suggested canonical mapping from the current sample:

- `URL_HANDLE` -> `url_handle`
- `TITLE` -> `title`
- `DESCRIPTION` -> `description`
- `VENDOR` -> `vendor`
- `PRODUCT_CATEGORY` -> `product_category`
- `TYPE` -> `type`
- `TAGS` -> `tags`
- `PUBLISHED` -> `published`
- `STATUS` -> `status`
- `SKU` -> `sku`
- `PRICE` -> `price`
- `INVENTORY_QUANTITY` -> `inventory_quantity`
- `CONTINUE_SELLING_WHEN_OUT_OF_STOCK` -> `continue_selling_when_out_of_stock`
- `PRODUCT_IMAGE_URL` -> `product_image_url`
- `VARIANT_IMAGE_URL` -> `variant_image_url`
- `GOOGLE_SHOPPING_AVAILABILITY` -> `google_shopping_availability`

Preserve the original Shopify-compatible columns in the curated CSV unless the downstream loader requires a narrower contract.

## Rule model

Treat inclusion as broad and exclusion as authoritative.

Include a product or variant if any of these are true:

- SKU is in `allowed_skus.csv`
- vendor matches `allowed_vendors.csv`
- tags match `allowed_tags.csv`
- product type matches configured values

Then exclude a product or variant if any of these are true:

- SKU is in `blocked_skus.csv`
- product is inactive or discontinued
- required Shopify fields are missing
- product fails configured price or inventory rules

Snapshot `rules/active/` into `rules/versions/<date>/` before each run.

## Inventory rule guidance

Keep inventory filtering in the design even though the sample file is not representative.

For the real feed, assume inventory becomes meaningful and we want at minimum to exclude:

- `inventory_quantity < 0`

For now:

- use `minInventory = 0` as the baseline rule
- keep `inStockOnly` configurable rather than forcing it on
- if testing against the current sample, either disable `inStockOnly` or modify fixture rows to positive inventory

If a future real feed proves that `GOOGLE_SHOPPING_AVAILABILITY` is more reliable than `INVENTORY_QUANTITY`, make that precedence explicit in the SQL.

## DuckDB workflow

DuckDB is the default engine because it is embedded, fast, easy to run on a schedule, and well suited to local file processing.

Typical runtime shape:

- Python or Node orchestrates the run and S3 path selection
- AWS SDK downloads the source feed to local disk
- DuckDB reads the local TSV or CSV and writes normalized Parquet
- SQL applies the curation rules
- DuckDB or the orchestrator writes the curated output back to S3
- the orchestrator writes summary JSON and logs

## Example SQL

Use this as a starting point, then adapt it to the real source schema:

```sql
CREATE OR REPLACE TABLE feed AS
SELECT *
FROM read_parquet('/local/path/full-feed.parquet');

CREATE OR REPLACE TABLE allowed_skus AS
SELECT sku
FROM read_csv_auto('/local/path/rules/allowed_skus.csv');

CREATE OR REPLACE TABLE blocked_skus AS
SELECT sku
FROM read_csv_auto('/local/path/rules/blocked_skus.csv');

CREATE OR REPLACE TABLE allowed_tags AS
SELECT tag
FROM read_csv_auto('/local/path/rules/allowed_tags.csv');

CREATE OR REPLACE TABLE curated AS
SELECT DISTINCT f.*
FROM feed f
LEFT JOIN blocked_skus b
  ON f.sku = b.sku
WHERE b.sku IS NULL
  AND (lower(f.status) = 'active' OR f.status IS NULL)
  AND (f.inventory_quantity IS NULL OR f.inventory_quantity >= 0)
  AND (
    f.sku IN (SELECT sku FROM allowed_skus)
    OR lower(f.vendor) IN ('j.crew')
    OR EXISTS (
      SELECT 1
      FROM allowed_tags t
      WHERE lower(f.tags) LIKE '%' || lower(t.tag) || '%'
    )
  )
ORDER BY f.sku;
```

Write the curated result back to S3 in the format the Shopify loader expects. Prefer writing both:

- CSV for the Shopify ingest tool
- Parquet for internal reuse and future Athena compatibility

## Validation checks

Always record:

- source feed path used
- rule snapshot path used
- input row count
- curated row count
- excluded row count
- duplicate SKU count
- distinct handle count
- rows missing required Shopify fields
- warnings about schema drift or parsing issues

Minimum validation queries:

```sql
SELECT COUNT(*) AS output_rows FROM curated;
SELECT COUNT(*) - COUNT(DISTINCT sku) AS duplicate_skus FROM curated;
SELECT COUNT(DISTINCT url_handle) AS distinct_handles FROM curated;
```

If the feed is unexpectedly empty, stop and report instead of publishing a blank output.

## Output contract

The run should produce:

- a curated feed in `outgoing/curated/<date>/shopify-feed.csv`
- optionally `outgoing/curated/<date>/shopify-feed.parquet`
- a summary file in `outgoing/curated/<date>/summary.json`
- a log or run report in `logs/`

The agent should return the final curated S3 path clearly so the next tool can consume it.

## IAM and access

The runtime needs, at minimum:

- `s3:ListBucket`
- `s3:GetObject`
- `s3:PutObject`

It must be able to read:

- `incoming/`
- `rules/`

And write:

- `outgoing/`
- `logs/`
- optionally `working/`

## Decision guidance

Default to DuckDB for this workflow.

Move to Athena later if the curated catalog becomes a shared, analyst-facing asset and multiple users need query access.

Move to a full database only if the business starts needing:

- historical catalog intelligence across many runs
- APIs or app-style query patterns over the master feed
- multi-source joins that no longer fit a file-oriented job cleanly
- near-real-time access instead of biweekly batch processing

## Implementation notes

- Prefer Parquet over repeated raw delimited scans once the raw file lands
- Keep the rule files human-editable
- Use dated folders so every run is reproducible
- Avoid guessing the latest file when a manifest can define it
- Keep the pipeline simple: `raw -> local normalize -> curated -> Shopify`
- Treat collection-based rules as optional future support unless the real feed or a secondary source provides collection data
