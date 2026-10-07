# Mom Walk Standard Offerings

Agent reference supplied by the Mom Walk team. These are suggested service
rates, not a binding quote or a charge. An admin attaches the actual quote.

`request_type` is required on POST, optional on PATCH, and must be one of the
three lowercase values below. This field selects the offering and suggested
pricing. The campaign title does not drive pricing. The portal auto-labels the
request, for example `Seeding: <product>`.

| request_type | Offering | What it is | Suggested service price |
| --- | --- | --- | --- |
| `sampling` | Sampling | Free item shipped to each individual mom and ambassador | $2.00 per item per mom |
| `seeding` | Seeding | Product sent to community ambassadors in exchange for a social post; suitable for higher-ticket items such as a stroller | Per community: $500 for 1-10 communities; $300 for 11-30; $200 for 31+ |
| `irl_gifting` | IRL Gifting | Gifts for ambassadors plus mom giveaways at a real Mom Walk event, with social posts and an in-person product demo | $400 per event, per community |

## Estimate From the Request

- Sampling: confirmed `target_recipients` multiplied by $2.00. Do not substitute
  community or ambassador counts for the selected recipient count. The supplied
  formula assumes one item per recipient; ask an admin to quote multi-item scope.
- Seeding: count unique resolved `community_ids`, choose the applicable tier,
  then multiply the rate by that community count, not by ambassador count.
  For example, 20 communities at $300 each suggests $6,000.
- IRL Gifting: unique resolved community count multiplied by $400 for one event
  per community. More events need an admin quote; the request has no event-count
  field. For example, 20 communities suggests $8,000 for that scope.

**Seeding tier boundaries are inclusive:** exactly 30 communities uses $300
per community, suggesting $9,000. The $200 rate starts at 31 communities,
suggesting $6,200 for 31. Rates are estimates, not charges: submission creates
a `submitted` RFQ and an admin attaches the actual quote.

Product value and shipping are always separate from these service rates.
Never present them as included, invent their cost, or call the estimate paid.

## Submission Inputs and Gates

- Resolve real community IDs first using `communities.search`, optionally
  `sort: "members"`; search each state separately and verify selected states.
- Set `request_type` explicitly and include product name and `community_ids`.
- Obtain `target_recipients` for Sampling even though the API makes it optional.
- `ambassadors_only` optionally restricts recipients to ambassadors; it does
  not choose the offering or replace its pricing formula.
- Identify the brand by `brand_account_id`, `brand_email`, or `brand_name`.
  Pipeline creation requires confirmed `create_brand: true` and exact-name
  permission through the reviewed client. `brand_website` is optional.
- No charge occurs at submission. It becomes a `submitted` RFQ: admin quote ->
  brand approval -> admin sends to Mom Walk. Do not auto-approve or send.
- PATCH can edit the same agent-created request only while submitted/unquoted.
  Omitting `request_type` retains the offering. After a quote exists, stop and
  obtain permission for a new request instead of bypassing the quote lock.

Use the reviewed `brand-connect-campaigns` executable and confirmation flags
described in `SKILL.md`, not raw POST/PATCH calls. For a Will Call Test request,
reuse only confirmed actual fields and the actual 20 community IDs; placeholder
IDs and the spelling of Alan's/Allen's must not be guessed.
