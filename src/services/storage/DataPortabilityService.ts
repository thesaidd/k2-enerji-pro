import { db } from './database';
import { normalizeAppSettings } from './SettingsRepository';
import type {
  AppSettings,
  CostDraft,
  Customer,
  PlannedOffer,
  RealizationScenario,
} from '../../types';

export interface BackupPayload {
  version: 'K2-ENERJIPRO-3.0';
  exportedAt: string;
  customers: Customer[];
  costDrafts: CostDraft[];
  plannedOffers: PlannedOffer[];
  realizationScenarios: RealizationScenario[];
  settings: AppSettings[];
}

const array = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const normalizeBackupPayload = (input: unknown): BackupPayload => {
  if (!input || typeof input !== 'object') throw new Error('Yedek içeriği geçersiz.');
  const payload = input as Partial<BackupPayload>;
  if (payload.version !== 'K2-ENERJIPRO-3.0')
    throw new Error('Bu dosya K2 EnerjiPro 3.0 yedeği değil.');
  return {
    version: 'K2-ENERJIPRO-3.0',
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : '',
    customers: structuredClone(array<Customer>(payload.customers)),
    costDrafts: structuredClone(array<CostDraft>(payload.costDrafts)),
    plannedOffers: structuredClone(array<PlannedOffer>(payload.plannedOffers)),
    realizationScenarios: structuredClone(array<RealizationScenario>(payload.realizationScenarios)),
    settings: array<AppSettings>(payload.settings).map(normalizeAppSettings),
  };
};

export const DataPortabilityService = {
  export: async (): Promise<BackupPayload> => ({
    version: 'K2-ENERJIPRO-3.0',
    exportedAt: new Date().toISOString(),
    customers: await db.customers.toArray(),
    costDrafts: await db.costDrafts.toArray(),
    plannedOffers: await db.plannedOffers.toArray(),
    realizationScenarios: await db.realizationScenarios.toArray(),
    settings: (await db.settings.toArray()).map(normalizeAppSettings),
  }),
  restore: async (input: unknown): Promise<void> => {
    const payload = normalizeBackupPayload(input);
    await db.transaction(
      'rw',
      [db.customers, db.costDrafts, db.plannedOffers, db.realizationScenarios, db.settings],
      async () => {
        await Promise.all([
          db.customers.clear(),
          db.costDrafts.clear(),
          db.plannedOffers.clear(),
          db.realizationScenarios.clear(),
          db.settings.clear(),
        ]);
        await Promise.all([
          db.customers.bulkPut(structuredClone(payload.customers ?? [])),
          db.costDrafts.bulkPut(structuredClone(payload.costDrafts ?? [])),
          db.plannedOffers.bulkPut(structuredClone(payload.plannedOffers ?? [])),
          db.realizationScenarios.bulkPut(structuredClone(payload.realizationScenarios ?? [])),
          db.settings.bulkPut(structuredClone(payload.settings ?? [])),
        ]);
      },
    );
  },
};
