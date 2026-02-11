/**
 * Settings Pack - Main Export
 */

import { Pack } from '../../kernel/src/pack';
import { settingsActions } from './actions';
import {
  handleSettingsGet,
  handleSettingsUpdate
} from './handlers';

export const settingsPack: Pack = {
  name: 'settings',
  actions: settingsActions,
  handlers: {
    'settings.get': handleSettingsGet,
    'settings.update': handleSettingsUpdate
  }
};
