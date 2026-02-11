/**
 * IAM Pack - Action Handlers
 */

import { ActionHandler, ImpactShape } from '../../kernel/src/types';

export const handleIamKeysList: ActionHandler = async (params, ctx) => {
  const keys = await ctx.db.listApiKeys(ctx.tenantId);
  return { data: keys };
};

export const handleIamKeysCreate: ActionHandler = async (params, ctx) => {
  const { name, scopes, expires_at } = params;
  
  if (ctx.dryRun) {
    const impact: ImpactShape = {
      creates: [{ type: 'api_key', count: 1, details: { name, scopes } }],
      updates: [],
      deletes: [],
      side_effects: [],
      risk: 'low',
      warnings: []
    };
    return { data: { key_id: 'preview', name, scopes }, impact };
  }
  
  const key = await ctx.db.createApiKey(ctx.tenantId, { name, scopes, expires_at });
  const impact: ImpactShape = {
    creates: [{ type: 'api_key', count: 1, details: { id: key.id, name: key.name } }],
    updates: [],
    deletes: [],
    side_effects: [],
    risk: 'low',
    warnings: []
  };
  return { data: key, impact };
};

export const handleIamKeysUpdate: ActionHandler = async (params, ctx) => {
  const { key_id, name, scopes, expires_at } = params;
  
  if (ctx.dryRun) {
    const existing = await ctx.db.getApiKey(ctx.tenantId, key_id);
    if (!existing) {
      throw new Error(`API key not found: ${key_id}`);
    }
    
    const updatedFields: string[] = [];
    if (name !== undefined && name !== existing.name) updatedFields.push('name');
    if (scopes !== undefined && JSON.stringify(scopes) !== JSON.stringify(existing.scopes)) updatedFields.push('scopes');
    if (expires_at !== undefined && expires_at !== existing.expires_at) updatedFields.push('expires_at');
    
    const impact: ImpactShape = {
      creates: [],
      updates: [{ type: 'api_key', id: key_id, fields: updatedFields }],
      deletes: [],
      side_effects: [],
      risk: 'low',
      warnings: []
    };
    return { data: { key_id, ...params }, impact };
  }
  
  const updated = await ctx.db.updateApiKey(ctx.tenantId, key_id, { name, scopes, expires_at });
  const impact: ImpactShape = {
    creates: [],
    updates: [{ type: 'api_key', id: key_id, fields: ['name', 'scopes', 'expires_at'] }],
    deletes: [],
    side_effects: [],
    risk: 'low',
    warnings: []
  };
  return { data: updated, impact };
};

export const handleIamKeysRevoke: ActionHandler = async (params, ctx) => {
  const { key_id } = params;
  
  if (ctx.dryRun) {
    const existing = await ctx.db.getApiKey(ctx.tenantId, key_id);
    if (!existing) {
      throw new Error(`API key not found: ${key_id}`);
    }
    
    const impact: ImpactShape = {
      creates: [],
      updates: [],
      deletes: [{ type: 'api_key', count: 1, details: { id: key_id } }],
      side_effects: [],
      risk: 'medium',
      warnings: ['This will immediately invalidate the API key']
    };
    return { data: { key_id, revoked: true }, impact };
  }
  
  await ctx.db.revokeApiKey(ctx.tenantId, key_id);
  const impact: ImpactShape = {
    creates: [],
    updates: [],
    deletes: [{ type: 'api_key', count: 1, details: { id: key_id } }],
    side_effects: [],
    risk: 'medium',
    warnings: ['API key has been revoked']
  };
  return { data: { key_id, revoked: true }, impact };
};

export const handleIamTeamList: ActionHandler = async (params, ctx) => {
  const members = await ctx.db.listTeamMembers(ctx.tenantId);
  return { data: members };
};

export const handleIamTeamInvite: ActionHandler = async (params, ctx) => {
  const { email, role } = params;
  
  if (ctx.dryRun) {
    const impact: ImpactShape = {
      creates: [{ type: 'team_member', count: 1, details: { email, role } }],
      updates: [],
      deletes: [],
      side_effects: [{ type: 'email', count: 1, details: { to: email } }],
      risk: 'low',
      warnings: []
    };
    return { data: { email, role, status: 'invited' }, impact };
  }
  
  const member = await ctx.db.inviteTeamMember(ctx.tenantId, { email, role });
  const impact: ImpactShape = {
    creates: [{ type: 'team_member', count: 1, details: { id: member.id, email } }],
    updates: [],
    deletes: [],
    side_effects: [{ type: 'email', count: 1, details: { to: email } }],
    risk: 'low',
    warnings: []
  };
  return { data: member, impact };
};
