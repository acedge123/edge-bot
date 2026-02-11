/**
 * Mock adapters for testing
 * Captures calls to verify behavior
 */

import {
  DbAdapter,
  AuditAdapter,
  IdempotencyAdapter,
  RateLimitAdapter,
  CeilingsAdapter,
  AuditEntry,
  Transaction
} from '../../kernel/src/types';

export class MockDbAdapter implements DbAdapter {
  public calls: Array<{ method: string; args: any[] }> = [];
  public tenantIdUsed: string | null = null;
  public writeMethodsCalled: string[] = [];

  // Track which methods are "write" operations
  private writeMethods = new Set([
    'createApiKey',
    'updateApiKey',
    'revokeApiKey',
    'inviteTeamMember',
    'createWebhook',
    'updateWebhook',
    'deleteWebhook',
    'updateSettings',
    'execute'
  ]);

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    this.calls.push({ method: 'query', args: [sql, params] });
    return [] as T[];
  }

  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    this.calls.push({ method: 'queryOne', args: [sql, params] });
    
    // If this is an auth query (checking for API key), return mock key data
    if (sql.includes('api_keys') || sql.includes('keys_table')) {
      return {
        id: 'api_key_123',
        scopes: ['manage.read', 'manage.iam'],
        status: 'active',
        tenant_id: 'tenant_123'
      } as T;
    }
    
    return null;
  }

  async execute(sql: string, params?: any[]): Promise<number> {
    this.calls.push({ method: 'execute', args: [sql, params] });
    this.writeMethodsCalled.push('execute');
    return 0;
  }

  async beginTransaction(): Promise<Transaction> {
    this.calls.push({ method: 'beginTransaction', args: [] });
    return {
      commit: async () => {},
      rollback: async () => {},
      query: async () => [],
      queryOne: async () => null,
      execute: async () => 0
    };
  }

  async getTenantFromApiKey(apiKeyId: string): Promise<string | null> {
    this.calls.push({ method: 'getTenantFromApiKey', args: [apiKeyId] });
    return 'tenant_123';
  }

  async isPlatformAdmin(tenantId: string): Promise<boolean> {
    this.calls.push({ method: 'isPlatformAdmin', args: [tenantId] });
    return false;
  }

  // IAM methods
  async listApiKeys(tenantId: string) {
    this.calls.push({ method: 'listApiKeys', args: [tenantId] });
    this.tenantIdUsed = tenantId;
    return [];
  }

  async getApiKey(tenantId: string, keyId: string) {
    this.calls.push({ method: 'getApiKey', args: [tenantId, keyId] });
    this.tenantIdUsed = tenantId;
    return null;
  }

  async createApiKey(tenantId: string, data: any) {
    this.calls.push({ method: 'createApiKey', args: [tenantId, data] });
    this.tenantIdUsed = tenantId;
    this.writeMethodsCalled.push('createApiKey');
    return {
      id: 'key_123',
      tenant_id: tenantId,
      key_prefix: 'ock_',
      scopes: data.scopes,
      created_at: new Date().toISOString()
    };
  }

  async updateApiKey(tenantId: string, keyId: string, data: any) {
    this.calls.push({ method: 'updateApiKey', args: [tenantId, keyId, data] });
    this.tenantIdUsed = tenantId;
    this.writeMethodsCalled.push('updateApiKey');
    return {
      id: keyId,
      tenant_id: tenantId,
      key_prefix: 'ock_',
      scopes: data.scopes || [],
      created_at: new Date().toISOString()
    };
  }

  async revokeApiKey(tenantId: string, keyId: string) {
    this.calls.push({ method: 'revokeApiKey', args: [tenantId, keyId] });
    this.tenantIdUsed = tenantId;
    this.writeMethodsCalled.push('revokeApiKey');
  }

  async listTeamMembers(tenantId: string) {
    this.calls.push({ method: 'listTeamMembers', args: [tenantId] });
    this.tenantIdUsed = tenantId;
    return [];
  }

  async inviteTeamMember(tenantId: string, data: any) {
    this.calls.push({ method: 'inviteTeamMember', args: [tenantId, data] });
    this.tenantIdUsed = tenantId;
    this.writeMethodsCalled.push('inviteTeamMember');
    return {
      id: 'member_123',
      tenant_id: tenantId,
      email: data.email,
      role: data.role,
      invited_at: new Date().toISOString()
    };
  }

  // Webhooks methods
  async listWebhooks(tenantId: string) {
    this.calls.push({ method: 'listWebhooks', args: [tenantId] });
    this.tenantIdUsed = tenantId;
    return [];
  }

  async getWebhook(tenantId: string, webhookId: string) {
    this.calls.push({ method: 'getWebhook', args: [tenantId, webhookId] });
    this.tenantIdUsed = tenantId;
    return null;
  }

  async createWebhook(tenantId: string, data: any) {
    this.calls.push({ method: 'createWebhook', args: [tenantId, data] });
    this.tenantIdUsed = tenantId;
    this.writeMethodsCalled.push('createWebhook');
    return {
      id: 'webhook_123',
      tenant_id: tenantId,
      url: data.url,
      events: data.events,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async updateWebhook(tenantId: string, webhookId: string, data: any) {
    this.calls.push({ method: 'updateWebhook', args: [tenantId, webhookId, data] });
    this.tenantIdUsed = tenantId;
    this.writeMethodsCalled.push('updateWebhook');
    return {
      id: webhookId,
      tenant_id: tenantId,
      url: data.url || 'https://example.com',
      events: data.events || [],
      active: data.active !== undefined ? data.active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async deleteWebhook(tenantId: string, webhookId: string) {
    this.calls.push({ method: 'deleteWebhook', args: [tenantId, webhookId] });
    this.tenantIdUsed = tenantId;
    this.writeMethodsCalled.push('deleteWebhook');
  }

  async listWebhookDeliveries(tenantId: string, webhookId: string, limit?: number) {
    this.calls.push({ method: 'listWebhookDeliveries', args: [tenantId, webhookId, limit] });
    this.tenantIdUsed = tenantId;
    return [];
  }

  // Settings methods
  async getSettings(tenantId: string) {
    this.calls.push({ method: 'getSettings', args: [tenantId] });
    this.tenantIdUsed = tenantId;
    return {};
  }

  async updateSettings(tenantId: string, data: any) {
    this.calls.push({ method: 'updateSettings', args: [tenantId, data] });
    this.tenantIdUsed = tenantId;
    this.writeMethodsCalled.push('updateSettings');
    return data;
  }
}

export class MockAuditAdapter implements AuditAdapter {
  public entries: AuditEntry[] = [];

  async log(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  getLastEntry(): AuditEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  getEntriesByResult(result: 'success' | 'denied' | 'error'): AuditEntry[] {
    return this.entries.filter(e => e.result === result);
  }
}

export class MockIdempotencyAdapter implements IdempotencyAdapter {
  private cache: Map<string, any> = new Map();

  async getReplay(tenantId: string, action: string, idempotencyKey: string): Promise<any | null> {
    const key = `${tenantId}:${action}:${idempotencyKey}`;
    return this.cache.get(key) || null;
  }

  async storeReplay(tenantId: string, action: string, idempotencyKey: string, response: any): Promise<void> {
    const key = `${tenantId}:${action}:${idempotencyKey}`;
    this.cache.set(key, response);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class MockRateLimitAdapter implements RateLimitAdapter {
  private counts: Map<string, number> = new Map();
  public shouldAllow: boolean = true;
  public limit: number = 1000;

  async check(apiKeyId: string, action: string, limit: number): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
  }> {
    const key = `${apiKeyId}:${action}`;
    const current = this.counts.get(key) || 0;
    const allowed = this.shouldAllow && current < limit;
    
    if (allowed) {
      this.counts.set(key, current + 1);
    }

    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - current - 1)
    };
  }

  reset(): void {
    this.counts.clear();
    this.shouldAllow = true;
  }

  setShouldAllow(allow: boolean): void {
    this.shouldAllow = allow;
  }

  setCount(apiKeyId: string, action: string, count: number): void {
    const key = `${apiKeyId}:${action}`;
    this.counts.set(key, count);
  }
}

export class MockCeilingsAdapter implements CeilingsAdapter {
  public shouldAllow: boolean = true;
  public lastCheck: { action: string; params: any; tenantId: string } | null = null;

  async check(action: string, params: Record<string, any>, tenantId: string): Promise<void> {
    this.lastCheck = { action, params, tenantId };
    if (!this.shouldAllow) {
      throw new Error(`Ceiling exceeded for action ${action}`);
    }
  }

  async getUsage(ceilingName: string, tenantId: string, period?: string): Promise<number> {
    return 0;
  }

  reset(): void {
    this.shouldAllow = true;
    this.lastCheck = null;
  }

  setShouldAllow(allow: boolean): void {
    this.shouldAllow = allow;
  }
}
