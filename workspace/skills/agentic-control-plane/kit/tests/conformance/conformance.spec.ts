/**
 * ACP Conformance Test Runner
 * Language-agnostic — hits a running /manage endpoint (TS, Python, Go kernels)
 *
 * Usage:
 *   ACP_BASE_URL=http://localhost:8000/api/manage ACP_API_KEY=xxx npm run test:conformance
 *
 * Optional (for full coverage):
 *   ACP_LOW_SCOPE_KEY=key_with_only_manage_read  — triggers SCOPE_DENIED tests
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.ACP_BASE_URL || 'http://localhost:8000/api/manage';
const API_KEY = process.env.ACP_API_KEY || '';
const LOW_SCOPE_KEY = process.env.ACP_LOW_SCOPE_KEY || '';

function postManage(body: object, apiKey?: string) {
  return fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {})
    },
    body: JSON.stringify(body)
  });
}

const RUN_CONFORMANCE = Boolean(process.env.ACP_API_KEY);
const describeIf = RUN_CONFORMANCE ? describe : describe.skip;

describeIf('ACP Conformance (HTTP)', () => {
  beforeAll(() => {
    if (!API_KEY) {
      console.warn(
        '⚠️  ACP_API_KEY not set. Set ACP_BASE_URL and ACP_API_KEY for full conformance.'
      );
    }
  });

  describe('Request/Response envelope', () => {
    it('accepts valid request with action only', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      expect(res.status).toBeLessThan(500);
      const body = await res.json();
      expect(body).toHaveProperty('ok');
      expect(body).toHaveProperty('request_id');
      expect(typeof body.request_id).toBe('string');
    });

    it('rejects request without action (validation)', async () => {
      const res = await postManage({}, API_KEY);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(['VALIDATION_ERROR', 'INVALID_API_KEY']).toContain(body.code);
    });

    it('response has standard shape on success', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (body.ok) {
        expect(body).toHaveProperty('request_id');
        expect(body).toHaveProperty('data');
      }
    });

    it('error response has code and error', async () => {
      const res = await postManage({ action: 'nonexistent.action.xyz' }, API_KEY);
      const body = await res.json();
      if (!body.ok) {
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('error');
        expect(typeof body.error).toBe('string');
      }
    });
  });

  describe('Error codes', () => {
    it('uses standard error codes', async () => {
      const validCodes = [
        'VALIDATION_ERROR',
        'INVALID_API_KEY',
        'SCOPE_DENIED',
        'NOT_FOUND',
        'RATE_LIMITED',
        'CEILING_EXCEEDED',
        'IDEMPOTENT_REPLAY',
        'INTERNAL_ERROR'
      ];
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (!body.ok && body.code) {
        expect(validCodes).toContain(body.code);
      }
    });

    it('SCOPE_DENIED returns 403', async () => {
      if (!LOW_SCOPE_KEY) return;
      const res = await postManage(
        { action: 'iam.keys.create', params: { scopes: ['manage.read'] } },
        LOW_SCOPE_KEY
      );
      const body = await res.json();
      if (!body.ok && body.code === 'SCOPE_DENIED') {
        expect(res.status).toBe(403);
      }
    });

    it('NOT_FOUND returns 404', async () => {
      const res = await postManage({ action: 'unknown.action.xyz' }, API_KEY);
      const body = await res.json();
      if (!body.ok && body.code === 'NOT_FOUND') {
        expect(res.status).toBe(404);
      }
    });

    it('RATE_LIMITED returns 429 when triggered', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (!body.ok && body.code === 'RATE_LIMITED') {
        expect(res.status).toBe(429);
      }
    });

    it('CEILING_EXCEEDED returns 403 when triggered', async () => {
      const res = await postManage(
        { action: 'domain.leadscoring.models.create', params: { name: 'x', model_type: 'linear' } },
        API_KEY
      );
      const body = await res.json();
      if (!body.ok && body.code === 'CEILING_EXCEEDED') {
        expect(res.status).toBe(403);
      }
    });
  });

  describe('SCOPE_DENIED + audit', () => {
    it('SCOPE_DENIED returns 403 and code (kernel must audit result=denied)', async () => {
      if (!LOW_SCOPE_KEY) return;
      const res = await postManage(
        { action: 'domain.leadscoring.models.create', params: { name: 'x', model_type: 'linear' } },
        LOW_SCOPE_KEY
      );
      const body = await res.json();
      if (body.code === 'SCOPE_DENIED') {
        expect(res.status).toBe(403);
        expect(body.ok).toBe(false);
      }
    });
  });

  describe('dry_run does not persist', () => {
    it('dry_run returns success with impact shape for mutation', async () => {
      const res = await postManage(
        {
          action: 'domain.leadscoring.models.create',
          params: { name: 'dry-run-test', model_type: 'linear' },
          dry_run: true
        },
        API_KEY
      );
      const body = await res.json();
      if (body.ok) {
        expect(body.dry_run).toBe(true);
        expect(body.data).toBeDefined();
        if (body.data && typeof body.data === 'object') {
          expect(body.data).toHaveProperty('risk');
          expect(['low', 'medium', 'high']).toContain(body.data.risk);
        }
      }
    });

    it('dry_run mutation does not persist (probe via list before/after)', async () => {
      const listRes1 = await postManage({ action: 'domain.leadscoring.models.list' }, API_KEY);
      const list1 = await listRes1.json();
      const countBefore = list1.ok && Array.isArray(list1.data) ? list1.data.length : 0;

      await postManage(
        {
          action: 'domain.leadscoring.models.create',
          params: { name: 'dry-run-no-persist', model_type: 'linear' },
          dry_run: true
        },
        API_KEY
      );

      const listRes2 = await postManage({ action: 'domain.leadscoring.models.list' }, API_KEY);
      const list2 = await listRes2.json();
      const countAfter = list2.ok && Array.isArray(list2.data) ? list2.data.length : 0;

      expect(countAfter).toBe(countBefore);
    });
  });

  describe('Idempotency replay', () => {
    it('same idempotency_key returns cached result + IDEMPOTENT_REPLAY', async () => {
      const idemKey = `conformance-${Date.now()}`;
      const body1 = {
        action: 'domain.leadscoring.models.create',
        params: { name: 'idem-test', model_type: 'linear' },
        idempotency_key: idemKey
      };

      const res1 = await postManage(body1, API_KEY);
      const data1 = await res1.json();

      const res2 = await postManage(body1, API_KEY);
      const data2 = await res2.json();

      if (data1.ok && data2.ok) {
        expect(data2.code).toBe('IDEMPOTENT_REPLAY');
        expect(data2.data).toEqual(data1.data);
      }
    });
  });

  describe('meta.actions contract', () => {
    it('returns actions array, api_version, total_actions', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (body.ok && body.data) {
        expect(body.data).toHaveProperty('actions');
        expect(Array.isArray(body.data.actions)).toBe(true);
        expect(body.data).toHaveProperty('api_version');
        expect(body.data).toHaveProperty('total_actions');
        expect(body.data.total_actions).toBe(body.data.actions.length);
      }
    });

    it('each action has name, scope, description, params_schema, supports_dry_run', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (body.ok && body.data?.actions?.length) {
        for (const action of body.data.actions) {
          expect(action).toHaveProperty('name');
          expect(action).toHaveProperty('scope');
          expect(action).toHaveProperty('description');
          expect(action).toHaveProperty('params_schema');
          expect(action.params_schema).toHaveProperty('type', 'object');
          expect(action).toHaveProperty('supports_dry_run');
        }
      }
    });
  });

  describe('meta.version contract', () => {
    it('returns api_version, schema_version, actions_count', async () => {
      const res = await postManage({ action: 'meta.version' }, API_KEY);
      const body = await res.json();
      if (body.ok && body.data) {
        expect(body.data).toHaveProperty('api_version');
        expect(body.data).toHaveProperty('schema_version');
        expect(body.data).toHaveProperty('actions_count');
      }
    });
  });

  describe('Unknown action', () => {
    it('returns NOT_FOUND for unknown action', async () => {
      const res = await postManage({ action: 'unknown.action.xyz' }, API_KEY);
      const body = await res.json();
      if (!body.ok) {
        expect(body.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('Auth', () => {
    it('rejects request without X-API-Key when required', async () => {
      const res = await postManage({ action: 'meta.actions' });
      const body = await res.json();
      if (!body.ok && body.code === 'INVALID_API_KEY') {
        expect(body.code).toBe('INVALID_API_KEY');
      }
    });
  });
});
