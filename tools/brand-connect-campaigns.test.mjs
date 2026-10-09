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

test('community search accepts 1-500 results and rejects invalid limits before network', async () => {
  for (const limit of [1, 25, 50, 51, 499, 500]) {
    assert.equal(buildRequest('communities.search', { query: 'TX', limit }).query, `?communities=TX&limit=${limit}`);
  }
  for (const limit of [0, -1, 501, 1.5, '500', null, true]) {
    await assert.rejects(() => executeAction('communities.search', { query: 'TX', limit }, {}, {
      fetchImpl: () => assert.fail('Invalid limit must fail before network'),
    }), /limit must be an integer from 1 to 500/);
  }
});

test('radius searches encode name or coordinate anchors with sorting and limits', () => {
  assert.equal(buildRequest('communities.search', { query: ' Scottsdale ', radius_miles: 25, limit: 500 }).query,
    '?communities=Scottsdale&radius_miles=25&limit=500');
  assert.equal(buildRequest('communities.search', { lat: 33.49, lng: -111.92, radius_miles: 25, limit: 500, sort: 'members' }).query,
    '?lat=33.49&lng=-111.92&radius_miles=25&limit=500&sort=members');
  for (const radius_miles of [0.5, 25, 250]) {
    assert.ok(buildRequest('communities.search', { lat: 0, lng: 0, radius_miles }).query.includes(`radius_miles=${radius_miles}`));
  }
  assert.ok(buildRequest('communities.search', { lat: -90, lng: 180, radius_miles: 1 }).query.includes('lat=-90&lng=180'));
});

test('invalid radius inputs fail before authentication or network', async () => {
  const invalid = [
    ...[0, -1, 251, NaN, Infinity, '25', null, true].map(radius_miles => ({ query: 'Scottsdale', radius_miles })),
    { radius_miles: 25 }, { lat: 33, radius_miles: 25 }, { lng: -111, radius_miles: 25 },
    { lat: 33, lng: -111 }, { query: 'Scottsdale', lat: 33, lng: -111, radius_miles: 25 },
    ...[91, -91, NaN, Infinity, '33', null, true].map(lat => ({ lat, lng: -111, radius_miles: 25 })),
    ...[181, -181, NaN, Infinity, '-111', null, true].map(lng => ({ lat: 33, lng, radius_miles: 25 })),
  ];
  for (const params of invalid) {
    await assert.rejects(() => executeAction('communities.search', params, {}, {
      fetchImpl: () => assert.fail('Invalid geographic inputs must not reach network'),
    }), /radius_miles|lat|lng|anchor query|query must/);
  }
  assert.throws(() => buildRequest('brands.search', { query: 'brand', radius_miles: 25 }), /Unsupported/);
});

test('radius responses preserve anchor, distances, and counts unchanged', async () => {
  const payload = { anchor: { name: 'Scottsdale', lat: 33.49, lng: -111.92 }, radius_miles: 25, count: 1,
    communities: [{ id: communityId, name: 'Test', state: 'AZ', location: 'Test', distance_miles: 2.5,
      member_count: 200, ambassador_count: 3 }] };
  const result = await executeAction('communities.search', { query: 'Scottsdale', radius_miles: 25 }, {}, {
    env, fetchImpl: async (url, init) => {
      assert.equal(url, `${CAMPAIGN_API_URL}?communities=Scottsdale&radius_miles=25&limit=25`);
      assert.equal(init.method, 'GET');
      assert.equal(init.headers.Authorization, `Bearer ${env.ENRICHMENT_AGENT_KEY}`);
      return response(payload);
    },
  });
  assert.deepEqual(result.response, payload);
});

test('photos use product_image_url for RFQ, pre-campaign and PATCH, not downstream image_url', () => {
  const product_image_url = 'https://example.com/product.webp';
  for (const stage of ['rfq', 'pre_campaign']) {
    assert.equal(buildRequest('requests.create', { ...input, stage, product_image_url }, confirmation).body.product_image_url, product_image_url);
  }
  assert.deepEqual(buildRequest('requests.update', { id: brandId, product_image_url }, confirmation).body,
    { id: brandId, product_image_url });
  assert.throws(() => buildRequest('requests.create', { ...input, image_url: product_image_url }, confirmation), /Unsupported/);
  assert.throws(() => buildRequest('requests.update', { id: brandId, product_image_url: null }, confirmation), /product_image_url/);
});

