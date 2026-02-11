/**
 * Built-in meta pack
 * Provides discovery and version actions
 */

import { ActionDef, ActionHandler, ActionContext } from './types';
import { Pack } from './pack';

let globalActionRegistry: ActionDef[] = [];

export function setGlobalActionRegistry(actions: ActionDef[]): void {
  globalActionRegistry = actions;
}

export function getMetaPack(): Pack {
  const handleMetaActions: ActionHandler = async (params, ctx) => {
    return {
      actions: globalActionRegistry,
      api_version: 'v1',
      total_actions: globalActionRegistry.length
    };
  };

  const handleMetaVersion: ActionHandler = async (params, ctx) => {
    return {
      api_version: 'v1',
      schema_version: '2026-02-11',
      actions_count: globalActionRegistry.length
    };
  };

  return {
    name: 'meta',
    actions: [
      {
        name: 'meta.actions',
        scope: 'manage.read',
        description: 'List all available actions with schemas and required scopes',
        params_schema: {
          type: 'object',
          properties: {}
        },
        supports_dry_run: false
      },
      {
        name: 'meta.version',
        scope: 'manage.read',
        description: 'Get API version and schema information',
        params_schema: {
          type: 'object',
          properties: {}
        },
        supports_dry_run: false
      }
    ],
    handlers: {
      'meta.actions': handleMetaActions,
      'meta.version': handleMetaVersion
    }
  };
}
