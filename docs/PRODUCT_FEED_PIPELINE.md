# Product Feed Processing Pipeline (S3 → DuckDB → Curated Output)

## Overview

Build a robust, Railway-compatible **batch pipeline** to:

1. Download large CSV product feeds from S3 (**streamed to disk**, not in-memory)
2. Process them using **DuckDB SQL**
3. Filter to a curated subset (~5K SKUs) based on dynamic rules
4. Output a smaller dataset (**CSV and/or Parquet**)
5. Optionally upload the result back to S3
6. Expose the pipeline as a **callable module/service** for the hosted agent

This is a **batch data pipeline**, not a request/response API path.

## Environment context

- Runs on **Railway** in the hosted agent container
- AWS access is configured via **IAM Roles Anywhere** (credential_process)
- Expected env vars (already used by the hosted image/entrypoint):
  - `AWS_REGION` (or `AWS_DEFAULT_REGION`)
  - `RA_CERT_PEM`, `RA_KEY_PEM`, `RA_TRUST_ANCHOR_ARN`, `RA_PROFILE_ARN`, `RA_ROLE_ARN`

Assume AWS credentials are already working.

## CIQ S3 access (granted)

CIQ provisioned a bucket and granted access to the Railway agent role:

- **Bucket ARN**: `arn:aws:s3:::ciq-thegig-agency`
- **Role ARN**: `arn:aws:iam::520256012531:role/railway-claw-base-role`

Minimal validation (read-only):

- `ListObjectsV2` on `ciq-thegig-agency` (optionally under a known prefix)
- `HeadObject` for a known key (if provided)

## Key constraints

- **Do not** load the entire CSV into memory
- **Must** stream S3 downloads to **disk**
- **Must** use **DuckDB SQL** for filtering (no JS row iteration)
- **Must** support large files (e.g. ~600K SKUs)
- **Must** be safe to run repeatedly (idempotent-ish, bounded, clean-up aware)

## Architecture

```text
S3 (CSV)
  ↓
Stream download → local file (Railway volume preferred; /tmp fallback)
  ↓
DuckDB query (read_csv_auto)
  ↓
Filtered dataset (~5K rows)
  ↓
Write output CSV / Parquet
  ↓
Optional upload to S3
```

## Working directory layout

Prefer a persistent volume path; fall back to `/tmp` if no volume exists.

Example structure:

```text
/data/feeds/{timestamp_or_run_id}/
  inbound/
    source.csv
  outbound/
    curated.csv
    curated.parquet
  run.json
  duckdb.log
```

Operational notes:

- Add a retention policy (keep last N runs / purge runs older than X days)
- Enforce max inbound size if using `/tmp`

## Modules (contracts)

### 1) `downloadS3File`

**Inputs**

- `bucket: string`
- `key: string`
- `localPath: string`

**Behavior**

- Use AWS SDK `GetObject`
- **Stream** response body to a file (no full buffering)
- Ensure parent directories exist
- Return metadata:
  - `path`
  - `size` if available (from headers or after write)

### 2) `runDuckDbFilter`

**Inputs**

- `inputCsvPath: string`
- `outputCsvPath: string`
- `outputParquetPath?: string`
- `rules: Rules`

**Behavior**

- Initialize DuckDB
- Create a `products` view/table using:

```sql
SELECT * FROM read_csv_auto('<inputCsvPath>', header=true);
```

- Log schema (e.g., `DESCRIBE` / `PRAGMA table_info`)
- Apply filtering logic (see below)
- Return:
  - `inputRowCount`
  - `filteredRowCount`
  - output paths
  - selected schema / columns

### 3) `uploadS3File`

**Inputs**

- `bucket: string`
- `key: string`
- `localPath: string`

**Behavior**

- Upload file to S3
- Return destination info (bucket/key, etag/version if available)

### 4) `processProductFeed` (orchestrator)

**Inputs**

- `sourceBucket: string`
- `sourceKey: string`
- `workingDir: string`
- `outputBucket?: string`
- `outputKey?: string` (or prefix)
- `rules: Rules`

**Flow**

1. Download source CSV (stream to disk)
2. Run DuckDB filter
3. Upload output(s) (optional)
4. Return structured result

**Return shape**

```json
{
  "success": true,
  "inputRowCount": 612443,
  "filteredRowCount": 4872,
  "inputPath": "/data/feeds/.../inbound/source.csv",
  "outputCsvPath": "/data/feeds/.../outbound/curated.csv",
  "outputParquetPath": "/data/feeds/.../outbound/curated.parquet",
  "outputBucket": "my-bucket",
  "outputKey": "curated/feeds/run-123/curated.csv",
  "schema": ["sku", "title", "price"]
}
```

## Filtering logic (initial)

### Rules object example

```json
{
  "collections": ["new arrivals", "spring"],
  "categories": ["tops", "dresses"],
  "tagsContains": ["gifting", "creator"],
  "minPrice": 25,
  "maxPrice": 250,
  "inStockOnly": true,
  "activeOnly": true,
  "limit": 5000
}
```

### SQL pattern (illustrative)

```sql
CREATE TABLE products AS
SELECT * FROM read_csv_auto('{{INPUT}}', header=true);

CREATE TABLE filtered AS
SELECT *
FROM products
WHERE 1=1
  AND (inventory_quantity > 0 OR inventory_quantity IS NULL)
  AND (lower(status) = 'active' OR status IS NULL)
  AND (
    lower(tags) LIKE '%gifting%' OR
    lower(collection) IN ('new arrivals', 'spring')
  )
LIMIT 5000;
```

## Output

### CSV

```sql
COPY filtered TO '{{OUTPUT_CSV}}' WITH (HEADER, DELIMITER ',');
```

### Parquet (optional)

```sql
COPY filtered TO '{{OUTPUT_PARQUET}}' (FORMAT PARQUET);
```

## Logging requirements

Log at minimum:

- source bucket + key
- local file paths (inbound/outbound)
- file sizes (inbound/outbound) if available
- row counts (before/after)
- output destinations if uploaded
- a stable `run_id` / timestamp

## Agent integration (critical)

The hosted agent should:

- decide filtering rules
- choose bucket/key (within allowed bounds)
- evaluate results

The pipeline should:

- execute deterministically
- enforce limits + safety
- return structured results for follow-up reasoning

### Preferred callable interface

```ts
await processProductFeed({
  sourceBucket,
  sourceKey,
  rules,
  outputBucket,
  outputKey
});
```

## Guardrails

- **Max output rows** default: `5000`
- Validate rules before execution
- Restrict allowed S3 buckets/prefixes (deny-by-default)
- No filesystem access outside the working dir
- Fail loudly if expected columns are missing (or introduce explicit column mapping)
- Avoid SQL injection: compile SQL from a whitelist of clauses; do not concatenate raw agent strings

## Test harness (smoke test)

Implement a small test that:

1. Downloads a **small** CSV fixture from S3
2. Runs DuckDB query
3. Writes filtered output
4. Logs counts + sample keys/rows

## Future extensions (do not implement yet)

- Direct DuckDB S3 reads (httpfs)
- Partitioned feeds
- Cross-account AssumeRole
- Scheduling (cron / event-driven)

