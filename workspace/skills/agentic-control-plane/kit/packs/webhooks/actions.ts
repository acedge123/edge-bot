/**
 * Webhooks Pack - Action Definitions
 */

import { ActionDef } from '../../kernel/src/types';

export const webhooksActions: ActionDef[] = [
  {
    name: 'webhooks.list',
    scope: 'manage.read',
    description: 'List all webhooks for the tenant',
    params_schema: {
      type: 'object',
      properties: {}
    },
    supports_dry_run: false
  },
  {
    name: 'webhooks.create',
    scope: 'manage.webhooks',
    description: 'Create a new webhook',
    params_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri' },
        events: { type: 'array', items: { type: 'string' } },
        secret: { type: 'string' }
      },
      required: ['url', 'events']
    },
    supports_dry_run: true
  },
  {
    name: 'webhooks.update',
    scope: 'manage.webhooks',
    description: 'Update an existing webhook',
    params_schema: {
      type: 'object',
      properties: {
        webhook_id: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        events: { type: 'array', items: { type: 'string' } },
        secret: { type: 'string' },
        active: { type: 'boolean' }
      },
      required: ['webhook_id']
    },
    supports_dry_run: true
  },
  {
    name: 'webhooks.delete',
    scope: 'manage.webhooks',
    description: 'Delete a webhook',
    params_schema: {
      type: 'object',
      properties: {
        webhook_id: { type: 'string' }
      },
      required: ['webhook_id']
    },
    supports_dry_run: true
  },
  {
    name: 'webhooks.test',
    scope: 'manage.webhooks',
    description: 'Send a test event to a webhook',
    params_schema: {
      type: 'object',
      properties: {
        webhook_id: { type: 'string' },
        event: { type: 'string' },
        payload: { type: 'object' }
      },
      required: ['webhook_id']
    },
    supports_dry_run: false
  },
  {
    name: 'webhooks.deliveries',
    scope: 'manage.read',
    description: 'List delivery attempts for a webhook',
    params_schema: {
      type: 'object',
      properties: {
        webhook_id: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 }
      },
      required: ['webhook_id']
    },
    supports_dry_run: false
  }
];
