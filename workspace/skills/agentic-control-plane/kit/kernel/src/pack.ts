/**
 * Pack contract definition
 * Each pack must export actions and handlers
 */

import { ActionDef, ActionHandler } from './types';

export interface Pack {
  name: string;
  actions: ActionDef[];
  handlers: Record<string, ActionHandler>;
}

export function validatePack(pack: Pack): void {
  // Validate no duplicate action names within pack
  const actionNames = new Set<string>();
  for (const action of pack.actions) {
    if (actionNames.has(action.name)) {
      throw new Error(`Duplicate action name in pack ${pack.name}: ${action.name}`);
    }
    actionNames.add(action.name);
    
    // Validate action def structure
    if (!action.name || !action.scope || !action.description) {
      throw new Error(`Invalid action definition in pack ${pack.name}: missing required fields`);
    }
    
    if (!action.params_schema || action.params_schema.type !== 'object') {
      throw new Error(`Invalid params_schema in pack ${pack.name} action ${action.name}`);
    }
  }
  
  // Validate handlers exist for all actions
  for (const action of pack.actions) {
    if (!pack.handlers[action.name]) {
      throw new Error(`Missing handler for action ${action.name} in pack ${pack.name}`);
    }
  }
}

export function mergePacks(packs: Pack[]): { actions: ActionDef[]; handlers: Record<string, ActionHandler> } {
  const allActions: ActionDef[] = [];
  const allHandlers: Record<string, ActionHandler> = {};
  const actionNames = new Set<string>();
  
  for (const pack of packs) {
    validatePack(pack);
    
    for (const action of pack.actions) {
      if (actionNames.has(action.name)) {
        throw new Error(`Duplicate action name across packs: ${action.name}`);
      }
      actionNames.add(action.name);
      allActions.push(action);
    }
    
    for (const [actionName, handler] of Object.entries(pack.handlers)) {
      if (allHandlers[actionName]) {
        throw new Error(`Duplicate handler for action ${actionName} across packs`);
      }
      allHandlers[actionName] = handler;
    }
  }
  
  return { actions: allActions, handlers: allHandlers };
}
