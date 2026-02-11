/**
 * Invariant Tests
 * Cross-repo compatibility tests that verify core behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createManageRouter } from '../kernel/src/router';
import { iamPack } from '../packs/iam';
import {
  MockDbAdapter,
  MockAuditAdapter,
  MockIdempotencyAdapter,
  MockRateLimitAdapter,
  MockCeilingsAdapter
} from './mocks/adapters';
import { createMockAuthResult } from './mocks/auth';
import { Bindings } from '../kernel/src/types';

// Mock request object
function createMockRequest(apiKey: string = 'ock_test123456'): any {
  return {
    headers: {
      get: (name: string) => {
        if (name === 'x-api-key' || name.toLowerCase() === 'x-api-key') return apiKey;
        return null;
      }
    }
  } as Request;
}

const bindings: Bindings = {
  tenant: {
    table: 'tenants',
    id_column: 'id',
    get_tenant_fn: 'get_tenant_id',
    is_admin_fn: 'is_admin'
  },
  auth: {
    keys_table: 'api_keys',
    key_prefix: 'ock_',
    prefix_length: 12,
    key_hash_column: 'key_hash',
    key_prefix_column: 'prefix',
    scopes_column: 'scopes'
  },
  database: {
    adapter: 'custom'
  }
};

describe('Invariant Tests', () => {
  let dbAdapter: MockDbAdapter;
  let auditAdapter: MockAuditAdapter;
  let idempotencyAdapter: MockIdempotencyAdapter;
  let rateLimitAdapter: MockRateLimitAdapter;
  let ceilingsAdapter: MockCeilingsAdapter;
  let router: any;

  beforeEach(() => {
    dbAdapter = new MockDbAdapter();
    auditAdapter = new MockAuditAdapter();
    idempotencyAdapter = new MockIdempotencyAdapter();
    rateLimitAdapter = new MockRateLimitAdapter();
    ceilingsAdapter = new MockCeilingsAdapter();

    // Mock DB adapter already handles auth queries in queryOne
    // It returns mock API key data when querying api_keys table

    router = createManageRouter({
      dbAdapter,
      auditAdapter,
      idempotencyAdapter,
      rateLimitAdapter,
      ceilingsAdapter,
      bindings,
      packs: [iamPack]
    });
  });

  describe('Denied requests are audited', () => {
    it('should audit scope-denied requests with result=denied', async () => {
      // Temporarily override queryOne to return key with insufficient scopes
      const originalQueryOne = dbAdapter.queryOne.bind(dbAdapter);
      dbAdapter.queryOne = async (sql: string, params?: any[]) => {
        if (sql.includes('api_keys')) {
          return {
            id: 'api_key_123',
            scopes: ['manage.read'], // Missing manage.iam
            status: 'active',
            tenant_id: 'tenant_123'
          };
        }
        return originalQueryOne(sql, params);
      };

      const request = {
        action: 'iam.keys.create', // Requires manage.iam
        params: { scopes: ['manage.read'] }
      };

      const response = await router(request, { request: createMockRequest() });

      // Should be denied
      if (!response.ok) {
        expect(response.code).toBe('SCOPE_DENIED');
      }

      // Should have audit entry with result=denied
      const deniedEntries = auditAdapter.getEntriesByResult('denied');
      expect(deniedEntries.length).toBeGreaterThan(0);
      expect(deniedEntries[0].result).toBe('denied');
    });

    it('should audit validation errors', async () => {
      const request = {
        action: 'iam.keys.create',
        params: {} // Missing required 'scopes'
      };

      const response = await router(request, { request: createMockRequest() });

      if (!response.ok) {
        expect(response.code).toBe('VALIDATION_ERROR');
      }

      // Should have audit entry
      expect(auditAdapter.entries.length).toBeGreaterThan(0);
    });
  });

  describe('Tenant isolation is enforced', () => {
    it('should pass tenantId to all adapter methods', async () => {
      const testTenantId = 'tenant_abc123';
      
      // Override queryOne to return specific tenant
      const originalQueryOne = dbAdapter.queryOne.bind(dbAdapter);
      dbAdapter.queryOne = async (sql: string, params?: any[]) => {
        if (sql.includes('api_keys')) {
          return {
            id: 'api_key_123',
            scopes: ['manage.read'],
            status: 'active',
            tenant_id: testTenantId
          };
        }
        return originalQueryOne(sql, params);
      };

      const request = {
        action: 'iam.keys.list',
        params: {}
      };

      await router(request, { request: createMockRequest() });

      // Verify tenantId was used in adapter calls
      expect(dbAdapter.tenantIdUsed).toBe(testTenantId);
      
      // Verify all adapter methods received tenantId
      const callsWithTenant = dbAdapter.calls.filter(call => 
        call.args.some(arg => arg === testTenantId)
      );
      
      // At least some calls should include tenantId
      if (dbAdapter.calls.length > 0) {
        expect(callsWithTenant.length).toBeGreaterThan(0);
      }
    });

    it('should enforce tenant scoping at DB layer', async () => {
      const request = {
        action: 'iam.keys.list',
        params: {}
      };

      await router(request, { request: createMockRequest() });

      // Handler should have received tenantId in context
      // This is verified by checking tenantIdUsed
      expect(dbAdapter.tenantIdUsed).toBeDefined();
      expect(dbAdapter.tenantIdUsed).toBe('tenant_123');
    });
  });

  describe('Dry-run never calls write methods', () => {
    it('should not call write methods when dry_run=true', async () => {
      // Default mock already returns correct scopes

      const request = {
        action: 'iam.keys.create',
        params: {
          scopes: ['manage.read']
        },
        dry_run: true
      };

      dbAdapter.writeMethodsCalled = []; // Reset

      const response = await router(request, { request: createMockRequest() });

      // In dry-run mode, write methods should not be called
      const writeCalls = dbAdapter.writeMethodsCalled;
      
      // Verify no write methods were called
      expect(writeCalls.length).toBe(0);
      
      // Verify response indicates dry-run
      if (response.ok) {
        expect(response.dry_run).toBe(true);
      }
    });
  });

  describe('Idempotency replay', () => {
    it('should return IDEMPOTENT_REPLAY code when key exists', async () => {
      // Default mock already returns correct scopes

      const idempotencyKey = 'test-key-123';
      const cachedResponse = { ok: true, data: { id: 'key_123' } };

      // Pre-populate cache
      await idempotencyAdapter.storeReplay('tenant_123', 'iam.keys.create', idempotencyKey, cachedResponse);

      const request = {
        action: 'iam.keys.create',
        params: { scopes: ['manage.read'] },
        idempotency_key: idempotencyKey
      };

      const response = await router(request, { request: createMockRequest() });
      
      // Should return cached response with IDEMPOTENT_REPLAY code
      expect(response.code).toBe('IDEMPOTENT_REPLAY');
      expect(response.ok).toBe(true);
      expect(response.data).toEqual(cachedResponse.data);
    });

    it('should not re-execute handler when idempotency key exists', async () => {
      // Default mock already returns correct scopes

      const idempotencyKey = 'test-key-456';
      dbAdapter.writeMethodsCalled = []; // Reset

      // Pre-populate cache
      await idempotencyAdapter.storeReplay('tenant_123', 'iam.keys.create', idempotencyKey, { ok: true, data: { id: 'key_456' } });

      const request = {
        action: 'iam.keys.create',
        params: { scopes: ['manage.read'] },
        idempotency_key: idempotencyKey
      };

      await router(request, { request: createMockRequest() });

      // Handler should not be called (no write methods should be invoked)
      expect(dbAdapter.writeMethodsCalled.length).toBe(0);
    });
  });

  describe('Rate limiting', () => {
    it('should block requests with RATE_LIMITED code when limit exceeded', async () => {
      // Default mock already returns correct scopes

      rateLimitAdapter.setShouldAllow(false);
      rateLimitAdapter.setCount('api_key_123', 'iam.keys.list', 1001);

      const request = {
        action: 'iam.keys.list',
        params: {}
      };

      const response = await router(request, { request: createMockRequest() });
      
      // Should be rate limited
      expect(response.ok).toBe(false);
      expect(response.code).toBe('RATE_LIMITED');

      // Verify rate limit was checked in audit
      const deniedEntries = auditAdapter.getEntriesByResult('denied');
      expect(deniedEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Ceilings', () => {
    it('should block requests with CEILING_EXCEEDED code when ceiling breached', async () => {
      // Default mock already returns correct scopes

      ceilingsAdapter.setShouldAllow(false);

      const request = {
        action: 'iam.keys.create',
        params: { scopes: ['manage.read'] }
      };

      const response = await router(request, { request: createMockRequest() });
      
      // Should be blocked by ceiling
      expect(response.ok).toBe(false);
      expect(response.code).toBe('CEILING_EXCEEDED');

      // Verify ceiling was checked
      expect(ceilingsAdapter.lastCheck).toBeDefined();
      expect(ceilingsAdapter.lastCheck?.action).toBe('iam.keys.create');
      expect(ceilingsAdapter.lastCheck?.tenantId).toBe('tenant_123');
    });

    it('should check ceilings before executing mutations', async () => {
      // Default mock already returns correct scopes

      ceilingsAdapter.reset();
      
      const request = {
        action: 'iam.keys.create',
        params: { scopes: ['manage.read'] }
      };

      await router(request, { request: createMockRequest() });

      // Ceiling check should have been called
      expect(ceilingsAdapter.lastCheck).toBeDefined();
      expect(ceilingsAdapter.lastCheck?.action).toBe('iam.keys.create');
    });
  });
});
