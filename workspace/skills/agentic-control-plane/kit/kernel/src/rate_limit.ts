/**
 * Rate limiting utilities
 */

import { RateLimitAdapter } from './types';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
}

export async function checkRateLimit(
  adapter: RateLimitAdapter,
  apiKeyId: string,
  action: string,
  limit: number
): Promise<RateLimitResult> {
  return await adapter.check(apiKeyId, action, limit);
}

export function getActionRateLimit(
  action: string,
  defaultLimit: number
): number {
  // Per-action rate limits for high-risk actions
  const actionLimits: Record<string, number> = {
    'billing.disbursements.execute': 10,
    'billing.disbursements.bulk-execute': 10,
    'iam.keys.create': 20,
    'iam.keys.revoke': 20,
  };

  return actionLimits[action] || defaultLimit;
}
