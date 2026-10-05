import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequest,
  normalizeSponsorOpsBase,
  parseBoolean,
  sponsorOpsHeaders,
} from './brand-connect-sponsor-ops.mjs';

test('uses only the approved Brand Connect sponsor ops base', () => {
  assert.equal(
    normalizeSponsorOpsBase(''),
    'https://evthfmqawotwbbkxfxep.supabase.co/functions/v1/agent-sponsor-ops',
  );
  assert.equal(
    normalizeSponsorOpsBase('https://evthfmqawotwbbkxfxep.supabase.co/functions/v1/agent-sponsor-ops/'),
    'https://evthfmqawotwbbkxfxep.supabase.co/functions/v1/agent-sponsor-ops',
  );
  assert.throws(() => normalizeSponsorOpsBase('https://example.com/functions/v1/agent-sponsor-ops'), /approved/);
  assert.throws(() => normalizeSponsorOpsBase('https://evthfmqawotwbbkxfxep.supabase.co/functions/v1/enrich-directory'), /agent-sponsor-ops/);
});

test('uses ENRICHMENT_AGENT_KEY bearer auth only', () => {
  assert.deepEqual(
    sponsorOpsHeaders({ env: { ENRICHMENT_AGENT_KEY: 'secret', AGENT_API_KEY: 'wrong' } }),
    { Accept: 'application/json', Authorization: 'Bearer secret' },
  );
  assert.throws(() => sponsorOpsHeaders({ env: {} }), /ENRICHMENT_AGENT_KEY/);
});

test('builds community lookup and stats routes', () => {
  assert.deepEqual(buildRequest('stats'), { method: 'GET', route: '/stats' });
  assert.deepEqual(buildRequest('search-communities', { query: 'Gaithersburg', state: 'MD', limit: '10' }), {
    method: 'GET',
    route: '/communities?query=Gaithersburg&state=MD&limit=10',
  });
});

test('run-cycle defaults to dry run and requires a community target', () => {
  assert.deepEqual(buildRequest('run-cycle', { community_id: 'abc' }), {
    method: 'POST',
    route: '/run-cycle',
    body: { agent_id: 'open-claw', community_id: 'abc', dry_run: true },
  });
  assert.throws(() => buildRequest('run-cycle', {}), /requires/);
});

test('live run-cycle requires explicit confirmation', () => {
  assert.throws(
    () => buildRequest('run-cycle', { community: 'Gaithersburg, MD', dry_run: 'false' }),
    /confirm-live/,
  );
  assert.equal(parseBoolean('yes'), true);
  assert.equal(parseBoolean('no'), false);
  assert.deepEqual(buildRequest('run-cycle', {
    community: 'Gaithersburg, MD',
    dry_run: 'false',
    confirm_live: true,
  }).body, {
    agent_id: 'open-claw',
    community: 'Gaithersburg, MD',
    dry_run: false,
  });
});
