import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIONS,
  UsageError,
  executeAction,
  parseCliArgs,
} from "./mom-walk-manage.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("registry exposes only reviewed actions", () => {
  assert.deepEqual(Object.keys(ACTIONS), [
    "surveys.list",
    "surveys.get",
    "surveys.create",
    "surveys.update",
    "surveys.delete",
    "survey.deploy-recipients",
    "surveys.request-publish",
    "surveys.approvals",
    "recipients.resolve",
    "admin.list-email-templates",
    "admin.list-users",
    "communities.list",
    "communities.list-members",
    "admin.find-user",
    "admin.reset-user-password",
  ]);
});

test("CLI parser requires valid JSON", () => {
  assert.throws(
    () => parseCliArgs(["admin.find-user", "--params-json", "nope"]),
    UsageError,
  );
});

test("recipient selectors normalize combined selectors and preserve segment names", () => {
  const id = '39be14ef-d68f-4c22-9e5a-78bc577ff974';
  assert.deepEqual(ACTIONS['recipients.resolve'].validate({ communityIds: [id, id],
    emails: [' MOM@example.com ', 'mom@example.com'], userIds: [id], segment: ' Saved Group ' }),
  { communityIds: [id], emails: ['mom@example.com'], userIds: [id], segment: 'Saved Group' });
  for (const input of [{}, { emails: [] }, { userIds: ['invalid'] }, { emails: ['invalid'] },
    { communityIds: id }, { segment: '' }, { segment: 42 }, { emails: [null] },
    { emails: Array(501).fill('mom@example.com') }, { limit: 1000 }]) {
    assert.throws(() => ACTIONS['recipients.resolve'].validate(input), UsageError);
  }
});

test("recipient resolution uses admin authentication and feeds the pending send workflow", async () => {
  const requests = [];
  const recipient = { userId: '33333333-3333-4333-8333-333333333333', email: 'mom@example.com', name: 'Mom' };
  const resolved = { success: true, data: { recipients: [recipient], count: 1,
    unmatchedEmails: ['missing@example.com'], capReached: false } };
  const dependencies = { env: { MOM_WALK_AGENT_MINT_SECRET: 'mint-secret' },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(url.endsWith('/mint-agent-token') ? { access_token: 'private-token' } :
        url.endsWith('/manage') ? resolved : { success: true, data: { id: 'request', status: 'pending' } });
    } };
  const selectors = { communityIds: ['39be14ef-d68f-4c22-9e5a-78bc577ff974'], emails: ['missing@example.com'],
    eventId: recipient.userId, rsvpStatus: 'both', randomCount: 500, state: 'CA',
    excludeTemplateId: recipient.userId, excludeSurveyId: recipient.userId };
  const response = await executeAction('recipients.resolve', selectors, {}, dependencies);
  assert.deepEqual(response, resolved);
  assert.deepEqual(JSON.parse(requests[1].init.body), { resource: 'admin', action: 'resolve-recipients', params: selectors });
  assert.equal(requests[1].init.headers.Authorization, 'Bearer private-token');
  const surveyId = '11111111-1111-4111-8111-111111111111';
  const pending = await executeAction('survey.deploy-recipients', { surveyId,
    templateId: '22222222-2222-4222-8222-222222222222', recipients: response.data.recipients },
  { confirmTarget: surveyId }, dependencies);
  assert.equal(pending.data.status, 'pending');
  assert.equal(JSON.parse(requests[3].init.body).action, 'request-send');
  assert.deepEqual(JSON.parse(requests[3].init.body).recipients, [recipient]);
  assert.ok(requests.every((r) => !r.url.endsWith('/send-survey-solicitation')));
});

