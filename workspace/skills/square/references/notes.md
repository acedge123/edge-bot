# Square exploration notes

## Verified in The Gig Agency org

- `SQUARE_ACCESS_TOKEN` and `SQUARE_APPLICATION_ID` are expected to be present in the local Railway env.
- Read access worked for:
  - `GET /v2/locations`
  - `GET /v2/customers`
  - `GET /v2/catalog/list`
  - `POST /v2/labor/timecards/search`

## Payroll-related findings

- Square public API did not surface direct payroll report endpoints for:
  - `LB-0456` (Tennessee Premium Report)
  - `LB-0851` (Tennessee Wage Report)
- Those look like Square Payroll / Dashboard filing artifacts, not public API resources.
- For payroll data, use Labor API timecards, wages, team members, breaks, and declared tips.

## Useful API detail

- Labor API timecard access requires Square API version `2025-05-21` or later.
- `POST /v2/labor/timecards/search` is the main read endpoint for timecard history.
- `GET /v2/payroll` and `GET /v2/payroll/reports` were not valid public Square endpoints in this exploration.
