/**
 * Idempotency cache utilities
 */

import { IdempotencyAdapter } from './types';

export async function getIdempotencyReplay(
  adapter: IdempotencyAdapter,
  tenantId: string,
  action: string,
  idempotencyKey: string
): Promise<any | null> {
  return await adapter.getReplay(tenantId, action, idempotencyKey);
}

export async function storeIdempotencyReplay(
  adapter: IdempotencyAdapter,
  tenantId: string,
  action: string,
  idempotencyKey: string,
  response: any
): Promise<void> {
  await adapter.storeReplay(tenantId, action, idempotencyKey, response);
}

export function hashIdempotencyKey(
  tenantId: string,
  action: string,
  idempotencyKey: string
): string {
  // SHA-256 hash of (tenant_id + action + idempotency_key)
  // Implementation should use crypto.subtle.digest in actual usage
  const combined = `${tenantId}:${action}:${idempotencyKey}`;
  return `idem_${combined.length}`; // Placeholder
}
