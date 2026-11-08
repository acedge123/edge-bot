import { test } from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "./learning-http.mjs";
const attempt = (response, extra = {}) =>
  requestJson("https://api.openai.com/v1/chat/completions", {
    body: {},
    deadline: Date.now() + 10000,
    providerDiagnostics: true,
    fetchImpl: async () => response,
    ...extra,
  });
test("captures only bounded known error fields and request ID", async () => {
  const response = Response.json(
    {
      error: {
        code: "insufficient_quota",
        type: "invalid_request_error",
        param: "model",
        message: "Bearer secret, user evidence",
      },
    },
    { status: 429, headers: { "x-request-id": "req_safe123" } },
  );
  await assert.rejects(attempt(response), (e) => {
    assert.equal(e.status, 429);
    assert.deepEqual(e.providerDiagnostics, {
      request_id: "req_safe123",
      code: "insufficient_quota",
      type: "invalid_request_error",
      parameter: "model",
    });
    assert.doesNotMatch(JSON.stringify(e), /Bearer|secret|evidence|message/);
    return true;
  });
});
test("unknown values and credential-shaped request IDs cannot escape", async () => {
  const response = Response.json(
    {
      error: {
        code: "eyJ.private.token",
        type: "user@example.test",
        param: "secret text",
        message: "private",
      },
    },
    { status: 400, headers: { "x-request-id": "Bearer secret" } },
  );
  await assert.rejects(attempt(response), (e) => {
    assert.deepEqual(e.providerDiagnostics, {
      request_id: null,
      code: null,
      type: null,
      parameter: null,
    });
    return true;
  });
});
test("oversized error bodies retain status without retaining body data", async () => {
  await assert.rejects(
    attempt(new Response("x".repeat(5000), { status: 503 })),
    (e) => {
      assert.equal(e.status, 503);
      assert.equal(e.providerDiagnostics.code, null);
      assert.doesNotMatch(JSON.stringify(e), /xxxxxxxx/);
      return true;
    },
  );
});
test("malformed error bodies do not erase the real HTTP status", async () => {
  await assert.rejects(
    attempt(new Response("not json", { status: 401 })),
    (e) => e.status === 401 && e.providerDiagnostics.code === null,
  );
});
test("other clients retain opt-out behavior with no error body inspection", async () => {
  await assert.rejects(
    attempt(
      Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }),
      { providerDiagnostics: false },
    ),
    (e) => e.status === 429 && e.providerDiagnostics === undefined,
  );
});
