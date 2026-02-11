/**
 * Auth mocking utilities for tests
 */

import { AuthResult } from '../../kernel/src/auth';

export function createMockAuthResult(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    success: true,
    tenantId: 'tenant_123',
    apiKeyId: 'api_key_123',
    scopes: ['manage.read', 'manage.iam'],
    keyPrefix: 'ock_test123',
    ...overrides
  };
}