test("event and random selectors validate boundaries and modifiers before authentication", async () => {
  const id = '39be14ef-d68f-4c22-9e5a-78bc577ff974';
  const validate = ACTIONS['recipients.resolve'].validate;
  assert.deepEqual(validate({ eventId: ` ${id.toUpperCase()} ` }), { eventId: id, rsvpStatus: 'attending' });
  for (const rsvpStatus of ['attending', 'maybe', 'both']) {
    assert.equal(validate({ eventId: id, rsvpStatus }).rsvpStatus, rsvpStatus);
  }
  for (const randomCount of [1, 500]) {
    for (const exclusion of ['excludeSurveyId', 'excludeTemplateId']) {
      assert.deepEqual(validate({ randomCount, [exclusion]: id, state: ' CA ' }),
        { randomCount, [exclusion]: id, state: 'CA' });
    }
  }
  const invalid = [{ randomCount: 1 }, { excludeSurveyId: id }, { state: 'CA' },
    { eventId: 'invalid' }, { rsvpStatus: 'maybe' }, { eventId: id, rsvpStatus: 'cancelled' },
    { randomCount: 1, excludeSurveyId: 'invalid' }, { randomCount: 1, excludeTemplateId: 42 },
    { randomCount: 1, excludeSurveyId: id, state: '' }, { randomCount: 1, excludeSurveyId: id, state: 42 },
    ...[0, 501, 1.5, '500', NaN, null].map((randomCount) => ({ randomCount, excludeSurveyId: id }))];
  for (const params of invalid) {
    await assert.rejects(() => executeAction('recipients.resolve', params, {}, {
      fetchImpl: () => assert.fail('Invalid selectors must not authenticate or call the API'),
    }), UsageError);
  }
});

test("community search validates and forwards the lookup through manage", async () => {
  for (const search of ['', '   ', 42, 'x'.repeat(201)]) {
    assert.throws(() => ACTIONS['communities.list'].validate({ search }), UsageError);
  }
  const requests = [];
  await executeAction('communities.list', { search: ' Folsom ' }, {}, {
    env: { MOM_WALK_AGENT_MINT_SECRET: 'mint-secret' },
    fetchImpl: async (url, init) => {
      requests.push(init.body ? JSON.parse(init.body) : null);
      return jsonResponse(url.endsWith('/mint-agent-token') ? { access_token: 'token' } : { success: true, data: [] });
    },
  });
  assert.deepEqual(requests[1], { resource: 'communities', action: 'list', params: { search: 'Folsom', limit: 50, offset: 0 } });
});

test("recipient resolver rejects over-cap or incompatible results without truncation", async () => {
  for (const recipients of [Array(501).fill({}), [{ userId: 'invalid', email: 'mom@example.com', name: 'Mom' }]]) {
    await assert.rejects(() => executeAction('recipients.resolve', { segment: 'ambassadors' }, {},
      { env: { MOM_WALK_AGENT_MINT_SECRET: 'mint-secret' }, fetchImpl: async (url) =>
        jsonResponse(url.endsWith('/mint-agent-token') ? { access_token: 'token' } : { success: true, data: { recipients } }) }),
    /resolver/);
  }
});

test("password reset requires an exact target confirmation", async () => {
  await assert.rejects(
    () =>
      executeAction(
        "admin.reset-user-password",
        { email: "person@example.com" },
        { confirmTarget: "someone@example.com" },
      ),
    /confirm-target/,
  );
});

test("survey deploy requires exact survey confirmation", async () => {
  const surveyId = "11111111-1111-4111-8111-111111111111";
  await assert.rejects(
    () =>
      executeAction(
        "survey.deploy-recipients",
        {
          surveyId,
          templateId: "22222222-2222-4222-8222-222222222222",
          recipients: [
            {
              userId: "33333333-3333-4333-8333-333333333333",
              email: "person@example.com",
              name: "Person",
            },
          ],
        },
        { confirmTarget: "not-the-survey" },
      ),
    /confirm-target/,
  );
});

test("password reset rejects caller-controlled password and notify flags", async () => {
  await assert.rejects(
    () =>
      executeAction(
        "admin.reset-user-password",
        { email: "person@example.com", notify: false, password: "unsafe-value" },
        { confirmTarget: "person@example.com" },
      ),
    /Unsupported parameter/,
  );
});

