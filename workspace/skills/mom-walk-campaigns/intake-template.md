# Mom Walk Campaign Intake Template

Use this template whenever you want me to create a Mom Walk discount deal, a campaign request, or a temporary/test campaign.

## Trigger phrases

Use one of these or something close:

- Mom Walk campaign
- campaign request
- brand campaign setup
- discount code
- Mom Walk deal
- paused deal
- temporary campaign
- test campaign
- Agent test campaign
- create campaign template

## What I need before I act

### Deal flow

Provide all of these:

- `brand_name`
- `title`
- `category`
- `discount_text`
- `coupon_code`
- `brand_url`
- `expires_at`
- `description`
- `target_audience`

### Campaign request flow

Provide all of these:

- `brand_name`
- `brand_contact_email`
- `brand_contact_name` if you have one
- `campaign_title`
- `campaign_description`
- `assignment_type`
- `campaign_start_date`
- `campaign_end_date`
- `target_community_ids`
- `incentive_type`
- `incentive_value`
- `incentive_details`
- `ambassadors_only` if the campaign should target ambassadors only

### Test campaign flow

Provide the same campaign fields above, plus:

- Tell me whether to use the internal `E2E Test — Admins Only` community.
- If not, provide the exact target community ids.
- If you want a brand-specific label, provide the exact `brand_name` and `campaign_title`.

## Copy/paste template

```text
Type: campaign request
Trigger: Agent test campaign
Brand name:
Brand contact email:
Brand contact name:
Campaign title:
Campaign description:
Assignment type:
Campaign start date:
Campaign end date:
Target community ids:
Incentive type:
Incentive value:
Incentive details:
Ambassadors only: yes/no
Use internal test community: yes/no
```

## Safe defaults

- I will keep the record pending.
- I will not call participant notification.
- I will not invent community UUIDs.
- If you say `Agent test campaign` and do not provide targets, I will try the internal admin-only test community first.
- For campaign submission, I still need the live `BRAND_PORTAL_API_KEY` flow; `ENRICHMENT_AGENT_KEY` does not currently authenticate `api-campaign-request`.
