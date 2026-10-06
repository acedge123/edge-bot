---
name: survey-hub-manage
description: Safely manage Client Survey Hub brands, surveys, questions, responses, and answers through the root-owned survey-hub-manage client.
metadata:
  openclaw:
    requires:
      bins: [survey-hub-manage]
---

# Survey Hub Manage

Use the root-owned `survey-hub-manage` executable. Never recreate this flow with
`bash`, `curl`, `jq`, or a hand-built HTTP request. The Railway agent receives
`MANAGE_API_SECRET`, matching the Client Survey Hub Edge Function. The optional
`SURVEY_HUB_MANAGE_SECRET` alias is also accepted and takes precedence when set.
The executable checks credentials at request time; do not infer an authentication
failure from an absent alias. Never print either secret. The Supabase service-role
key stays inside the Client Survey Hub Edge Function.

Mom Walk publishing uses its separate `MOM_WALK_AGENT_MINT_SECRET` to mint a
short-lived agent token. Do not substitute the Survey Hub secret for that token
minting credential. Run a read-only action to verify each tool and report its
actual output or error; an empty terminal result is not proof of failed auth.

List the reviewed registry:

```bash
survey-hub-manage list-actions
```

## Authoring Flow

1. Resolve the brand/client.
2. Resolve or create the survey in Client Survey Hub as a draft.
3. Add, update, delete, or reorder questions.
4. Prepare an inactive Mom Walk wrapper with the `mom-walk-manage` skill.
5. Show the survey content, slug, wrapper URL, email template, and intended
   recipients to the requesting admin for review. Wait for explicit approval
   before publishing or activating either survey. Sending invitations requires
   separate explicit approval of the recipients and email content.

Create a survey (the managed client defaults to and enforces draft creation):

```bash
survey-hub-manage survey.create --params-json '{"brandSlug":"tmwc","updates":{"title":"Brand Feedback","slug":"brand-feedback","estimated_time":5,"settings":{"questions_per_page":5}}}'
```

Update survey details:

```bash
survey-hub-manage survey.update --params-json '{"surveyId":"<survey-id>","updates":{"title":"Brand Feedback Updated"}}'
```

Submit publication through the Mom Walk human approval queue:

```bash
mom-walk-manage surveys.request-publish --params-json '{"id":"<mom-walk-survey-id>"}'
```

The human admin selects Approve & Publish in Mom Walk admin Surveys. That
backend publishes the external survey and activates the wrapper. The agent has
no publication approval credential, cannot approve its own requests, and cannot
activate a wrapper directly. `survey.publish` remains in the API registry but
the backend rejects calls without its separate server-only approval credential.

`survey.deploy-recipients` now submits a separate pending send request, not an
email send. A human reviews the template and recipients and selects Approve &
Send. Report pending request IDs instead of claiming publication or delivery.

Return a survey to draft:

```bash
survey-hub-manage survey.unpublish --params-json '{"surveyId":"<survey-id>"}'
```

Delete only after explicit approval of the exact target:

```bash
survey-hub-manage survey.delete --params-json '{"surveyId":"<survey-id>"}' --confirm-target '<survey-id>'
```

The confirmation argument checks the target, not human approval. Publication
and email approvals are enforced by the backend queue. Use survey.unpublish to
return a survey to draft; do not set status through survey.update.

Brand lookup:

```bash
survey-hub-manage brand.lookup --params-json '{"brandSlug":"tmwc","includeSurveys":true}'
```

Survey lookup:

```bash
survey-hub-manage survey.lookup --params-json '{"brandSlug":"tmwc","surveySlug":"brand-feedback"}'
```

Create a question:

```bash
survey-hub-manage question.create \
  --params-json '{"surveyId":"<survey-id>","question":{"type":"text_short","prompt":"What is your role?","required":true,"config":{}}}'
```

Update a question:

```bash
survey-hub-manage question.update \
  --params-json '{"questionId":"<question-id>","updates":{"prompt":"What is your current role?"}}'
```

Delete a question only after confirming the exact question id:

```bash
survey-hub-manage question.delete \
  --params-json '{"questionId":"<question-id>"}' \
  --confirm-target '<question-id>'
```

Reorder questions:

```bash
survey-hub-manage question.reorder \
  --params-json '{"surveyId":"<survey-id>","questionIds":["<question-1>","<question-2>"]}'
```

List submitted responses with answers:

```bash
survey-hub-manage responses.list \
  --params-json '{"surveyId":"<survey-id>","status":"submitted","includeAnswers":true,"limit":50}'
```

## Deployment To Mom Walk

Client Survey Hub owns the actual survey and question/response data. Mom Walk
owns the public wrapper and email deployment.

After a survey exists in Client Survey Hub, prepare its inactive Mom Walk draft:

```bash
mom-walk-manage surveys.create \
  --params-json '{"name":"Brand Feedback","slug":"brand-feedback","survey_url":"https://tmwc.tgasurveys.com/s/brand-feedback/take","external_survey_id":"<survey-hub-id>","is_active":false}'
```

Request publication with `mom-walk-manage surveys.request-publish`. A human must
review and approve it in Mom Walk admin Surveys before either link is published.
Then request delivery to selected recipients with `mom-walk-manage survey.deploy-recipients`
using an active `survey_solicitation` email template. This only queues a separate
send approval; it does not send emails. Report the pending request ID to the user.

## Guardrails

- Never fabricate brand, survey, question, response, template, community, or user ids.
- Use `brand.lookup`, `survey.lookup`, `questions.list`, and Mom Walk lookup/list
  actions before writes.
- Destructive actions require `--confirm-target`; do not ask the tool to bypass it.
- Keep response exports small and paginated. Avoid pasting bulk PII into chat.
- For public Mom Walk links, use `https://www.themomwalkcollective.app/survey/<slug>`.
- For the iframe target, use `https://tmwc.tgasurveys.com/s/<slug>/take` unless the
  survey owner explicitly wants the landing/intro screen.
