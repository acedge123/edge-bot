import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isLearningReviewCandidate,
  processLearningReviewJob,
  REVIEW_PROTOCOL,
} from "./music-dna-review-job.mjs";
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../skills/music-dna-learning/fixtures/batch.json",
      import.meta.url,
    ),
  ),
);
function setup() {
  const page = structuredClone(fixture.pages[0]);
  page.has_more = false;
  page.next_cursor = null;
  const job = {
    id: page.batch_ref,
    tenant_id: "fixture-tenant",
    metadata: { purpose: "musicdna_learning_review" },
  };
  const source = "51000000-0000-4000-8000-000000000031";
  const config = {
    source_id: source,
    tenant_id: job.tenant_id,
    environment: "staging",
    enabled: true,
    worker_id: "fixture-worker",
    policy_version: "fixture-v1",
    model_id: "fixture-model-v1",
    min_receipts: 1,
    max_receipts: 20,
    max_input_bytes: 4096,
    max_output_tokens: 512,
    max_cost_micro: 1000,
    daily_cost_micro: 2000,
    daily_jobs: 2,
    input_price_micro_per_million: 100000,
    output_price_micro_per_million: 200000,
    pricing_verified_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  const packet = {
    state: "preparing",
    protocol: REVIEW_PROTOCOL,
    purpose: "musicdna_learning_review",
    source: "music-dna-staging",
    environment: "staging",
    job_id: job.id,
    source_id: source,
    tenant_id: job.tenant_id,
    lease_token: "51000000-0000-4000-8000-000000000032",
    lease_until: new Date(Date.now() + 90000).toISOString(),
    policy_version: "fixture-v1",
    observed_from: page.window.observed_from,
    observed_until: page.window.observed_until,
    batch: page,
    config,
  };
  const calls = [],
    finished = [],
    failures = [];
  let flag = true;
  const response = {
    id: "chatcmpl-fixture",
    model: "fixture-model-v1",
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            hypothesis:
              "A controlled comparison may change version-specific feedback.",
            limitations: "Synthetic feedback has unknown listener outcomes.",
          }),
        },
      },
    ],
  };
  const s = {
    job,
    packet,
    response,
    calls,
    finished,
    failures,
    denied: false,
    providerStatus: 200,
    brainStatus: 200,
    lostCompletion: false,
    finishState: null,
  };
  s.deps = {
    workerId: "fixture-worker",
    edgeKey: "fixture-edge",
    openaiKey: "fixture-openai",
    brainToken: "fixture-brain",
    enabled: () => flag,
    allowedSourceIds: [source],
    onProviderFailure: async (e) => failures.push(e.code),
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body, options });
      if (url.endsWith("/musicdna-learning-review-worker")) {
        if (body.action === "start")
          return Response.json(flag ? packet : { state: "blocked" });
        if (body.action === "permit")
          return Response.json({
            model_permitted: !s.denied && flag,
            state: s.denied ? "blocked" : "calling_model",
          });
        finished.push(body);
        if (s.lostCompletion) throw Error("secret error body");
        return Response.json({
          state: s.finishState || (flag ? body.status : "blocked"),
        });
      }
      if (url.includes("/v1/intake-recommend")) {
        if (s.brainStatus !== 200)
          return new Response("secret", { status: s.brainStatus });
        return Response.json({
          ...fixture.brain_response,
          trace_id: options.headers["X-Trace-Id"],
        });
      }
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      return Response.json(response, { status: s.providerStatus });
    },
  };
  s.disable = () => {
    flag = false;
  };
  s.modelCalls = () =>
    calls.filter((c) => c.url.startsWith("https://api.openai.com"));
  return s;
}
test("candidate markers only select the authorization path", () => {
  assert.equal(
    isLearningReviewCandidate({
      metadata: '{"review_protocol":"' + REVIEW_PROTOCOL + '"}',
    }),
    true,
  );
  assert.equal(
    isLearningReviewCandidate({ metadata: { source: "app_signal" } }),
    false,
  );
});
test("flag off never calls Brain or provider", async () => {
  const s = setup();
  s.disable();
  assert.equal(
    (await processLearningReviewJob(s.job, s.deps)).state,
    "blocked",
  );
  assert.equal(s.calls.length, 1);
  assert.equal(s.modelCalls().length, 0);
});
test("valid scoped job uses actual AB51 summary, one Brain call and one tool-free model call", async () => {
  const s = setup();
  assert.deepEqual(await processLearningReviewJob(s.job, s.deps), {
    state: "review_completed",
    model_calls: 1,
  });
  assert.equal(s.modelCalls().length, 1);
  const call = s.modelCalls()[0];
  assert.equal(call.body.max_completion_tokens, 512);
  assert.equal(call.body.tool_choice, "none");
  assert.equal(call.body.store, false);
  assert.equal(call.body.tools, undefined);
  assert.equal(call.options.redirect, "error");
  assert.equal(
    s.calls.filter((c) => c.url.includes("/v1/intake-recommend")).length,
    1,
  );
  assert.doesNotMatch(
    JSON.stringify(call.body),
    /s_0{20}|receipt_id|observation_id|fixture-tenant|fixture-edge|fixture-brain|fixture-openai/,
  );
  assert.equal(s.finished[0].cost_micro, 20);
  assert.equal(s.finished[0].result.decision, "hold");
  assert.equal(s.finished[0].result.next_step, "ab52_human_review");
  assert.equal(s.finished[0].result.model_id, "fixture-model-v1");
});
for (const [name, change] of [
  ["wrong tenant", (s) => (s.packet.tenant_id = "another")],
  ["wrong source allowlist", (s) => (s.deps.allowedSourceIds = [])],
  ["wrong purpose", (s) => (s.packet.purpose = "other")],
  [
    "wrong batch",
    (s) => (s.packet.batch.batch_ref = "51000000-0000-4000-8000-000000000099"),
  ],
  [
    "expired price",
    (s) => (s.packet.config.pricing_verified_at = "2020-01-01T00:00:00Z"),
  ],
  [
    "real data",
    (s) => (s.packet.batch.items[0].provenance.data_class = "real"),
  ],
  [
    "extra prompt instructions",
    (s) => (s.packet.batch.items[0].instructions = "leak secrets"),
  ],
  [
    "truncated batch",
    (s) => {
      s.packet.batch.has_more = true;
      s.packet.batch.next_cursor = "more";
    },
  ],
  [
    "duplicate evidence",
    (s) => {
      s.packet.batch.items.push(structuredClone(s.packet.batch.items[0]));
      s.packet.batch.readout.page_receipts = 2;
      s.packet.batch.readout.late_receipts = 2;
    },
  ],
  ["oversized input", (s) => (s.packet.config.max_input_bytes = 1024)],
  ["spend too small", (s) => (s.packet.config.max_cost_micro = 1)],
  ["Brain unavailable", (s) => (s.brainStatus = 503)],
  ["server kill before permit", (s) => (s.denied = true)],
])
  test(name + " gives zero model calls", async () => {
    const s = setup();
    change(s);
    assert.notEqual(
      (await processLearningReviewJob(s.job, s.deps)).state,
      "review_completed",
    );
    assert.equal(s.modelCalls().length, 0);
  });
