import { DEFAULT_SETTINGS } from '../../config/defaults';
import { db } from './database';
import type { AppSettings } from '../../types';

export const SettingsRepository = {
  get: async (): Promise<AppSettings> =>
    structuredClone((await db.settings.get('app')) ?? DEFAULT_SETTINGS),
  save: async (settings: AppSettings): Promise<AppSettings> => {
    await db.settings.put(structuredClone(settings));
    return settings;
  },
};
