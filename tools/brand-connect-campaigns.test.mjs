import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIONS, CAMPAIGN_API_URL, buildRequest, executeAction, parseCliArgs } from './brand-connect-campaigns.mjs';

const brandId = '11111111-1111-4111-8111-111111111111';
const communityId = '22222222-2222-4222-8222-222222222222';
const input = { brand_account_id: brandId, request_type: 'sampling', product_name: 'Product', community_ids: [communityId] };
const confirmation = { confirmTarget: brandId };
const env = { ENRICHMENT_AGENT_KEY: 'private-outreach-key' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('registry exposes only lookup, submission, and status', () => {
  assert.deepEqual(ACTIONS, ['communities.search', 'brands.search', 'brands.resolve-email', 'requests.create', 'requests.get', 'requests.update']);
  for (const action of ['approve', 'send', 'activate', 'requests.delete']) assert.throws(() => buildRequest(action), /Unsupported action/);
});

test('lookups encode the exact API queries', () => {
  assert.deepEqual(buildRequest('communities.search', { query: ' Denver ', limit: 25 }), { method: 'GET', query: '?communities=Denver&limit=25' });
  assert.equal(buildRequest('brands.search', { query: 'good crisp' }).query, '?brands=good+crisp');
  assert.equal(buildRequest('brands.resolve-email', { brand_email: ' Billing@Brand.com ' }).query, '?brand_email=billing%40brand.com');
  assert.equal(buildRequest('requests.get', { id: brandId }).query, `?id=${brandId}`);
});

test('create normalizes confirmed inputs and rejects lifecycle flags', () => {
  assert.deepEqual(buildRequest('requests.create', { ...input, product_name: ' Product ', community_ids: [communityId, communityId] }, confirmation),
    { method: 'POST', query: '', body: { ...input, ambassadors_only: false } });
  for (const request_type of ['sampling', 'seeding', 'irl_gifting']) assert.equal(buildRequest('requests.create', { ...input, request_type }, confirmation).body.request_type, request_type);
  for (const extra of [{ status: 'sent' }, { notify: false }]) assert.throws(() => buildRequest('requests.create', { ...input, ...extra }, confirmation), /Unsupported/);
  assert.throws(() => buildRequest('requests.create', input), /confirm-target/);
});

test('ID wins over email and email-only requests require exact confirmation', () => {
  const { brand_account_id, ...base } = input;
  assert.equal(buildRequest('requests.create', { ...base, brand_email: 'Brand@example.com' }, { confirmTarget: 'brand@example.com' }).body.brand_email, 'brand@example.com');
  assert.throws(() => buildRequest('requests.create', { ...input, brand_email: 'brand@example.com' }, { confirmTarget: 'brand@example.com' }), /confirm-target/);
  assert.throws(() => buildRequest('requests.create', base, confirmation), /required/);
});

test('invalid inputs fail before authentication or network', async () => {
  const changes = [
    { product_name: '' }, { product_name: 'x'.repeat(201) }, { request_type: 'discount' },
    { community_ids: [] }, { community_ids: Array(501).fill(communityId) }, { community_ids: ['invented'] },
    { target_recipients: 0 }, { target_recipients: 1.5 }, { target_recipients: 1_000_001 },
    { start_date: '2026-02-30' }, { start_date: '2026-11-15', end_date: '2026-11-01' },
    { product_url: 'http://example.com' }, { product_image_url: 'https://user:pass@example.com' },
    { instructions: 'x'.repeat(4001) }, { ambassadors_only: 'false' },
  ];
  for (const change of changes) await assert.rejects(() => executeAction('requests.create', { ...input, ...change }, confirmation, { fetchImpl: () => assert.fail('No network for invalid inputs') }));
  for (const params of [{ query: '' }, { query: 'denver', limit: 51 }, { query: 'denver', limit: '25' }, { query: 'denver', url: 'https://evil.example' }]) assert.throws(() => buildRequest('communities.search', params));
});

test('uses sponsor auth with pinned URL and blocks redirect credential leakage', async () => {
  const result = await executeAction('brands.search', { query: 'good crisp' }, {}, { env, fetchImpl: async (url, init) => {
    assert.equal(url, `${CAMPAIGN_API_URL}?brands=good+crisp`);
    assert.equal(init.headers.Authorization, `Bearer ${env.ENRICHMENT_AGENT_KEY}`);
    assert.equal(init.redirect, 'error');
    return response({ brands: [{ id: brandId, name: 'Good Crisp', primary_email: null }] });
  } });
  assert.equal(result.ok, true);
  assert.equal(result.response.brands[0].primary_email, null);
});

test('creation makes one POST and stops at submitted', async () => {
  let calls = 0;
  const result = await executeAction('requests.create', input, confirmation, { env, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, CAMPAIGN_API_URL);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { ...input, ambassadors_only: false });
    return response({ id: brandId, status: 'submitted', next_step: 'Awaiting admin quote' }, 201);
  } });
  assert.equal(calls, 1);
  assert.equal(result.response.status, 'submitted');
});

test('API errors preserve details without retries or exposing the key', async () => {
  for (const status of [400, 401, 404, 409, 500]) {
    let calls = 0;
    const result = await executeAction('requests.create', input, confirmation, { env, fetchImpl: async () => {
      calls++;
      return response({ error: `Error ${env.ENRICHMENT_AGENT_KEY}`, missing: [communityId] }, status);
    } });
    assert.equal(result.status, status);
    assert.equal(result.ok, false);
    assert.deepEqual(result.response.missing, [communityId]);
    assert.ok(!JSON.stringify(result).includes(env.ENRICHMENT_AGENT_KEY));
    assert.equal(calls, 1);
  }
});

