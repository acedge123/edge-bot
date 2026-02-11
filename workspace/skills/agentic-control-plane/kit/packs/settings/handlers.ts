/**
 * Settings Pack - Action Handlers
 */

import { ActionHandler, ImpactShape } from '../../kernel/src/types';

export const handleSettingsGet: ActionHandler = async (params, ctx) => {
  const settings = await ctx.db.getSettings(ctx.tenantId);
  return { data: settings };
};

export const handleSettingsUpdate: ActionHandler = async (params, ctx) => {
  const { settings } = params;
  
  if (ctx.dryRun) {
    const current = await ctx.db.getSettings(ctx.tenantId);
    const changedKeys = Object.keys(settings).filter(key => current[key] !== settings[key]);
    
    const impact: ImpactShape = {
      creates: [],
      updates: [{ type: 'settings', id: ctx.tenantId, fields: changedKeys }],
      deletes: [],
      side_effects: [],
      risk: 'low',
      warnings: changedKeys.length === 0 ? ['No settings changed'] : []
    };
    return { data: { settings: { ...current, ...settings } }, impact };
  }
  
  const updated = await ctx.db.updateSettings(ctx.tenantId, settings);
  const impact: ImpactShape = {
    creates: [],
    updates: [{ type: 'settings', id: ctx.tenantId, fields: Object.keys(settings) }],
    deletes: [],
    side_effects: [],
    risk: 'low',
    warnings: []
  };
  return { data: { settings: updated }, impact };
};
