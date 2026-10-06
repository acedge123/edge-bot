---
name: "mom-walk-campaigns"
description: "Find communities and existing partner brands, submit sampling/seeding/IRL gifting quote requests, and check request status. Also routes discount-deal requests to supported Mom Walk tools."
metadata:
  openclaw:
    requires:
      bins: [brand-connect-campaigns]
      env: [ENRICHMENT_AGENT_KEY]
---

# Mom Walk Campaigns

Use the root-owned `brand-connect-campaigns` client. Its approved endpoint is
`https://evthfmqawotwbbkxfxep.supabase.co/functions/v1/api-campaign-requests`.
Every call uses the same `ENRICHMENT_AGENT_KEY` bearer authentication as sponsor
outreach. Do not use the obsolete singular `api-campaign-request`,
`BRAND_PORTAL_API_KEY`, raw HTTP, or hand-built shell requests for this flow.

```bash
brand-connect-campaigns list-actions
```

## Resolve Communities First

Find real IDs by community name, city/location, or state:

```bash
brand-connect-campaigns communities.search --params-json '{"query":"denver","limit":25}'
```

This maps to `GET ?communities=denver&limit=25`. The response contains
`communities: [{id,name,state,location}]`. Limit defaults to 25, maximum 50.
Select the intended rows, clarifying ambiguous matches with the requester.
Never fabricate IDs or substitute a similar city. For a test community, search
its name and verify the actual row; there is no automatic test fallback.

## Resolve the Existing Brand

```bash
brand-connect-campaigns brands.search --params-json '{"query":"good crisp"}'
brand-connect-campaigns brands.resolve-email --params-json '{"brand_email":"billing@brand.com"}'
```

These map to `GET ?brands=...` and `GET ?brand_email=...`. Brand rows include
`id`, `name`, and `primary_email` (possibly null). Prefer name search and pass
the returned `brand_account_id`: some accounts have no primary email. Multiple
matching accounts require disambiguation; do not silently pick the first one.
The brand must already have a Mom Walk Partners account. If absent, ask the
brand to sign up at `https://momwalkpartners.com`, then retry the lookup.
This API never creates brand accounts.

## Submit a Quote Request

Collect the fields in `intake-template.md`. Required: a resolved brand ID or
email, `request_type` (`sampling`, `seeding`, `irl_gifting`), `product_name`
(1-200 characters), and 1-500 resolved `community_ids`.

Optional fields: `product_description` and `instructions` (up to 4000 characters),
`product_url` (HTTPS, up to 500 characters), `product_image_url` (HTTPS, up to
1000), `target_recipients` (integer 1-1,000,000), `start_date`, `end_date`
(YYYY-MM-DD; end not before start), and `ambassadors_only` (boolean; default false).
Omit unknown optional values rather than inventing them.

Show the selected brand, communities, product, type, and dates to the requester.
Obtain confirmation to submit: **creation sends an admin notification email**,
even though it does not deliver anything to Mom Walk participants.

```bash
brand-connect-campaigns requests.create \
  --params-json '{"brand_account_id":"<resolved-brand-uuid>","request_type":"sampling","product_name":"Confirmed product","community_ids":["<resolved-community-uuid>"],"ambassadors_only":false}' \
  --confirm-target '<resolved-brand-uuid>'
```

If using email only, confirm that exact email instead. When both are supplied,
the ID takes precedence and confirmation must match the ID.

Success is HTTP 201 with `{id,status:"submitted",brand,communities,next_step}`.
The client wraps API output as `{action,status,ok,response}`; read the record
from `response`. Report its ID and **submitted, awaiting admin quote** status.
Do not call it published, sent, approved, or a `pending` API status.

## Status and Human Gates

```bash
brand-connect-campaigns requests.get --params-json '{"id":"<returned-request-uuid>"}'
```

This maps to `GET ?id=...`, returning `response.request` with current status.
Only the normal admin quote -> brand approval -> admin Send to Mom Walk flow
may move the request onward. The client exposes no approval, activation,
participant-notification, or onward-send actions.

HTTP 400 can identify unknown communities in `missing`; re-resolve them.
401 means missing/wrong key: stop and report the configuration issue.
404 means brand/request absent; a new brand needs signup first.
409 may mean ambiguous email (use a resolved ID) or no brand portal user.
Do not blindly retry creation after a timeout, connection failure, or 5xx:
creation is not idempotent. Check Admin Requests for an existing record first.

## Discount Deals Are Separate

For discount/deal management, load `mom-walk-manage` and inspect its reviewed
registry. If create/pause actions are unavailable, report the missing capability;
do not improvise HTTP calls or publish an active deal before pausing it.
Do not translate a discount deal into a sampling quote request without asking.

Never expose API keys. Lookup results are authoritative, not static workspace
lists. Do not create a real or test request merely to validate this skill.
