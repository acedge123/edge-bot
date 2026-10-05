import assert from 'node:assert/strict';
import test from 'node:test';

import { pickRoutedAgent } from './echelon-model-route.mjs';

test('defaults ordinary agent work to the lightweight model', () => {
  assert.deepEqual(pickRoutedAgent('Help me prepare for tomorrow'), {
    agentId: 'main',
    reason: 'default:lightweight',
  });
});

test('routes explicit lightweight work to Luna', () => {
  assert.equal(pickRoutedAgent('@model:gpt-5.6-luna rewrite this').agentId, 'main-light');
  assert.equal(pickRoutedAgent('@model:gpt-5-mini rewrite this').agentId, 'main-light');
  assert.equal(pickRoutedAgent('Anything', { model_tier: 'lightweight' }).agentId, 'main-light');
  assert.equal(pickRoutedAgent('Proofread this paragraph').agentId, 'main-light');
});

test('does not let a transformation verb downgrade complex work', () => {
  assert.equal(pickRoutedAgent('Summarize this security review').agentId, 'main-critical');
  assert.equal(pickRoutedAgent('Rewrite this architecture plan').agentId, 'main-med');
});

test('routes code and explicit Sol work to Sol-backed agents', () => {
  assert.equal(pickRoutedAgent('Fix this TypeScript test').agentId, 'main-med');
  assert.equal(pickRoutedAgent('@model:gpt-5.6-sol answer this').agentId, 'main-critical');
});

test('keeps workbook analysis on the lightweight route', () => {
  assert.deepEqual(
    pickRoutedAgent('Compare Personal Monthly Bills with 2026 Test', {
      attachments: [{ filename: '2026 Test.xlsx' }],
    }),
    { agentId: 'main', reason: 'attachment:workbook' },
  );
  assert.equal(pickRoutedAgent('Review the 2026 Test workbook').agentId, 'main');
  assert.equal(pickRoutedAgent('Fix this TypeScript unit test').agentId, 'main-med');
});
