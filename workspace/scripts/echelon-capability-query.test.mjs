import test from 'node:test';
import assert from 'node:assert/strict';
import { answerCapabilityQuery } from './echelon-capability-query.mjs';

const installed = new Set(['secure-gmail', 'repo-map']);
const hasSkill = (skill) => installed.has(skill);

test('answers Gmail capability questions without a model', () => {
  assert.equal(
    answerCapabilityQuery('Do you still have the Gmail skill?', hasSkill),
    'Yes. The `secure-gmail` skill is installed in this EdgeBot runtime.',
  );
  assert.equal(
    answerCapabilityQuery('Can you access email?', hasSkill),
    'Yes. The `secure-gmail` skill is installed in this EdgeBot runtime.',
  );
});

test('reports missing skills without guessing', () => {
  assert.equal(
    answerCapabilityQuery('Is the calendar skill installed?', hasSkill),
    'No. The `calendar` skill is not installed in this EdgeBot runtime.',
  );
});

test('leaves broader capability questions to the model router', () => {
  assert.equal(answerCapabilityQuery('Can you plan my week?', hasSkill), null);
});
