/**
 * Hard ceiling enforcement utilities
 */

import { CeilingsAdapter } from './types';

export interface CeilingConfig {
  name: string;
  limit: number;
  period?: 'per_transfer' | 'per_day' | 'per_month';
}

export async function applyCeilings(
  adapter: CeilingsAdapter,
  action: string,
  params: Record<string, any>,
  tenantId: string
): Promise<void> {
  await adapter.check(action, params, tenantId);
}

export function getActionCeilings(action: string): CeilingConfig[] {
  // Default ceilings for common actions
  const ceilings: Record<string, CeilingConfig[]> = {
    'iam.keys.create': [
      { name: 'max_api_keys_per_tenant', limit: 25, period: 'per_day' }
    ],
    'webhooks.create': [
      { name: 'max_webhooks_per_tenant', limit: 20, period: 'per_day' }
    ],
    'billing.disbursements.execute': [
      { name: 'max_payout_per_transfer', limit: 10000, period: 'per_transfer' }
    ],
    'billing.disbursements.bulk-execute': [
      { name: 'max_bulk_payout_per_day', limit: 50000, period: 'per_day' }
    ]
  };

  return ceilings[action] || [];
}
