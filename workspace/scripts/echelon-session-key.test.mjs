import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEchelonSessionKey } from './echelon-session-key.mjs';

const base = { agentId: 'main', tenantId: 'tenant-a', actorId: 'user-a', jobId: 'job-a' };

test('isolates Slack threads and channels', () => {
  const first = buildEchelonSessionKey({
    ...base,
    source: 'slack',
    metadata: { slack_channel: 'C123', slack_thread_ts: '178.100', slack_user: 'U1' },
  });
  const second = buildEchelonSessionKey({
    ...base,
    source: 'slack',
    metadata: { slack_channel: 'C123', slack_thread_ts: '178.200', slack_user: 'U1' },
  });

  assert.notEqual(first, second);
  assert.equal(first, 'agent:main:slack:tenant-a:C123:178.100');
});

test('keeps SMS continuity per sender', () => {
  assert.equal(
    buildEchelonSessionKey({ ...base, source: 'sms', metadata: { from_number: '+15551234567' } }),
    'agent:main:sms:tenant-a:+15551234567',
  );
});

test('isolates app signals by event', () => {
  const first = buildEchelonSessionKey({ ...base, source: 'app_signal', metadata: { signal_event_id: 'signal-a' } });
  const second = buildEchelonSessionKey({ ...base, source: 'app_signal', metadata: { signal_event_id: 'signal-b' } });
  assert.notEqual(first, second);
});

test('isolates Echelon UI users and conversations', () => {
  assert.equal(
    buildEchelonSessionKey({ ...base, source: '', metadata: {} }),
    'agent:main:echelon:tenant-a:user-a:user-a',
  );
  assert.equal(
    buildEchelonSessionKey({ ...base, source: '', metadata: { conversation_id: 'conversation-7' } }),
    'agent:main:echelon:tenant-a:user-a:conversation-7',
  );
});

test('isolates anonymous Echelon jobs instead of sharing a sandbox transcript', () => {
  const first = buildEchelonSessionKey({ ...base, actorId: '', jobId: 'job-a', source: '', metadata: {} });
  const second = buildEchelonSessionKey({ ...base, actorId: '', jobId: 'job-b', source: '', metadata: {} });
  assert.equal(first, 'agent:main:echelon:tenant-a:anonymous:job-a');
  assert.notEqual(first, second);
});
