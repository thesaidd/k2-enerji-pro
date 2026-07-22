import { db } from '../services/storage/database';
import { normalizeAppSettings } from '../services/storage/SettingsRepository';
import { DEMO_RECORD_IDS, getDemoDataset } from './demoDataset';

const demoIdSet = new Set<string>([
  ...DEMO_RECORD_IDS.customers,
  ...DEMO_RECORD_IDS.offers,
  ...DEMO_RECORD_IDS.scenarios,
]);

export const DemoDataService = {
  hasUserRecords: async (): Promise<boolean> => {
    const [customers, offers, scenarios, drafts] = await Promise.all([
      db.customers.toArray(),
      db.plannedOffers.toArray(),
      db.realizationScenarios.toArray(),
      db.costDrafts.toArray(),
    ]);
    return [...customers, ...offers, ...scenarios, ...drafts].some((record) => !demoIdSet.has(record.id));
  },
  load: async (): Promise<void> => {
    const dataset = getDemoDataset();
    await db.transaction(
      'rw',
      [db.customers, db.costDrafts, db.plannedOffers, db.realizationScenarios, db.settings],
      async () => {
        await db.customers.bulkPut(dataset.customers);
        await db.plannedOffers.bulkPut(dataset.plannedOffers);
        await db.realizationScenarios.bulkPut(dataset.realizationScenarios);
        const current = normalizeAppSettings(await db.settings.get('app'));
        const demoMonths = dataset.settings[0]!.monthlyMarketPrices;
        const existingMonths = new Set(current.monthlyMarketPrices.map((price) => price.month));
        await db.settings.put({
          ...current,
          monthlyMarketPrices: [
            ...current.monthlyMarketPrices,
            ...demoMonths.filter((price) => !existingMonths.has(price.month)),
          ].sort((a, b) => a.month.localeCompare(b.month)),
        });
      },
    );
  },
  clear: async (): Promise<void> => {
    await db.transaction(
      'rw',
      [db.customers, db.plannedOffers, db.realizationScenarios, db.settings],
      async () => {
        await Promise.all([
          db.customers.bulkDelete([...DEMO_RECORD_IDS.customers]),
          db.plannedOffers.bulkDelete([...DEMO_RECORD_IDS.offers]),
          db.realizationScenarios.bulkDelete([...DEMO_RECORD_IDS.scenarios]),
        ]);
        const current = normalizeAppSettings(await db.settings.get('app'));
        await db.settings.put({
          ...current,
          monthlyMarketPrices: current.monthlyMarketPrices.filter(
            (price) => price.sourceNote !== 'K2 Demo Fixture',
          ),
        });
      },
    );
  },
};
