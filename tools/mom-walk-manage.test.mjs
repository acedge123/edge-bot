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

test("deploy action calls survey solicitation function with validated recipients", async () => {
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
  assert.equal(requests[1].url, "https://example.supabase.co/functions/v1/send-survey-solicitation");
  assert.equal(requests[1].init.headers.Authorization, "Bearer private-access-token");
  assert.deepEqual(JSON.parse(requests[1].init.body), {
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
