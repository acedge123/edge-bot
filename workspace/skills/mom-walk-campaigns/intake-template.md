# Campaign Quote Request Intake

```text
Brand name (for lookup):
Mode: normal RFQ / pre-campaign (confirm intent; pre-campaign uses stage: pre_campaign)
Brand email (optional; may be absent on account):
Brand website (optional HTTPS):
Permit pipeline brand creation if missing: yes/no (default no)
Request type: sampling / seeding / irl_gifting (optional for pre-campaign)
Interest deadline (optional YYYY-MM-DD):
Product name (required, max 200 characters):
Community names/cities (for lookup):
Product description (optional, max 4000 characters):
Product URL (optional HTTPS):
Product image URL (optional public non-expiring HTTPS; 800x400 JPG/PNG/WebP under 500 KB):
Target recipients (required in practice for normal Sampling RFQ; otherwise optional integer):
Start date (optional YYYY-MM-DD):
End date (optional YYYY-MM-DD):
Instructions for admin (optional, max 4000 characters):
Ambassadors only: yes/no (default no)
```

Resolve community IDs first, then resolve the existing brand account. Prefer
`brand_account_id` over email, especially for accounts with null email. Clarify
ambiguous accounts and communities before submission. If the brand is missing,
confirm exact spelling and permission to create it using `brand_name` plus
`create_brand: true`. It becomes an interested pipeline brand without a portal
user. A user must sign up or be linked before approving the quote; admins may
quote the submitted request beforehand.

Show the resolved targets and obtain submission confirmation. A successful
request is `submitted`, awaiting an admin quote; it also sends an admin email.
The brand approves the quote, then an admin sends it onward. No participant
emails or campaign activation occur through this client.

Test requests require an explicitly selected existing test brand/community and
confirmation. Never silently substitute test targets. Lookup-only verification
does not authorize creating a test request.

Discount codes/deals are a separate flow, not this quote-request schema.

For normal RFQs choose `request_type` explicitly; the title does not select the offering or
pricing. Read `standard-offerings.md` for suggested rates. Count unique resolved
communities for Seeding and IRL Gifting; use confirmed `target_recipients` for
Sampling. Treat all calculated amounts as estimates, excluding product value
and shipping. Submission creates an RFQ, not a charge or an approved campaign.

For pre-campaigns set `stage: "pre_campaign"`; offering selection is optional
and there is no price estimate. It is saved as submitted with interest status
draft, not awaiting a quote. Saving does not deliver an interest check; confirm
the admin handoff succeeds before claiming delivery. Read counts with `requests.get`.
Admins close/convert it in the portal; the client cannot send or convert it.

## Correct an Existing Request

Provide the returned request ID and only the fields to change. Before writing,
verify it remains submitted/unquoted, show the changes, and obtain confirmation
of that request ID. If replacing communities, provide the complete desired set
(including communities to retain). Resolve any new brand or community first.

For pre-campaigns instead verify interest status is draft and no linked conversion
exists. Stage cannot be edited by PATCH. Read the pre-campaign PATCH caveat in
`SKILL.md`: a null offering currently defaults to Sampling on update.

PATCH currently rewrites admin notes even if instructions are omitted. Confirm
any earlier instructions that must be retained and include them explicitly.
Verify with a fresh status read afterward; fields absent from GET require admin
verification in Requests. A quote lock means a new request is needed, not a retry.
