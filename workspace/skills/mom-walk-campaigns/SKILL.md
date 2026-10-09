---
name: "mom-walk-campaigns"
description: "Find communities and partner brands, create or edit draft pre-campaign interest checks and unquoted sampling/seeding/IRL gifting requests, and read status and hand-raise counts. Also routes discount-deal requests to supported Mom Walk tools."
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
`communities: [{id,name,state,location,member_count,ambassador_count}]`.
Limit defaults to 25, maximum 500. Optional `sort: "members"` requests largest
member counts first; omit it for default alphabetical name ordering.

```bash
brand-connect-campaigns communities.search --params-json '{"query":"TX","sort":"members","limit":500}'
```

For the largest 20, take the first 20 returned rows after confirming the counts
are numeric and descending. Sum `ambassador_count` for those selected rows;
do not confuse it with `member_count` or assume one ambassador per community.
Counts describe communities, not guaranteed campaign recipients.
For multiple states, search each state separately (up to 500 results per call).
Search matches names, locations, and states, so verify each row's `state`
against the intended state before selection. If filtering leaves fewer than 20
rows, report that limitation instead of claiming a complete statewide top 20.
Deduplicate community IDs when combining results. Report when the requested limit
is reached; this endpoint does not expose pagination for community search.

Select the intended rows, clarifying ambiguous matches with the requester.
Never fabricate IDs or substitute a similar city. For a test community, search
its name and verify the actual row; there is no automatic test fallback.

### Radius Search

Use the same action with a numeric `radius_miles` greater than 0 and at most
250. Supply either an anchor `query`, or both numeric `lat` (-90 to 90) and
`lng` (-180 to 180). Do not combine a name and coordinates. Coordinates require
a radius; a normal text lookup still needs only `query`. Limits remain 1-500
(default 25); fractional radii and coordinates are supported.

```bash
brand-connect-campaigns communities.search --params-json '{"query":"Scottsdale","radius_miles":25,"limit":500}'
brand-connect-campaigns communities.search --params-json '{"lat":33.49,"lng":-111.92,"radius_miles":25,"limit":500}'
```

These map to `?communities=Scottsdale&radius_miles=25&limit=500` or
`?lat=33.49&lng=-111.92&radius_miles=25&limit=500`. The response preserves
`anchor: {name?,lat,lng}`, effective `radius_miles`, `count`, and communities
with `distance_miles`, `member_count`, and `ambassador_count`. Default radius
ordering is nearest-first; optional `sort: "members"` orders by largest member
count instead, without removing distance values. Do not claim nearest-first
ordering when requesting member sorting.

Confirm the returned anchor name/coordinates and radius against the requested
town before selecting campaign communities. The API prefers an exact name but
can choose the first partial match; a successful response is not proof of the
right town. If ambiguous, clarify or use confirmed coordinates, never invent
coordinates or silently accept another anchor. A name without coordinates can
return 404; explain this rather than substituting a different town.
Radius results may cross state lines, so apply a state restriction only when
requested, not automatically. Communities without coordinates are excluded;
distances are rounded geographic distances, not driving distances. Report when
the requested result limit is reached; do not claim exhaustive geographic
coverage or all moms within the radius. These are community centers and counts,
not individual member locations or confirmed campaign recipients.

## Resolve the Existing Brand

```bash
brand-connect-campaigns brands.search --params-json '{"query":"good crisp"}'
brand-connect-campaigns brands.resolve-email --params-json '{"brand_email":"billing@brand.com"}'
```

These map to `GET ?brands=...` and `GET ?brand_email=...`. Brand rows include
`id`, `name`, and `primary_email` (possibly null). Prefer name search and pass
the returned `brand_account_id`: some accounts have no primary email. Multiple
matching accounts require disambiguation; do not silently pick the first one.
Prefer an existing account when the intended brand matches. If no match exists,
the same campaign call can create a pipeline brand with explicit permission;
see below. A portal user is not required to submit or quote the request, but
one must sign up at `https://momwalkpartners.com` or be linked in Admin Users
before the brand can approve the quote.

## Create a Missing Pipeline Brand

First search by name and optionally email. Resolve ambiguous existing matches
instead of creating another brand. Confirm the spelling with the requester:
`Alan's` and `Allen's` are different names. Preserve the confirmed spelling.

Use `brand_name` (1-200 characters), `create_brand: true`, optional `brand_email`
(max 255 characters), and optional `brand_website` (HTTPS, max 500) in the same
campaign submission. Do not pass an existing `brand_account_id` with creation
enabled. Obtain permission to create the pipeline record and submit the quote
request; the latter sends an admin notification. Creation requires the extra
`--confirm-brand-name` flag to match the trimmed name exactly, including case.
The client never sets `create_brand` automatically.