test('community member sorting is validated and forwarded without stripping counts', async () => {
  assert.equal(buildRequest('communities.search', { query: ' TX ', limit: 50, sort: 'members' }).query,
    '?communities=TX&limit=50&sort=members');
  assert.equal(buildRequest('communities.search', { query: 'TX' }).query, '?communities=TX&limit=25');
  for (const sort of ['name', 'descending', '', null, 1, true, ['members']]) {
    await assert.rejects(() => executeAction('communities.search', { query: 'TX', sort }, {}, {
      fetchImpl: () => assert.fail('Invalid sort must fail before network'),
    }), /sort must be members/);
  }
  assert.throws(() => buildRequest('brands.search', { query: 'brand', sort: 'members' }), /Unsupported/);
  const payload = { communities: [{ id: communityId, name: 'Test, TX', state: 'TX', location: 'Test',
    member_count: 200, ambassador_count: 3 }], count: 1, query: 'TX' };
  const result = await executeAction('communities.search', { query: 'TX', limit: 500, sort: 'members' }, {}, {
    env, fetchImpl: async (url, init) => {
      assert.equal(url, `${CAMPAIGN_API_URL}?communities=TX&limit=500&sort=members`);
      assert.equal(init.method, 'GET');
      return response(payload);
    },
  });
  assert.deepEqual(result.response, payload);
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

test('pre-campaign creation permits no offering and validates stage and deadline', () => {
  const { request_type, ...base } = input;
  const params = { ...base, stage: 'pre_campaign', interest_deadline: '2026-11-15' };
  assert.deepEqual(buildRequest('requests.create', params, confirmation).body,
    { ...params, ambassadors_only: false });
  for (const offering of ['sampling', 'seeding', 'irl_gifting']) {
    assert.equal(buildRequest('requests.create', { ...params, request_type: offering }, confirmation).body.request_type, offering);
  }
  for (const stage of [undefined, 'rfq']) {
    assert.throws(() => buildRequest('requests.create', { ...base, stage }, confirmation), /request_type/);
  }
  for (const stage of ['draft', 'sent', '', null, true]) {
    assert.throws(() => buildRequest('requests.create', { ...input, stage }, confirmation), /stage/);
  }
  assert.throws(() => buildRequest('requests.create', { ...params, request_type: null }, confirmation), /request_type/);
  assert.throws(() => buildRequest('requests.create', { ...params, interest_deadline: '2026-02-30' }, confirmation), /interest_deadline/);
  assert.throws(() => buildRequest('requests.create', params), /confirm-target/);
  assert.throws(() => buildRequest('requests.update', { id: brandId, stage: 'rfq' }, confirmation), /Unsupported/);
  assert.equal(buildRequest('requests.update', { id: brandId, interest_deadline: '2026-11-15' }, confirmation).body.interest_deadline, '2026-11-15');
});

test('pre-campaign POST stays submitted and checks the returned stage without retrying', async () => {
  const { request_type, ...base } = input;
  for (const stage of ['pre_campaign', 'rfq', undefined]) {
    let calls = 0;
    const run = () => executeAction('requests.create', { ...base, stage: 'pre_campaign' }, confirmation, {
      env, fetchImpl: async (url, init) => {
        calls++;
        assert.equal(init.method, 'POST');
        assert.equal(JSON.parse(init.body).stage, 'pre_campaign');
        assert.ok(!Object.hasOwn(JSON.parse(init.body), 'request_type'));
        return response({ id: brandId, status: 'submitted', stage }, 201);
      },
    });
    if (stage === 'pre_campaign') assert.equal((await run()).response.stage, stage);
    else await assert.rejects(run, /outcome uncertain/);
    assert.equal(calls, 1);
  }
});

test('pre-campaign reads preserve interest counts and conversion links', async () => {
  const payload = { request: { id: brandId, stage: 'pre_campaign', interest_status: 'draft', converted_to_draft_id: null },
    interest: { total: 3, by_community: { [communityId]: { community_name: 'Test', moms: 2, ambassadors: 1 } } } };
  const result = await executeAction('requests.get', { id: brandId }, {}, { env, fetchImpl: async () => response(payload) });
  assert.deepEqual(result.response, payload);
});

test('pre-campaign PATCH allows only unconverted draft interest checks', async () => {
  for (const interest_status of ['draft', 'sent', 'closed', 'converted', null, undefined]) {
    for (const converted_to_draft_id of [null, communityId]) {
      let calls = 0;
      const run = () => executeAction('requests.update', { id: brandId, product_name: 'New name' }, confirmation, {
        env, fetchImpl: async (url, init) => {
          calls++;
          if (init.method === 'GET') return response({ request: { id: brandId, stage: 'pre_campaign',
            status: 'submitted', interest_status, converted_to_draft_id } });
          return response({ id: brandId, request: { id: brandId }, updated_fields: ['product_name'] });
        },
      });
      if (interest_status === 'draft' && !converted_to_draft_id) {
        assert.equal((await run()).ok, true);
        assert.equal(calls, 2);
      } else {
        await assert.rejects(run, /Only draft pre-campaigns/);
        assert.equal(calls, 1);
      }
    }
  }
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
  for (const params of [{ query: '' }, { query: 'denver', limit: 501 }, { query: 'denver', limit: '25' }, { query: 'denver', url: 'https://evil.example' }]) assert.throws(() => buildRequest('communities.search', params));
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

test('one-step pipeline creation passes exact spelling and all campaign targets', async () => {
  const { brand_account_id, ...campaign } = input;
  const name = "Alan's Brand";
  const params = { ...campaign, brand_name: name, create_brand: true, brand_website: 'https://example.com',
    ambassadors_only: true, community_ids: Array.from({ length: 20 }, (_, i) => `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`) };
  let calls = 0;
  const result = await executeAction('requests.create', params, { confirmTarget: name, confirmBrandName: name }, { env, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, CAMPAIGN_API_URL);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), params);
    return response({ id: communityId, status: 'submitted', brand: name, brand_account_id: brandId, brand_created: true }, 201);
  } });
  assert.equal(calls, 1);
  assert.equal(result.response.brand_created, true);
  assert.equal(result.response.brand_account_id, brandId);
});

