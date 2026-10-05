import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIONS,
  UsageError,
  executeAction,
  parseCliArgs,
} from "./survey-hub-manage.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("registry exposes reviewed survey hub actions", () => {
  assert.deepEqual(Object.keys(ACTIONS), [
    "brand.lookup",
    "brand.list",
    "brand.create",
    "brand.update",
    "brand.delete",
    "survey.list",
    "survey.lookup",
    "survey.create",
    "survey.update",
    "survey.publish",
    "survey.unpublish",
    "survey.delete",
    "questions.list",
    "question.create",
    "question.update",
    "question.delete",
    "question.reorder",
    "responses.list",
    "response.get",
    "response.create",
    "response.update",
    "response.delete",
    "answer.upsert",
    "answer.delete",
  ]);
});

test("survey lifecycle actions send the documented API payloads", async () => {
  const surveyId = "11111111-1111-4111-8111-111111111111";
  const cases = [
    ["survey.create", { brandSlug: "tmwc", updates: { title: "Draft survey" } }, {},
      { brandSlug: "tmwc", updates: { title: "Draft survey", status: "draft" } }],
    ["survey.update", { surveyId, updates: { title: "Updated survey" } }, {},
      { surveyId, updates: { title: "Updated survey" } }],
    ["survey.publish", { surveyId }, { confirmTarget: surveyId }, { surveyId }],
    ["survey.unpublish", { surveyId }, {}, { surveyId }],
    ["survey.delete", { surveyId }, { confirmTarget: surveyId }, { surveyId, confirm: true }],
  ];
  for (const [action, params, options, expected] of cases) {
    let request;
    await executeAction(action, params, options, {
      env: { MANAGE_API_SECRET: "manage-secret" },
      fetchImpl: async (_url, init) => {
        request = JSON.parse(init.body);
        return jsonResponse({ success: true });
      },
    });
    assert.deepEqual(request, { action, ...expected });
  }
});

test("publish and delete require exact confirmation before any API request", async () => {
  for (const action of ["survey.publish", "survey.delete"]) {
    await assert.rejects(() => executeAction(action,
      { surveyId: "11111111-1111-4111-8111-111111111111" }, {}, {
        env: { MANAGE_API_SECRET: "manage-secret" },
        fetchImpl: async () => assert.fail("unconfirmed action must not reach API"),
      }), /confirm-target/);
  }
});

test("survey writes cannot bypass the publish action", () => {
  assert.throws(() => ACTIONS["survey.create"].validate({ brandSlug: "tmwc",
    updates: { title: "Survey", status: "published" } }), /survey.publish/);
  assert.throws(() => ACTIONS["survey.update"].validate({ surveyId: "survey",
    updates: { status: "published" } }), /survey.publish/);
});

test("CLI parser requires valid JSON", () => {
  assert.throws(
    () => parseCliArgs(["brand.lookup", "--params-json", "nope"]),
    UsageError,
  );
});

test("delete actions require exact target confirmation", async () => {
  await assert.rejects(
    () =>
      executeAction(
        "question.delete",
        { questionId: "11111111-1111-4111-8111-111111111111" },
        { confirmTarget: "different" },
      ),
    /confirm-target/,
  );
});

test("calls survey hub manage endpoint with dedicated secret", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse({ brand: { id: "client-1", api_key: "secret-key" } });
  };

  const result = await executeAction(
    "brand.lookup",
    { brandSlug: "tmwc", includeSurveys: true },
    {},
    {
      env: {
        SURVEY_HUB_MANAGE_SECRET: "manage-secret",
        SURVEY_HUB_FUNCTIONS_URL: "https://survey.example/functions/v1",
      },
      fetchImpl,
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://survey.example/functions/v1/manage");
  assert.equal(requests[0].init.headers.Authorization, "Bearer manage-secret");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    action: "brand.lookup",
    brandSlug: "tmwc",
    includeSurveys: true,
  });
  assert.deepEqual(result, { brand: { id: "client-1", api_key: "[REDACTED]" } });
});

test("accepts the deployed MANAGE_API_SECRET name", async () => {
  let authorization;
  const result = await executeAction("brand.list", {}, {}, {
    env: { MANAGE_API_SECRET: "deployed-secret" },
    fetchImpl: async (_url, init) => {
      authorization = init.headers.Authorization;
      return jsonResponse({ brands: [] });
    },
  });
  assert.equal(authorization, "Bearer deployed-secret");
  assert.deepEqual(result, { brands: [] });
});

test("missing credentials report both supported names before making a request", async () => {
  await assert.rejects(() => executeAction("brand.list", {}, {}, {
    env: {},
    fetchImpl: async () => assert.fail("must not request without credentials"),
  }), /MANAGE_API_SECRET \(or SURVEY_HUB_MANAGE_SECRET\)/);
});

test("delete injects confirm true only after exact confirmation", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse({ deleted: true });
  };
  const questionId = "11111111-1111-4111-8111-111111111111";

  await executeAction(
    "question.delete",
    { questionId },
    { confirmTarget: questionId },
    {
      env: { SURVEY_HUB_MANAGE_SECRET: "manage-secret" },
      fetchImpl,
    },
  );

  assert.deepEqual(JSON.parse(requests[0].init.body), {
    action: "question.delete",
    questionId,
    confirm: true,
  });
});
