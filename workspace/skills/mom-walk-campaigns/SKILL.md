---
name: "mom-walk-campaigns"
description: "Use when creating Mom Walk discount deals or campaign requests, preparing a temporary/test campaign, or asking for the required intake template and trigger keywords."
metadata:
  openclaw:
    requires:
      env: [AGENT_MINT_SECRET, BRAND_PORTAL_API_KEY]
---

# Mom Walk Campaigns

Use this skill for the Mom Walk Collective campaign workflow. The goal is to create records that stay paused or pending until an admin intentionally activates them.

## Trigger keywords

Use this skill when the user says any of the following:

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

If the request is ambiguous, ask for the campaign intake fields listed below before taking action.

## 1. Identify the branch

Decide which flow the user wants:

- **Discount code / deal**: create the deal, then immediately pause it.
- **Campaign request**: submit the campaign as `pending` through the brand portal API.

If the request mixes both, handle the deal first, then the campaign request. Keep the two records linked by coupon code and incentive details.

## 2. Gather required inputs

Before calling anything, confirm the exact values needed for the branch:

- Deal: `brand_name`, `title`, `category`, `discount_text`, `coupon_code`, `brand_url`, `expires_at`, `description`, `target_audience`.
- Campaign: `brand_name`, `brand_contact_email`, `campaign_title`, `campaign_description`, `assignment_type`, `campaign_start_date`, `campaign_end_date`, `target_community_ids`, `incentive_type`, `incentive_value`, `incentive_details`, and optional `brand_contact_name` and `ambassadors_only`.

Never invent community UUIDs. Resolve them from the API or from trusted workspace data.

## 3. Create a deal, then pause it

Use the reviewed `mom-walk-manage` client for all deal actions.

1. Discover the supported actions first with:

```bash
mom-walk-manage list-actions
```

2. Create the deal.
3. Immediately pause it with the returned deal id.
4. Verify the final state is `is_active: false` before moving on.

Report the deal id and final active state. If the pause step fails, retry it before doing anything else.

## 4. Submit a campaign request as pending

Use the brand portal contract endpoint for campaign requests.

1. Resolve the target communities from the API first.
2. Submit the request with the exact selected community ids.
3. Confirm the result shows `status: pending`.
4. Do not call any activation or notification step.

If the user only wants the campaign request, stop after the pending record is created.

## 5. Human gate

Only admins may activate the deal or approve the campaign later. Do not simulate activation, notification, or “go live” behavior inside this skill.

## 6. Verification

Always finish by reporting:

- the deal id and whether it is paused, if a deal was created
- the campaign request id and status, if a campaign was submitted
- any missing inputs or blocked steps

## Guardrails

- Never bypass the reviewed `mom-walk-manage` client with raw `bash`, `curl`, or `jq` for deal management.
- Never call `notify-campaign-participants`.
- Never fabricate community ids.
- Never expose mint secrets, API keys, or temporary credentials.
- Keep all pre-launch records paused or pending until an admin decides otherwise.
- Do not treat `ENRICHMENT_AGENT_KEY` as a drop-in replacement for `BRAND_PORTAL_API_KEY` on `api-campaign-request`; the live campaign endpoint still rejects it.

## Intake template

See `intake-template.md` for the exact fill-in format to collect before creating a campaign request.
