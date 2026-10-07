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
| `seeding` | Seeding | Product sent to community ambassadors in exchange for a social post; suitable for higher-ticket items such as a stroller | Incremental bands: first 10 communities at $500 each, next 20 at $300 each, every community beyond 30 at $200 each |
| `irl_gifting` | IRL Gifting | Gifts for ambassadors plus mom giveaways at a real Mom Walk event, with social posts and an in-person product demo | $400 per event, per community |

## Estimate From the Request

- Sampling: confirmed `target_recipients` multiplied by $2.00. Do not substitute
  community or ambassador counts for the selected recipient count. The supplied
  formula assumes one item per recipient; ask an admin to quote multi-item scope.
- Seeding: count unique resolved `community_ids`, not ambassadors, and price
  each community in its incremental band. Do not apply the final band's rate
  to the whole request. With `n` communities, the estimate is:
  `min(n,10)*500 + min(max(n-10,0),20)*300 + max(n-30,0)*200` dollars.
  For example, 20 communities suggests $5,000 + $3,000 = $8,000.
  Present one estimate line per nonempty band, matching the quote generator.
- IRL Gifting: unique resolved community count multiplied by $400 for one event
  per community. More events need an admin quote; the request has no event-count
  field. For example, 20 communities suggests $8,000 for that scope.

**Seeding is cumulative, not a volume discount applied retroactively.** Exactly
30 communities suggests 10 x $500 + 20 x $300 = $11,000. At 31, add 1 x $200
for $11,200. The total never steps backwards as communities are added.
Rates are estimates, not charges: submission creates a `submitted` RFQ and
an admin attaches the actual quote.

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
