/**
 * Webhooks Pack - Action Handlers
 */

import { ActionHandler, ImpactShape } from '../../kernel/src/types';

export const handleWebhooksList: ActionHandler = async (params, ctx) => {
  const webhooks = await ctx.db.listWebhooks(ctx.tenantId);
  return { data: webhooks };
};

export const handleWebhooksCreate: ActionHandler = async (params, ctx) => {
  const { url, events, secret } = params;
  
  if (ctx.dryRun) {
    const impact: ImpactShape = {
      creates: [{ type: 'webhook', count: 1, details: { url, events: events.length } }],
      updates: [],
      deletes: [],
      side_effects: [],
      risk: 'low',
      warnings: []
    };
    return { data: { webhook_id: 'preview', url, events }, impact };
  }
  
  const webhook = await ctx.db.createWebhook(ctx.tenantId, { url, events, secret });
  const impact: ImpactShape = {
    creates: [{ type: 'webhook', count: 1, details: { id: webhook.id, url } }],
    updates: [],
    deletes: [],
    side_effects: [],
    risk: 'low',
    warnings: []
  };
  return { data: webhook, impact };
};

export const handleWebhooksUpdate: ActionHandler = async (params, ctx) => {
  const { webhook_id, url, events, secret, active } = params;
  
  if (ctx.dryRun) {
    const existing = await ctx.db.getWebhook(ctx.tenantId, webhook_id);
    if (!existing) {
      throw new Error(`Webhook not found: ${webhook_id}`);
    }
    
    const updatedFields: string[] = [];
    if (url !== undefined && url !== existing.url) updatedFields.push('url');
    if (events !== undefined && JSON.stringify(events) !== JSON.stringify(existing.events)) updatedFields.push('events');
    if (secret !== undefined) updatedFields.push('secret');
    if (active !== undefined && active !== existing.active) updatedFields.push('active');
    
    const impact: ImpactShape = {
      creates: [],
      updates: [{ type: 'webhook', id: webhook_id, fields: updatedFields }],
      deletes: [],
      side_effects: [],
      risk: 'low',
      warnings: []
    };
    return { data: { webhook_id, ...params }, impact };
  }
  
  const updated = await ctx.db.updateWebhook(ctx.tenantId, webhook_id, { url, events, secret, active });
  const impact: ImpactShape = {
    creates: [],
    updates: [{ type: 'webhook', id: webhook_id, fields: ['url', 'events', 'secret', 'active'] }],
    deletes: [],
    side_effects: [],
    risk: 'low',
    warnings: []
  };
  return { data: updated, impact };
};

export const handleWebhooksDelete: ActionHandler = async (params, ctx) => {
  const { webhook_id } = params;
  
  if (ctx.dryRun) {
    const existing = await ctx.db.getWebhook(ctx.tenantId, webhook_id);
    if (!existing) {
      throw new Error(`Webhook not found: ${webhook_id}`);
    }
    
    const impact: ImpactShape = {
      creates: [],
      updates: [],
      deletes: [{ type: 'webhook', count: 1, details: { id: webhook_id } }],
      side_effects: [],
      risk: 'low',
      warnings: []
    };
    return { data: { webhook_id, deleted: true }, impact };
  }
  
  await ctx.db.deleteWebhook(ctx.tenantId, webhook_id);
  const impact: ImpactShape = {
    creates: [],
    updates: [],
    deletes: [{ type: 'webhook', count: 1, details: { id: webhook_id } }],
    side_effects: [],
    risk: 'low',
    warnings: []
  };
  return { data: { webhook_id, deleted: true }, impact };
};

export const handleWebhooksTest: ActionHandler = async (params, ctx) => {
  const { webhook_id, event, payload } = params;
  
  const webhook = await ctx.db.getWebhook(ctx.tenantId, webhook_id);
  if (!webhook) {
    throw new Error(`Webhook not found: ${webhook_id}`);
  }
  
  // In a real implementation, this would trigger a webhook delivery
  // For now, we'll return a simulated response
  return {
    data: {
      webhook_id,
      status: 'sent',
      event: event || 'test',
      delivered_at: new Date().toISOString()
    }
  };
};

export const handleWebhooksDeliveries: ActionHandler = async (params, ctx) => {
  const { webhook_id, limit = 50 } = params;
  
  const deliveries = await ctx.db.listWebhookDeliveries(ctx.tenantId, webhook_id, limit);
  return { data: deliveries };
};
