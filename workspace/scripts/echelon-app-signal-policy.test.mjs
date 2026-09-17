import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicAppSignalResponse,
  isApprovalRequiredSignalJob,
  shouldBypassAppSignalModel,
} from './echelon-app-signal-policy.mjs';

test('app signals bypass the model by default', () => {
  assert.equal(shouldBypassAppSignalModel({ source: 'app_signal' }), true);
  assert.equal(shouldBypassAppSignalModel({ signal_event_id: 'signal-1' }), true);
});

test('normal user jobs do not bypass the model', () => {
  assert.equal(shouldBypassAppSignalModel({ source: 'slack' }), false);
});

test('explicit opt-in allows app signal model processing', () => {
  assert.equal(shouldBypassAppSignalModel({ source: 'app_signal' }, true), false);
});

test('approval-required app signals preserve the supplied notice without generation', () => {
  const message = 'APPROVAL REQUIRED: approve payout 123';
  const metadata = { source: 'app_signal', requires_approval: true };

  assert.equal(isApprovalRequiredSignalJob(metadata, message), true);
  assert.equal(buildDeterministicAppSignalResponse({ message, metadata }), message);
});

test('non-approval app signals return a deterministic receipt', () => {
  assert.equal(
    buildDeterministicAppSignalResponse({
      message: 'Internal details that should not be generated from',
      metadata: { source: 'app_signal', signal_type: 'payout_completed' },
    }),
    'Recorded automated app signal "payout_completed" without model processing.',
  );
});