test('new-brand email confirmation is separate from exact name confirmation', () => {
  const { brand_account_id, ...base } = input;
  const params = { ...base, brand_name: "Alan's Brand", brand_email: ' Optional@example.com ', create_brand: true };
  const result = buildRequest('requests.create', params, { confirmTarget: 'optional@example.com', confirmBrandName: "Alan's Brand" });
  assert.equal(result.body.brand_email, 'optional@example.com');
  assert.equal(result.body.brand_name, "Alan's Brand");
  assert.throws(() => buildRequest('requests.create', params, { confirmTarget: "Alan's Brand", confirmBrandName: "Alan's Brand" }), /confirm-target/);
});

test('brand creation requires exact explicit permission and validated fields before network', async () => {
  const { brand_account_id, ...base } = input;
  const name = "Alan's Brand";
  const params = { ...base, brand_name: name, create_brand: true };
  for (const confirmBrandName of [undefined, "Allen's Brand", "alan's brand", `${name} `]) {
    await assert.rejects(() => executeAction('requests.create', params, { confirmTarget: name, confirmBrandName },
      { fetchImpl: () => assert.fail('No network without exact creation confirmation') }), /confirm-brand-name/);
  }
  for (const extra of [{ brand_name: '' }, { brand_name: 'x'.repeat(201) }, { create_brand: 'true' },
    { create_brand: 1 }, { brand_account_id: brandId }, { brand_website: 'http://example.com' },
    { brand_email: `${'x'.repeat(250)}@example.com` }]) {
    assert.throws(() => buildRequest('requests.create', { ...params, ...extra }, { confirmTarget: name, confirmBrandName: name }));
  }
});

test('name lookup never silently enables pipeline creation', () => {
  const { brand_account_id, ...base } = input;
  const result = buildRequest('requests.create', { ...base, brand_name: 'Existing Brand' }, { confirmTarget: 'Existing Brand' });
  assert.equal(result.body.brand_name, 'Existing Brand');
  assert.ok(!Object.hasOwn(result.body, 'create_brand'));
  assert.equal(buildRequest('requests.create', { ...base, brand_name: 'Existing Brand', create_brand: false }, { confirmTarget: 'Existing Brand' }).body.create_brand, false);
  assert.throws(() => buildRequest('requests.update', { id: brandId, brand_website: 'https://example.com' }, confirmation), /brand identity/);
});

test('PATCH pipeline reassignment retains request confirmation and requires exact brand permission', () => {
  const params = { id: brandId, brand_name: 'New Brand', create_brand: true };
  assert.throws(() => buildRequest('requests.update', params, confirmation), /confirm-brand-name/);
  assert.deepEqual(buildRequest('requests.update', params, { ...confirmation, confirmBrandName: 'New Brand' }),
    { method: 'PATCH', query: '', body: params });
  assert.throws(() => buildRequest('requests.update', params, { confirmTarget: 'New Brand', confirmBrandName: 'New Brand' }), /request id/);
  assert.equal(parseCliArgs(['requests.update', '--confirm-brand-name', 'New Brand', '--confirm-target', brandId]).options.confirmBrandName, 'New Brand');
});
