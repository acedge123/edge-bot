---
name: square
description: Square integration and read-only exploration for The Gig Agency. Use when working with Square credentials in Railway env vars, validating API access, inspecting locations/customers/catalog/team/labor data, or checking whether Square exposes payroll-related data such as Tennessee forms LB-0456 and LB-0851.
---

# Square

## Use this skill

Use Square credentials from the local Railway env, not pasted secrets. Prefer read-only probes first.

## What Square exposes here

- Locations
- Customers
- Catalog
- Team / labor / timecards
- Payroll-adjacent reporting through labor data
- Shopify theme management via Repo C / key-vault executor if the tenant has Shopify credentials provisioned

## Important payroll note

Square's public API does **not** appear to expose Tennessee payroll report objects for **LB-0456** or **LB-0851** as direct API resources.
These are Tennessee unemployment forms handled in Square Payroll / Dashboard workflows.

If the user asks for those report IDs, search for them in Square Payroll/Dashboard first, then fall back to Labor API data if the report object is not available via API.

## Shopify note

If the user asks about Shopify after Square exploration, do not conflate the systems.

For Repo C / key-vault executor work, theme reads and edits are now live when the tenant has credentials and the current action catalog includes:

- `themes.list`
- `themes.get`
- `themes.files.list`
- `themes.files.get`
- `themes.files.upsert`
- `themes.files.copy`
- `themes.files.delete`
- `themes.publish`

Observed response shapes:
- `themes.files.list` → `{ files, pageInfo, theme }`
- `themes.files.get` → `{ file: {...} }`

Theme file actions require `theme_id` and usually a file path/name.

## Workflow

### 1) Verify credentials

Check the expected env vars before probing:

- `SQUARE_ACCESS_TOKEN`
- `SQUARE_APPLICATION_ID`

If they are missing, say so clearly.

### 2) Confirm basic API access

Probe read-only endpoints first:

- `GET /v2/locations`
- `GET /v2/customers`
- `GET /v2/catalog/list`
- `POST /v2/labor/timecards/search`

Use Square version `2025-05-21` when working with Labor API timecards.

### 3) Payroll-oriented exploration

For payroll questions, use the Labor API as the main source of truth:

- team member wage/job info
- timecards
- breaks / declared tips
- location and date range filters

Treat Labor API data as payroll-adjacent data, not payroll filing output.

### 4) Report IDs like LB-0456 / LB-0851

If the user provides Tennessee report IDs:

- treat them as Dashboard / payroll filing artifacts
- do not assume they are API endpoints
- confirm whether the account has any payroll UI/export access before trying to map them

## Notes from prior exploration

- Production read access worked for locations, customers, catalog, and labor timecards.
- `POST /v2/labor/timecards/search` returned timecard records successfully.
- `/v2/payroll` and `/v2/payroll/reports` were not public API endpoints in this exploration.
- The account's payroll-relevant data is most likely reachable through Labor API timecards, not direct payroll report endpoints.

## When responding

- Be explicit about whether a requested item is available via API or only in Square Payroll/Dashboard.
- If a report is not exposed, say what can be retrieved instead and what would be needed to get the original report.
