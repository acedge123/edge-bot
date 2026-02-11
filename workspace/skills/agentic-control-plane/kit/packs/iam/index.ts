/**
 * IAM Pack - Main Export
 */

import { Pack } from '../../kernel/src/pack';
import { iamActions } from './actions';
import {
  handleIamKeysList,
  handleIamKeysCreate,
  handleIamKeysUpdate,
  handleIamKeysRevoke,
  handleIamTeamList,
  handleIamTeamInvite
} from './handlers';

export const iamPack: Pack = {
  name: 'iam',
  actions: iamActions,
  handlers: {
    'iam.keys.list': handleIamKeysList,
    'iam.keys.create': handleIamKeysCreate,
    'iam.keys.update': handleIamKeysUpdate,
    'iam.keys.revoke': handleIamKeysRevoke,
    'iam.team.list': handleIamTeamList,
    'iam.team.invite': handleIamTeamInvite
  }
};