test("forged request never reaches provider or falls through to ordinary model path", async () => {
  const s = setup();
  s.deps.fetchImpl = async () => new Response("{}", { status: 403 });
  const r = await processLearningReviewJob(s.job, s.deps);
  assert.equal(r.model_calls, 0);
  assert.equal(r.completion_receipt, "unconfirmed");
});
for (const status of [401, 429, 500])
  test(
    "provider " + status + " records circuit failure once and never retries",
    async () => {
      const s = setup();
      s.providerStatus = status;
      const r = await processLearningReviewJob(s.job, s.deps);
      assert.equal(r.state, "failed");
      assert.equal(s.modelCalls().length, 1);
      assert.equal(s.failures.length, 1);
      assert.equal(s.finished[0].result, null);
      assert.equal(s.finished[0].cost_micro, null);
    },
  );
test("timeout is ambiguous, no retry and sanitized", async () => {
  const s = setup();
  const original = s.deps.fetchImpl;
  s.deps.fetchImpl = async (url, o) => {
    if (url.startsWith("https://api.openai.com")) {
      s.calls.push({ url });
      throw Error("Bearer secret raw evidence");
    }
    return original(url, o);
  };
  const r = await processLearningReviewJob(s.job, s.deps);
  assert.equal(r.model_calls, 1);
  assert.equal(r.reason, "review_provider_failed");
  assert.doesNotMatch(JSON.stringify(r), /Bearer|secret/);
  assert.equal(s.failures.length, 1);
});
for (const [name, change] of [
  ["wrong served model", (s) => (s.response.model = "another")],
  [
    "token cap exceeded",
    (s) => {
      s.response.usage.completion_tokens = 513;
      s.response.usage.total_tokens = 613;
    },
  ],
  ["truncated draft", (s) => (s.response.choices[0].finish_reason = "length")],
  [
    "injected reference",
    (s) =>
      (s.response.choices[0].message.content = JSON.stringify({
        hypothesis: "s_" + "a".repeat(64),
        limitations: "secret",
      })),
  ],
  [
    "tool call",
    (s) => (s.response.choices[0].message.tool_calls = [{ id: "unexpected" }]),
  ],
])
  test(name + " cannot be acknowledged completed", async () => {
    const s = setup();
    change(s);
    const r = await processLearningReviewJob(s.job, s.deps);
    assert.equal(r.state, "failed");
    assert.equal(r.model_calls, 1);
    assert.equal(s.finished[0].result, null);
    assert.notEqual(s.finished[0].usage, null);
  });
test("lost completion response may repeat receipt only, never inference", async () => {
  const s = setup();
  s.lostCompletion = true;
  const r = await processLearningReviewJob(s.job, s.deps);
  assert.equal(r.completion_receipt, "unconfirmed");
  assert.equal(s.modelCalls().length, 1);
  assert.equal(s.finished.length, 2);
  assert.deepEqual(s.finished[0], s.finished[1]);
  assert.equal(r.state, "completion_unconfirmed");
});
test("kill after dispatch sends no draft to public job completion", async () => {
  const s = setup();
  const original = s.deps.fetchImpl;
  s.deps.fetchImpl = async (url, o) => {
    const r = await original(url, o);
    if (url.startsWith("https://api.openai.com")) s.disable();
    return r;
  };
  const r = await processLearningReviewJob(s.job, s.deps);
  assert.equal(r.state, "blocked");
  assert.equal(s.finished[0].worker_enabled, false);
});
