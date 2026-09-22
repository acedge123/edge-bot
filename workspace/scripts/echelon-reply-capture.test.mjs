import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assistantMessagePhase,
  assistantMessageText,
  latestAssistantTimestamp,
  pickFinalAssistantReply,
  waitForFinalAssistantReply,
} from './echelon-reply-capture.mjs';

const message = ({ timestamp, text, phase, content, parts }) => ({
  role: 'assistant',
  timestamp,
  ...(phase ? { phase } : {}),
  ...(text !== undefined ? { text } : {}),
  ...(content !== undefined ? { content } : {}),
  ...(parts !== undefined ? { parts } : {}),
});

test('waits past preserved incident commentary and selects the final answer', () => {
  const messages = [
    message({
      timestamp: '2026-09-19T17:22:07.956Z',
      phase: 'commentary',
      content: [{ type: 'output_text', text: 'I’ll compare the two workbooks tab-by-tab.' }],
    }),
    message({
      timestamp: '2026-09-19T17:29:32.723Z',
      phase: 'final_answer',
      content: [{ type: 'output_text', text: 'The reconciliation is complete.' }],
    }),
  ];

  assert.equal(pickFinalAssistantReply(messages, 0), 'The reconciliation is complete.');
});

test('phase is authoritative even when final wording resembles progress', () => {
  const final = message({
    timestamp: 200,
    phase: 'final_answer',
    content: [{ type: 'text', text: 'I’ll follow up separately, but the requested report is complete.' }],
  });
  assert.equal(
    pickFinalAssistantReply([final], 100),
    'I’ll follow up separately, but the requested report is complete.',
  );
});

test('explicit final answer outranks later unphased status text', () => {
  const final = message({
    timestamp: 200,
    phase: 'final_answer',
    content: [{ type: 'text', text: 'The requested analysis is complete.' }],
  });
  const laterStatus = message({ timestamp: 300, content: [{ type: 'text', text: 'Run metadata recorded.' }] });
  assert.equal(
    pickFinalAssistantReply([final, laterStatus], 100),
    'The requested analysis is complete.',
  );
});

test('reads phase from OpenClaw text signatures', () => {
  const commentary = message({
    timestamp: 200,
    content: [{
      type: 'text',
      text: 'Checking the source now.',
      textSignature: JSON.stringify({ v: 1, id: 'comment-1', phase: 'commentary' }),
    }],
  });
  assert.equal(assistantMessagePhase(commentary), 'commentary');
  assert.equal(pickFinalAssistantReply([commentary], 100), '');
});

test('supports text, string content, nested text values, and parts', () => {
  assert.equal(assistantMessageText(message({ text: ' direct ' })), 'direct');
  assert.equal(assistantMessageText(message({ content: ' content ' })), 'content');
  assert.equal(
    assistantMessageText(message({ content: [{ text: { value: 'nested' } }] })),
    'nested',
  );
  assert.equal(
    assistantMessageText(message({ parts: [{ output_text: 'part one' }, { value: ' + two' }] })),
    'part one + two',
  );
});

test('uses progress-language detection only for unphased legacy messages', () => {
  const progress = message({ timestamp: 200, content: [{ text: 'I’ll check the data and report back.' }] });
  const final = message({ timestamp: 300, content: [{ text: 'The data is consistent across all rows.' }] });
  assert.equal(pickFinalAssistantReply([progress], 100), '');
  assert.equal(pickFinalAssistantReply([progress, final], 100), 'The data is consistent across all rows.');
});

test('normalizes mixed timestamp shapes and ignores prior replies', () => {
  const old = message({ timestamp: '2026-09-19T17:00:00.000Z', content: [{ text: 'Old answer' }] });
  const baseline = latestAssistantTimestamp([old]);
  const current = message({ timestamp: '2026-09-19T17:01:00.000Z', content: [{ text: 'Current answer' }] });
  assert.equal(pickFinalAssistantReply([old, current], baseline), 'Current answer');
});

test('polls through progress and returns only the final answer', async () => {
  let clock = 0;
  let readCount = 0;
  const progressEvents = [];
  const histories = [
    { messages: [message({ timestamp: 2, phase: 'commentary', content: [{ text: 'I’ll research this.' }] })] },
    { messages: [
      message({ timestamp: 2, phase: 'commentary', content: [{ text: 'I’ll research this.' }] }),
      message({ timestamp: 3, phase: 'final_answer', content: [{ text: 'Research complete.' }] }),
    ] },
  ];

  const result = await waitForFinalAssistantReply({
    baselineTimestamp: 1,
    timeoutMs: 100,
    pollIntervalMs: 10,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    readHistory: async () => histories[Math.min(readCount++, histories.length - 1)],
    onProgress: (reply) => progressEvents.push(reply.text),
  });

  assert.equal(result, 'Research complete.');
  assert.deepEqual(progressEvents, ['I’ll research this.']);
});

test('times out when only commentary is produced', async () => {
  let clock = 0;
  await assert.rejects(
    waitForFinalAssistantReply({
      baselineTimestamp: 1,
      timeoutMs: 20,
      pollIntervalMs: 10,
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      readHistory: async () => ({
        messages: [message({ timestamp: 2, phase: 'commentary', content: [{ text: 'Still working.' }] })],
      }),
    }),
    /Timeout waiting for agent response/,
  );
});
