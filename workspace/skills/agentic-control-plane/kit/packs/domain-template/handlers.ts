/**
 * Domain pack template handlers
 * Copy this to create repo-specific domain handlers
 */

import { ActionHandler } from '../../kernel/src/types';

export const handleDomainExampleList: ActionHandler = async (params, ctx) => {
  return {
    entities: [],
    total: 0
  };
};