```bash
brand-connect-campaigns requests.create \
  --params-json '{"brand_name":"Confirmed Brand","create_brand":true,"request_type":"sampling","product_name":"Confirmed product","community_ids":["<resolved-community-uuid>"],"ambassadors_only":true}' \
  --confirm-target 'Confirmed Brand' --confirm-brand-name 'Confirmed Brand'
```

If `brand_email` is supplied, `--confirm-target` must match that email instead;
the exact name still needs `--confirm-brand-name`. Without email, confirm the
name as above. Include all confirmed campaign fields and the complete resolved
community IDs; do not substitute example IDs or assume the Will Call Test's
20 IDs are available. Copy them only from trusted request data and verify them.

The backend reuses a matching existing brand; only a missing brand is inserted
at pipeline stage `interested`. Report `brand_created` and `brand_account_id`
from the response, not an assumed new account. The request remains `submitted`.
No portal user or login is created. The brand cannot approve its quote until
someone signs up or is linked in Admin Users; admins can quote in the meantime.

This client supports the one-step endpoint, so do not bypass it with a separate
`/admin-agent-ops/brands` call. A failed submission may still have created the
brand: re-run lookups and check Admin Requests before retrying any write.

## Submit a Quote Request

Read `standard-offerings.md` when selecting an offering or discussing an estimate.
Seeding uses cumulative incremental bands, not a single volume rate applied to
all communities: first 10 at $500 each, next 20 at $300 each, remaining at $200.
Set `request_type` explicitly on **every normal RFQ submission**: it is the field that
selects the offering and suggested quote pricing, not the campaign title.
Use exactly `sampling`, `seeding`, or `irl_gifting`. The portal auto-labels the
request from that value and the product name. PATCH may omit it to retain the
existing offering; changing a title alone does not switch offerings.
For Sampling, obtain a confirmed `target_recipients` before submission or an
estimate; it is required in practice for the $2-per-item-per-mom calculation,
even though the API schema permits omission. Product value and shipping are
separate. No charge occurs at submission; admin quoting and brand approval
remain required. Estimates are not a quote or permission to charge.

Collect the fields in `intake-template.md`. Required: a resolved brand ID,
email, or confirmed brand name, `request_type` (`sampling`, `seeding`, `irl_gifting`), `product_name`
(1-200 characters), and 1-500 resolved `community_ids`.

Optional fields: `product_description` and `instructions` (up to 4000 characters),
`product_url` (HTTPS, up to 500 characters), `product_image_url` (HTTPS, up to
1000), `target_recipients` (integer 1-1,000,000), `start_date`, `end_date`
(YYYY-MM-DD; end not before start), and `ambassadors_only` (boolean; default false).
Omit unknown optional values rather than inventing them.

### Campaign Photo

Set `product_image_url` on creation or an editable request's PATCH. Use a public,
non-expiring HTTPS link to an 800x400 (2:1) JPG, PNG, or WebP image under 500 KB.
Do not use signed/expiring links, login-protected URLs, or an HTML page instead
of an image. Verify access and image dimensions/size when possible; otherwise
report those properties as unverified. The client validates the URL, not its
contents, dimensions, expiry, or file size.

The portal now forwards this field automatically as `image_url` in both admin
interest-check sends and accepted-quote official campaign sends. The photo
appears above the opportunity text. Do not pass `image_url` to this client;
it is a downstream handoff field, not an agent submission parameter. Keep the
same approval/admin-send gates: adding a photo does not authorize sending.
Null photo removal is not supported by the agent's current PATCH schema;
ask an admin to remove it rather than sending null or inventing a clearing field.

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

## Prepare a Pre-Campaign

For gauging interest, use the same `requests.create` with `stage: "pre_campaign"`.
Omit stage for a normal RFQ, or explicitly use `stage: "rfq"`. Confirm the intended
mode with the requester; do not substitute an RFQ for an interest check.
Resolve brand and communities and obtain submission confirmation as above;
creation still notifies admins. Product name and 1-500 real community IDs remain
required. `request_type` is optional in this mode; omit it if undecided rather
than guessing Sampling. If supplied, use one of the three supported offerings.
Optional `interest_deadline` is a real YYYY-MM-DD date. Other campaign fields
and brand-creation confirmation rules still apply. Do not calculate a price
estimate for a pre-campaign, even when an offering or recipient count is supplied.

