/**
 * Settings Pack - Action Definitions
 */

import { ActionDef } from '../../kernel/src/types';

export const settingsActions: ActionDef[] = [
  {
    name: 'settings.get',
    scope: 'manage.read',
    description: 'Get tenant settings',
    params_schema: {
      type: 'object',
      properties: {}
    },
    supports_dry_run: false
  },
  {
    name: 'settings.update',
    scope: 'manage.settings',
    description: 'Update tenant settings',
    params_schema: {
      type: 'object',
      properties: {
        settings: { type: 'object' }
      },
      required: ['settings']
    },
    supports_dry_run: true
  }
];
