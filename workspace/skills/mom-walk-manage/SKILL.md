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

Deploy prepares a survey invitation for approval; it does not send automatically.
First run `surveys.list`, match the requested survey by name, verify `is_active`
is true, and use its returned ID. Never guess a survey ID or slug.

Then resolve an active `survey_solicitation` template:

```bash
mom-walk-manage admin.list-email-templates --params-json '{}'
```

Use **Survey Invite (generic)**, ID `f2b59770-a6af-4ce5-bef6-a84f5a8360ee`,
unless the human requests another compatible template. Verify it is active and
uses `{{survey_url}}`. Templates with a hardcoded survey link are rejected.

Sending invitations requires a separate human-approved request for the email
content and recipient list. The backend checks the external survey is published
and the Mom Walk wrapper is active. Submit explicit recipients after confirming
the survey id. Each
recipient must include `userId`, `email`, and `name`. Resolve them using:

```bash
mom-walk-manage recipients.resolve \
  --params-json '{"communityIds":["39be14ef-d68f-4c22-9e5a-78bc577ff974"]}'
```

`recipients.resolve` calls the existing `/manage` endpoint as the agent admin
with `resource: "admin"`, `action: "resolve-recipients"`.

| Selection | Parameters |
| --- | --- |
| Specific emails | `emails: ["mom@example.com"]` |
| Specific user IDs | `userIds: ["<uuid>"]` |
| Communities | `communityIds: ["<uuid>"]` |
| Ambassadors | `segment: "ambassadors"` |
| Event attendees | `eventId: "<uuid>"`, `rsvpStatus: "attending"`, `"maybe"`, or `"both"`; default attending |
| Random sample | `randomCount: 1..500`, optionally `state: "CA"` (exact stored profile state) |
| Exclude previous template deliveries | `excludeTemplateId: "<template-uuid>"` |
| Exclude previous survey invitations | `excludeSurveyId: "<survey-uuid>"` |

Look up community IDs first:

```bash
mom-walk-manage communities.list --params-json '{"search":"Folsom"}'
```

Selectors combine as a union; the backend deduplicates members.
Each input array accepts at most 500 values and the result never exceeds 500 moms.
Emails are trimmed/lowercased and IDs must be UUIDs. At least one selector is required.
Random sampling always requires `excludeTemplateId` or `excludeSurveyId`; the
client rejects a random request without either. Prefer `excludeSurveyId` when
batching invitations for one survey. The backend currently applies these
exclusions to the random pool, not to other selectors combined with it; use
random-only selection when relying on exclusions to prevent repeat invitations.
Unsubscribed and deleted moms are excluded by the server.

```bash
mom-walk-manage recipients.resolve \
  --params-json '{"randomCount":500,"excludeSurveyId":"<mom-walk-survey-id>"}'
```

The response is `{success:true,data:{recipients,count,unmatchedEmails,capReached}}`.
`data.recipients` is directly compatible with `survey.deploy-recipients`; pass
that exact returned array, not fabricated identities or membership-row IDs.
If `capReached` is true, report that this batch reached the 500-mom cap.
Report unmatched emails without
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
requests. Approvals expire after 24 hours. If the survey or template changes
after filing, the request is invalidated/cancelled; file a new request.

For more than 500 moms, stop after filing the first batch and report its request
ID. Wait until a human has approved it AND delivery has completed before
resolving another random batch with the same `excludeSurveyId`. Pending requests
do not count as sent and may return the same moms. Do not queue parallel batches.
Every subsequent batch also requires a separate human Approve & Send.

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
