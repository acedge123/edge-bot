# Campaign Quote Request Intake

```text
Brand name (for lookup):
Brand email (optional; may be absent on account):
Request type: sampling / seeding / irl_gifting
Product name (required, max 200 characters):
Community names/cities (for lookup):
Product description (optional, max 4000 characters):
Product URL (optional HTTPS):
Product image URL (optional HTTPS):
Target recipients (optional integer):
Start date (optional YYYY-MM-DD):
End date (optional YYYY-MM-DD):
Instructions for admin (optional, max 4000 characters):
Ambassadors only: yes/no (default no)
```

Resolve community IDs first, then resolve the existing brand account. Prefer
`brand_account_id` over email, especially for accounts with null email. Clarify
ambiguous accounts and communities before submission. A brand without a Mom
Walk Partners account must sign up first.

Show the resolved targets and obtain submission confirmation. A successful
request is `submitted`, awaiting an admin quote; it also sends an admin email.
The brand approves the quote, then an admin sends it onward. No participant
emails or campaign activation occur through this client.

Test requests require an explicitly selected existing test brand/community and
confirmation. Never silently substitute test targets. Lookup-only verification
does not authorize creating a test request.

Discount codes/deals are a separate flow, not this quote-request schema.

## Correct an Existing Request

Provide the returned request ID and only the fields to change. Before writing,
verify it remains submitted/unquoted, show the changes, and obtain confirmation
of that request ID. If replacing communities, provide the complete desired set
(including communities to retain). Resolve any new brand or community first.

PATCH currently rewrites admin notes even if instructions are omitted. Confirm
any earlier instructions that must be retained and include them explicitly.
Verify with a fresh status read afterward; fields absent from GET require admin
verification in Requests. A quote lock means a new request is needed, not a retry.
