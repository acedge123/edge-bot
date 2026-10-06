---
name: mom-walk-manage
description: Safely execute reviewed Mom Walk administrative actions through the root-owned mom-walk-manage client.
metadata:
  openclaw:
    requires:
      bins: [mom-walk-manage]
      env: [MOM_WALK_AGENT_MINT_SECRET]
---

# Mom Walk Manage

Use the root-owned `mom-walk-manage` executable. Never recreate this flow with
`bash`, `curl`, `jq`, or a hand-built HTTP request.

## Supported actions

List the reviewed registry:

```bash
mom-walk-manage list-actions
```

## Survey publishing and deployment

Mom Walk does not author survey questions. The actual survey is authored in TGA
Surveys / Client Survey Hub, then Mom Walk stores a public wrapper row in its
`surveys` table. That wrapper renders at:

```text
https://www.themomwalkcollective.app/survey/<slug>
```

The wrapper iframe loads the external survey URL stored as `survey_url`, normally:

```text
https://tmwc.tgasurveys.com/s/<slug>/take
```

Prepare the wrapper as inactive through `mom-walk-manage`:

```bash
mom-walk-manage surveys.create \
  --params-json '{"name":"Brand Feedback","slug":"brand-feedback","survey_url":"https://tmwc.tgasurveys.com/s/brand-feedback/take","external_survey_id":"<survey-hub-id>","is_active":false}'
```

The inactive wrapper reserves the slug but its public page is unavailable.
Submit a publication request for a human admin to review in Mom Walk admin
Surveys. The approval service publishes the external survey and activates its
wrapper only when a signed-in human admin selects Approve & Publish:

```bash
mom-walk-manage surveys.request-publish --params-json '{"id":"<mom-walk-survey-id>"}'
```

Soft-delete / unpublish a wrapper by confirming the exact Mom Walk survey id:

```bash
mom-walk-manage surveys.delete \
  --params-json '{"id":"<mom-walk-survey-id>"}' \
  --confirm-target '<mom-walk-survey-id>'
```

Deploy means sending the survey solicitation email. First resolve an active
`survey_solicitation` template:

```bash
mom-walk-manage admin.list-email-templates --params-json '{}'
```

Sending invitations requires a separate human-approved request for the email
content and recipient list. The backend checks the external survey is published
and the Mom Walk wrapper is active. Submit explicit recipients after confirming
the survey id. Each
recipient must include `userId`, `email`, and `name`. Resolve them using:

```bash
mom-walk-manage recipients.resolve \
  --params-json '{"communityIds":["39be14ef-d68f-4c22-9e5a-78bc577ff974"]}'
```

Optional selectors are `communityIds`, `emails`, `userIds` (arrays), and `segment`
(a string). Selectors combine as a union; the backend deduplicates members.
Each input array accepts at most 500 values and the result never exceeds 500 moms.
Emails are trimmed/lowercased and IDs must be UUIDs. At least one selector is required.
The response is `{success:true,data:{recipients,count,unmatchedEmails,capReached}}`.
`data.recipients` is directly compatible with `survey.deploy-recipients`; pass
that exact returned array, not fabricated identities or membership-row IDs.
If `capReached` is true, report the limit before creating a delivery request;
do not silently split requests to bypass it. Report unmatched emails without
inventing replacements. Avoid displaying the full recipient list in chat.

The current backend only recognizes `segment: "ambassadors"`. The client forwards
other names/IDs, but arbitrary saved-group lookup is not implemented by the backend.
Do not claim a saved-group selector resolved successfully without checking its results.

```bash
mom-walk-manage survey.deploy-recipients \
  --params-json '{"surveyId":"<mom-walk-survey-id>","templateId":"<template-id>","recipients":[{"userId":"<user-id>","email":"mom@example.com","name":"Alex"}]}' \
  --confirm-target '<mom-walk-survey-id>'
```

This creates a pending send request; it does not send email. A signed-in human
admin reviews the exact template and recipients, then selects Approve & Send.
The backend rejects agent approvals, stale or expired content, and reused send
requests. Approvals expire after 24 hours. Edits require a new request.

Check pending requests:

```bash
mom-walk-manage surveys.approvals --params-json '{}'
```

Never claim publication or delivery is complete merely because a request was
created. Report its request ID and pending status, and direct the human admin to
Mom Walk admin Surveys. Never call approve/reject endpoints with agent credentials.

Find a user before any password reset:

```bash
mom-walk-manage admin.find-user --params-json '{"query":"person@example.com","limit":10}'
```

Reset a confirmed account and email the temporary password:

```bash
mom-walk-manage admin.reset-user-password \
  --params-json '{"email":"person@example.com"}' \
  --confirm-target 'person@example.com'
```

## Required workflow

1. Run `admin.find-user` first.
2. Show the matched identity to the requesting admin without exposing secrets.
3. Obtain explicit confirmation for the exact email or user ID.
4. Run `admin.reset-user-password` with the same value in `--confirm-target`.
5. Report whether the notification email was sent.

The client forces `notify: true`. It rejects caller-supplied passwords and never
prints the minted access token or temporary password.

New `/manage` actions require a reviewed registry entry, parameter validation,
tests, and an appropriate confirmation rule in the client source. Do not bypass
the registry with a generic shell command.
