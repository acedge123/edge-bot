/**
 * Webhooks Pack - Main Export
 */

import { Pack } from '../../kernel/src/pack';
import { webhooksActions } from './actions';
import {
  handleWebhooksList,
  handleWebhooksCreate,
  handleWebhooksUpdate,
  handleWebhooksDelete,
  handleWebhooksTest,
  handleWebhooksDeliveries
} from './handlers';

export const webhooksPack: Pack = {
  name: 'webhooks',
  actions: webhooksActions,
  handlers: {
    'webhooks.list': handleWebhooksList,
    'webhooks.create': handleWebhooksCreate,
    'webhooks.update': handleWebhooksUpdate,
    'webhooks.delete': handleWebhooksDelete,
    'webhooks.test': handleWebhooksTest,
    'webhooks.deliveries': handleWebhooksDeliveries
  }
};
