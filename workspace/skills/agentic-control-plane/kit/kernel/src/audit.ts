/**
 * Audit logging utilities
 */

import { AuditAdapter, AuditEntry } from './types';

export async function logAudit(
  adapter: AuditAdapter,
  entry: AuditEntry
): Promise<void> {
  await adapter.log(entry);
}

export function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `req_${timestamp}_${random}`;
}

export function hashPayload(body: string): string {
  // SHA-256 hash of request body for audit trail
  // Implementation should use crypto.subtle.digest in actual usage
  return `hash_${body.length}`; // Placeholder
}
