import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverSlackReply } from './echelon-slack-delivery.mjs';

function harness({ marker = null, postResults = [{ ok: true, status: 200, body: 'ok' }] } = {}) {
  const posted = [];
  const written = [];
  let currentMarker = marker;
  let postIndex = 0;
  return {
    posted,
    written,
    dependencies: {
      readMarker: async () => currentMarker,
      writeMarker: async (fields) => {
        written.push(fields);
        currentMarker = { v: 1, kind: 'slack', ...fields };
      },
      postReply: async (payload) => {
        posted.push(payload);
        return postResults[Math.min(postIndex++, postResults.length - 1)];
      },
    },
  };
}

const request = {
  jobId: 'job-7',
  responseText: 'Substantive final answer',
  slackChannel: 'C123',
  slackThreadTs: '178.200',
};

test('posts the final answer to the originating channel and thread before recording delivery', async () => {
  const state = harness();
  const result = await deliverSlackReply({ ...request, ...state.dependencies });

  assert.equal(result.status, 'sent');
  assert.deepEqual(state.posted, [{
    job_id: 'job-7',
    text: 'Substantive final answer',
    slack_channel: 'C123',
    slack_thread_ts: '178.200',
  }]);
  assert.deepEqual(state.written, [{ slack_channel: 'C123', slack_thread_ts: '178.200' }]);
});

test('suppresses a duplicate only when job, channel, and thread match', async () => {
  const state = harness({
    marker: { v: 1, kind: 'slack', slack_channel: 'C123', slack_thread_ts: '178.200' },
  });
  const result = await deliverSlackReply({ ...request, ...state.dependencies });

  assert.equal(result.status, 'duplicate');
  assert.equal(state.posted.length, 0);
  assert.equal(state.written.length, 0);
});

test('retries when the recorded target differs', async () => {
  const state = harness({
    marker: { v: 1, kind: 'slack', slack_channel: 'C123', slack_thread_ts: '178.100' },
  });
  const result = await deliverSlackReply({ ...request, ...state.dependencies });

  assert.equal(result.status, 'sent');
  assert.equal(state.posted.length, 1);
});

test('does not record delivery after a failed post and allows a later retry', async () => {
  const state = harness({
    postResults: [
      { ok: false, status: 503, body: 'temporary failure' },
      { ok: true, status: 200, body: 'ok' },
    ],
  });

  await assert.rejects(
    deliverSlackReply({ ...request, ...state.dependencies }),
    /Slack reply failed: 503 temporary failure/,
  );
  assert.equal(state.written.length, 0);

  const result = await deliverSlackReply({ ...request, ...state.dependencies });
  assert.equal(result.status, 'sent');
  assert.equal(state.posted.length, 2);
  assert.equal(state.written.length, 1);
});

test('rejects a missing channel without attempting delivery', async () => {
  const state = harness();
  await assert.rejects(
    deliverSlackReply({ ...request, slackChannel: '', ...state.dependencies }),
    /non-empty channel/,
  );
  assert.equal(state.posted.length, 0);
});
