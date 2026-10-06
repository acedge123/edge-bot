---
name: "mom-walk-campaigns"
description: "Find communities and existing partner brands, submit or update unquoted sampling/seeding/IRL gifting quote requests, and check request status. Also routes discount-deal requests to supported Mom Walk tools."
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
This client only selects existing brand accounts. The backend also supports
pipeline-brand creation, but that separate capability is not exposed here.

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

## Update an Existing Agent Request

Use `requests.update` to correct the same request, not a new submission, while
it is still **submitted and unquoted**. First run `requests.get` with its real
ID. The client also re-reads it before writing and rejects other statuses.
The backend additionally rejects requests not created via the agent API (403)
and any request with a quote/proposal (409), even if its status says submitted.
On a quote-lock error, stop and explain that a new request is needed; do not
automatically submit a duplicate or try another API to bypass the lock.

Send `id` plus only the intended changes. Supported fields: `product_name`,
`product_description`, `product_url`, `product_image_url`, `request_type`,
`community_ids`, `target_recipients`, `start_date`, `end_date`, `instructions`,
`ambassadors_only`, `brand_account_id`, and `brand_email`. The same limits and
validation as creation apply. At least one change is required. Omitted values
are not added by the client: in particular, omitted `ambassadors_only` does not
become false. Null is not supported as a clearing value; empty description or
instructions is accepted. Reassigning a brand requires resolving and confirming
the intended existing account first; prefer its ID.

**`community_ids` is a full replacement**, never an append. Resolve every
community to keep/add, show the complete resulting set and explain removals,
then get confirmation for the exact request ID and proposed changes.

```bash
brand-connect-campaigns requests.update \
  --params-json '{"id":"<request-uuid>","target_recipients":500}' \
  --confirm-target '<request-uuid>'
```

This sends PATCH to the same endpoint. Success is HTTP 200 with `id`, `status`,
`updated_fields`, `request`, and `next_step`, wrapped in the client's `response`.
The API records request history: `Updated via agent API - fields: ...` (the
displayed punctuation may differ). Updating is not approval or onward delivery.

Backend caveat: PATCH currently rewrites admin `brand_notes` even when
`instructions` is omitted, so earlier instructions can be lost. If the request
had instructions, obtain their current text from the requester/admin and include
the confirmed text to retain it. GET does not expose those notes; do not invent
them or assume omission preserves them. Report this caveat before updating.

After PATCH, run `requests.get` again. Compare the ID, product name, brand ID,
request type, target recipients, community count, and dates against the intended
values wherever returned. GET does not return community membership IDs,
description, links, instructions, or ambassadors-only, so use `updated_fields`
as API acknowledgement for those fields and ask the admin to verify their exact
saved values in Requests. Do not claim independently verified values that GET
does not expose. Report the ID, status, changed fields, and any unverified values.
If verification fails, stop and report it; do not send onward or create a duplicate.
Timeouts/5xx can have partial effects: read the request and check history before
any retry. Every PATCH may add another history entry.

## Discount Deals Are Separate

For discount/deal management, load `mom-walk-manage` and inspect its reviewed
registry. If create/pause actions are unavailable, report the missing capability;
do not improvise HTTP calls or publish an active deal before pausing it.
Do not translate a discount deal into a sampling quote request without asking.

Never expose API keys. Lookup results are authoritative, not static workspace
lists. Do not create a real or test request merely to validate this skill.
