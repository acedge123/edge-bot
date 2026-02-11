/**
 * IAM Pack - Action Definitions
 */

import { ActionDef } from '../../kernel/src/types';

export const iamActions: ActionDef[] = [
  {
    name: 'iam.keys.list',
    scope: 'manage.read',
    description: 'List all API keys for the tenant',
    params_schema: {
      type: 'object',
      properties: {}
    },
    supports_dry_run: false
  },
  {
    name: 'iam.keys.create',
    scope: 'manage.iam',
    description: 'Create a new API key',
    params_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        scopes: { type: 'array', items: { type: 'string' } },
        expires_at: { type: 'string', format: 'date-time' }
      },
      required: ['scopes']
    },
    supports_dry_run: true
  },
  {
    name: 'iam.keys.update',
    scope: 'manage.iam',
    description: 'Update an existing API key',
    params_schema: {
      type: 'object',
      properties: {
        key_id: { type: 'string' },
        name: { type: 'string' },
        scopes: { type: 'array', items: { type: 'string' } },
        expires_at: { type: 'string', format: 'date-time' }
      },
      required: ['key_id']
    },
    supports_dry_run: true
  },
  {
    name: 'iam.keys.revoke',
    scope: 'manage.iam',
    description: 'Revoke an API key',
    params_schema: {
      type: 'object',
      properties: {
        key_id: { type: 'string' }
      },
      required: ['key_id']
    },
    supports_dry_run: true
  },
  {
    name: 'iam.team.list',
    scope: 'manage.read',
    description: 'List all team members for the tenant',
    params_schema: {
      type: 'object',
      properties: {}
    },
    supports_dry_run: false
  },
  {
    name: 'iam.team.invite',
    scope: 'manage.iam',
    description: 'Invite a team member',
    params_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        role: { type: 'string' }
      },
      required: ['email', 'role']
    },
    supports_dry_run: true
  }
];