test("mints a token and calls the reviewed manage action without exposing it", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith("/mint-agent-token")) {
      return jsonResponse({ access_token: "private-access-token" });
    }
    return jsonResponse({
      success: true,
      data: { user_id: "user-1", email: "person@example.com", emailed: true },
    });
  };

  const result = await executeAction(
    "admin.reset-user-password",
    { email: "PERSON@example.com" },
    { confirmTarget: "person@example.com" },
    {
      env: {
        MOM_WALK_AGENT_MINT_SECRET: "mint-secret",
        MOM_WALK_FUNCTIONS_URL: "https://example.supabase.co/functions/v1",
      },
      fetchImpl,
    },
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0].init.headers["x-agent-key"], "mint-secret");
  assert.equal(requests[1].init.headers.Authorization, "Bearer private-access-token");
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    resource: "admin",
    action: "reset-user-password",
    params: { email: "person@example.com", notify: true },
  });
  assert.deepEqual(result, {
    success: true,
    data: { user_id: "user-1", email: "person@example.com", emailed: true },
  });
  assert.doesNotMatch(JSON.stringify(result), /private-access-token/);
});

test("deploy action submits a send approval without sending email", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith("/mint-agent-token")) {
      return jsonResponse({ access_token: "private-access-token" });
    }
    return jsonResponse({ success: true, sentCount: 1, errorCount: 0 });
  };
  const surveyId = "11111111-1111-4111-8111-111111111111";

  const result = await executeAction(
    "survey.deploy-recipients",
    {
      surveyId,
      templateId: "22222222-2222-4222-8222-222222222222",
      recipients: [
        {
          userId: "33333333-3333-4333-8333-333333333333",
          email: "PERSON@example.com",
          name: "Person",
        },
      ],
    },
    { confirmTarget: surveyId },
    {
      env: {
        MOM_WALK_AGENT_MINT_SECRET: "mint-secret",
        MOM_WALK_FUNCTIONS_URL: "https://example.supabase.co/functions/v1",
      },
      fetchImpl,
    },
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, "https://example.supabase.co/functions/v1/survey-approvals");
  assert.equal(requests[1].init.headers.Authorization, "Bearer private-access-token");
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    action: "request-send",
    surveyId,
    templateId: "22222222-2222-4222-8222-222222222222",
    recipients: [
      {
        userId: "33333333-3333-4333-8333-333333333333",
        email: "person@example.com",
        name: "Person",
      },
    ],
  });
  assert.deepEqual(result, { success: true, sentCount: 1, errorCount: 0 });
});

test("Mom Walk creates drafts and blocks direct activation", () => {
  const input = { name: 'Survey', slug: 'survey', survey_url: 'https://example.com/survey' };
  assert.equal(ACTIONS['surveys.create'].validate(input).is_active, false);
  assert.throws(() => ACTIONS['surveys.create'].validate({ ...input, is_active: true }), /approval/);
  assert.throws(() => ACTIONS['surveys.update'].validate({ id: '11111111-1111-4111-8111-111111111111', is_active: true }), /human-approved/);
  assert.equal(Object.hasOwn(ACTIONS, 'surveys.approve'), false);
});

test("redacts secret-shaped fields returned by the API", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/mint-agent-token")) {
      return jsonResponse({ access_token: "private-access-token" });
    }
    return jsonResponse({
      success: true,
      data: { temp_password: "should-not-leak", nested: { token: "also-secret" } },
    });
  };

  const result = await executeAction(
    "admin.find-user",
    { query: "person@example.com" },
    {},
    {
      env: { MOM_WALK_AGENT_MINT_SECRET: "mint-secret" },
      fetchImpl,
    },
  );
  assert.equal(result.data.temp_password, "[REDACTED]");
  assert.equal(result.data.nested.token, "[REDACTED]");
});
