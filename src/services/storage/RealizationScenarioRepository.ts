import { db } from './database';
import type { RealizationScenario } from '../../types';

export const RealizationScenarioRepository = {
  list: (): Promise<RealizationScenario[]> =>
    db.realizationScenarios.orderBy('updatedAt').reverse().toArray(),
  get: (id: string): Promise<RealizationScenario | undefined> => db.realizationScenarios.get(id),
  save: async (scenario: RealizationScenario): Promise<RealizationScenario> => {
    await db.realizationScenarios.put(structuredClone(scenario));
    return scenario;
  },
  saveMany: async (scenarios: RealizationScenario[]): Promise<void> => {
    await db.realizationScenarios.bulkPut(structuredClone(scenarios));
  },
};