```bash
brand-connect-campaigns requests.create \
  --params-json '{"stage":"pre_campaign","brand_account_id":"<resolved-brand-uuid>","product_name":"Confirmed product","community_ids":["<resolved-community-uuid>"],"interest_deadline":"2026-11-15"}' \
  --confirm-target '<resolved-brand-uuid>'
```

Creation returns `status: "submitted"`, `stage: "pre_campaign"`; this is a saved
interest-check draft, not an RFQ awaiting a quote. Run `requests.get` afterward
and report `request.interest_status` (initially `draft`) and the returned ID.
GET also returns `interest: {total, by_community}` outside `request`.
Each community entry contains `community_name`, `moms`, and `ambassadors`;
sum those counts for role totals. These are non-withdrawn hand raises, not
guaranteed recipients or completed deliveries. Report absent data as unavailable,
not zero. The API does not return each person's name; those are visible in Admin.
GET exposes `interest_deadline`, `converted_to_draft_id`, and
`converted_from_draft_id` when available, so follow returned IDs without guessing.

Admin Requests tags/filters these as Pre-campaign; brands see Gauging interest
with nothing to approve. Admins can close the interest check or convert it to a
separate linked normal request, optionally keeping only communities with hand
raises. Conversion copies campaign fields; the resulting RFQ still requires an
offering, admin quote, brand approval, and admin send. This client has no send,
close, or conversion actions; stage cannot be changed through PATCH. Do not
simulate conversion by submitting a duplicate RFQ or bypass the admin controls.

The portal's send functions now include the photo. Saving a pre-campaign still
does not send anything or start collecting interest. Do not treat deployed
portal functions or the API's `next_step` as proof of Mom Walk receiver availability.
The handoff doc still describes an unavailable popup if the receiver returns
404. Report actual admin send success/failure when available; do not claim
delivery until verified. Agent calls remain submission/update/lookup only.

## Status and Human Gates

```bash
brand-connect-campaigns requests.get --params-json '{"id":"<returned-request-uuid>"}'
```

This maps to `GET ?id=...`, returning `response.request` with current status.
For normal RFQs, only the admin quote -> brand approval -> admin Send to Mom Walk flow
may move the request onward. The client exposes no approval, activation,
participant-notification, or onward-send actions.

HTTP 400 can identify unknown communities in `missing`; re-resolve them.
401 means missing/wrong key: stop and report the configuration issue.
404 means brand/request absent; a missing brand can be created only through the
explicit creation workflow above. 409 may mean ambiguous brand matches (use
a resolved ID) or a quote lock on update. Missing portal users block quote
approval, not submission.
Do not blindly retry creation after a timeout, connection failure, or 5xx:
creation is not idempotent. Check Admin Requests for an existing record first.

## Update an Existing Agent Request

Use `requests.update` to correct the same request, not a new submission, while
a normal RFQ is **submitted and unquoted**, or a pre-campaign has
`interest_status: "draft"` and has not been converted. First run `requests.get`
with its real ID. The client re-reads it before writing and rejects non-draft
pre-campaigns (including unknown interest status) and converted records.
The backend additionally rejects requests not created via the agent API (403)
and any request with a quote/proposal (409), even if its status says submitted.
On a quote-lock error, stop and explain that a new request is needed; do not
automatically submit a duplicate or try another API to bypass the lock.

Send `id` plus only the intended changes. Supported fields: `product_name`,
`product_description`, `product_url`, `product_image_url`, `request_type`,
`community_ids`, `target_recipients`, `start_date`, `end_date`, `instructions`,
`ambassadors_only`, `brand_account_id`, `brand_email`, `brand_name`,
`brand_website`, `create_brand`, and `interest_deadline`. `stage` is creation-only.
The same limits and
validation as creation apply. At least one change is required. Omitted values
are not added by the client: in particular, omitted `ambassadors_only` does not
become false. Null is not supported as a clearing value; empty description or
instructions is accepted. Reassigning a brand requires resolving and confirming
the intended existing account first; prefer its ID.
To create a missing brand while reassigning an unquoted request, also follow the
pipeline creation workflow and pass `--confirm-brand-name`. `--confirm-target`
still matches the request ID for PATCH. Never turn creation on silently.

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

Pre-campaign PATCH caveat: if its offering is null and `request_type` is omitted,
the backend currently defaults it to Sampling and may relabel the record. Do not
silently choose an offering just to edit it. Warn the requester and obtain
confirmation, or ask an admin to edit it in the portal. Stage remains pre-campaign;
this does not authorize an estimate, quoting, or delivery. PATCH's `next_step`
currently mentions quoting even for pre-campaigns; use a fresh GET's stage and
interest status when reporting the actual workflow.

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
