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
Show the survey questions and proposed URL to the requesting admin. After explicit
approval, publish the external survey with `survey-hub-manage survey.publish`,
then activate the wrapper:

```bash
mom-walk-manage surveys.update \
  --params-json '{"id":"<mom-walk-survey-id>","survey_url":"https://tmwc.tgasurveys.com/s/brand-feedback/take","is_active":true}'
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

Sending invitations requires separate explicit approval of the email content
and recipient list. First verify the external survey is published and the Mom
Walk wrapper is active; the email backend does not enforce that check. Then
deploy to explicit recipients only after confirming the survey id. Each
recipient must include `userId`, `email`, and `name`; resolve users from admin
lookup/list calls or from community membership before sending.

```bash
mom-walk-manage survey.deploy-recipients \
  --params-json '{"surveyId":"<mom-walk-survey-id>","templateId":"<template-id>","recipients":[{"userId":"<user-id>","email":"mom@example.com","name":"Alex"}]}' \
  --confirm-target '<mom-walk-survey-id>'
```

This calls Mom Walk's existing `send-survey-solicitation` function, which handles
suppression, email logs, and `survey_responses.email_sent_at` tracking.

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
