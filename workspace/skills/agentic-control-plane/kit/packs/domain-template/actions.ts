/**
 * Domain pack template
 * Copy this to create repo-specific domain actions
 */

import { ActionDef } from '../../kernel/src/types';

export const domainActions: ActionDef[] = [
  {
    name: 'domain.example.list',
    scope: 'manage.domain',
    description: 'List domain entities (example)',
    params_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 50 },
        offset: { type: 'integer', default: 0 }
      }
    },
    supports_dry_run: false
  }
];