test('uncertain outcomes are never retried automatically', async () => {
  let calls = 0;
  await assert.rejects(() => executeAction('requests.create', input, confirmation, { env, fetchImpl: async () => {
    calls++;
    throw new Error('connection lost');
  } }), /connection lost/);
  assert.equal(calls, 1);
  await assert.rejects(() => executeAction('requests.create', input, confirmation, { env, fetchImpl: async () => response({ id: brandId, status: 'sent' }, 201) }), /outcome uncertain/);
});

test('missing auth and malformed CLI do not call the API', async () => {
  await assert.rejects(() => executeAction('brands.search', { query: 'brand' }, {}, { env: {}, fetchImpl: () => assert.fail('No credentials') }), /ENRICHMENT_AGENT_KEY/);
  assert.deepEqual(parseCliArgs(['requests.get', '--params-json', JSON.stringify({ id: brandId })]), { action: 'requests.get', params: { id: brandId }, options: {} });
  for (const args of [['brands.search', '--params-json'], ['brands.search', '--params-json', 'bad'], ['requests.get', '--url', 'https://evil.example']]) assert.throws(() => parseCliArgs(args));
});

test('PATCH sends only confirmed changes without creation defaults', () => {
  assert.deepEqual(buildRequest('requests.update', { id: brandId, target_recipients: 500 }, confirmation),
    { method: 'PATCH', query: '', body: { id: brandId, target_recipients: 500 } });
  assert.deepEqual(buildRequest('requests.update', { id: brandId, community_ids: [communityId, communityId], ambassadors_only: false }, confirmation).body,
    { id: brandId, community_ids: [communityId], ambassadors_only: false });
  assert.deepEqual(buildRequest('requests.update', { id: brandId, brand_account_id: communityId, instructions: '' }, confirmation).body,
    { id: brandId, brand_account_id: communityId, instructions: '' });
});

test('PATCH rejects missing changes, confirmation, invalid fields and values before network', async () => {
  for (const params of [{ id: brandId }, { id: 'invalid', product_name: 'Name' },
    { id: brandId, status: 'submitted' }, { id: brandId, product_name: '' },
    { id: brandId, community_ids: [] }, { id: brandId, target_recipients: null },
    { id: brandId, ambassadors_only: null }, { id: brandId, instructions: null },
    { id: brandId, product_url: 'javascript:alert(1)' }, { id: brandId, create_brand: true }]) {
    await assert.rejects(() => executeAction('requests.update', params, confirmation, { fetchImpl: () => assert.fail('Invalid PATCH must not call network') }));
  }
  assert.throws(() => buildRequest('requests.update', { id: brandId, product_name: 'Name' }, { confirmTarget: communityId }), /confirm-target/);
});

test('PATCH checks current request then preserves partial payload and response', async () => {
  const calls = [];
  const payload = { id: brandId, status: 'submitted', updated_fields: ['target_recipients'], request: { id: brandId, target_recipients: 500 } };
  const result = await executeAction('requests.update', { id: brandId, target_recipients: 500 }, confirmation, { env, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    return response(init.method === 'GET' ? { request: { id: brandId, status: 'submitted' } } : payload);
  } });
  assert.deepEqual(calls, [{ url: `${CAMPAIGN_API_URL}?id=${brandId}`, method: 'GET', body: undefined },
    { url: CAMPAIGN_API_URL, method: 'PATCH', body: JSON.stringify({ id: brandId, target_recipients: 500 }) }]);
  assert.deepEqual(result.response, payload);
});

test('PATCH rejects non-submitted requests and cross-existing date inversion without writing', async () => {
  for (const existing of [{ id: brandId, status: 'proposal_in_progress' },
    { id: brandId, status: 'submitted', start_date: '2026-11-10', end_date: '2026-11-15' }]) {
    let calls = 0;
    await assert.rejects(() => executeAction('requests.update', { id: brandId, end_date: '2026-11-01' }, confirmation, { env, fetchImpl: async (url, init) => {
      calls++;
      assert.equal(init.method, 'GET');
      return response({ request: existing });
    } }), /submitted|before start_date/);
    assert.equal(calls, 1);
  }
});

test('PATCH preserves quote locks, source restrictions, missing IDs, and auth errors without retries', async () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    let calls = 0;
    const result = await executeAction('requests.update', { id: brandId, community_ids: [communityId] }, confirmation, { env, fetchImpl: async (url, init) => {
      calls++;
      return response(init.method === 'GET' ? { request: { id: brandId, status: 'submitted' } } :
        { error: 'Submit a new request', missing: [communityId] }, init.method === 'GET' ? 200 : status);
    } });
    assert.equal(calls, 2);
    assert.equal(result.status, status);
    assert.equal(result.ok, false);
    assert.deepEqual(result.response.missing, [communityId]);
  }
});

test('PATCH stops on failed preflight and malformed or uncertain write outcomes', async () => {
  let calls = 0;
  const blocked = await executeAction('requests.update', { id: brandId, product_name: 'Name' }, confirmation, { env, fetchImpl: async () => { calls++; return response({ error: 'Not found' }, 404); } });
  assert.equal(blocked.action, 'requests.update');
  assert.equal(blocked.status, 404);
  assert.equal(calls, 1);
  for (const malformed of [{ id: communityId }, { id: brandId, request: { id: communityId }, updated_fields: [] }]) {
    await assert.rejects(() => executeAction('requests.update', { id: brandId, product_name: 'Name' }, confirmation, { env, fetchImpl: async (url, init) =>
      response(init.method === 'GET' ? { request: { id: brandId, status: 'submitted' } } : malformed) }), /outcome uncertain/);
  }
});
