import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  CostDraft,
  Customer,
  PlannedOffer,
  RealizationScenario,
} from '../../types';

export class K2Database extends Dexie {
  customers!: EntityTable<Customer, 'id'>;
  costDrafts!: EntityTable<CostDraft, 'id'>;
  plannedOffers!: EntityTable<PlannedOffer, 'id'>;
  realizationScenarios!: EntityTable<RealizationScenario, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor() {
    super('k2-energipro-3');
    this.version(1).stores({
      customers: 'id, name, tag, isArchived, updatedAt',
      costDrafts: 'id, customerId, updatedAt',
      plannedOffers: 'id, customerId, status, [customerId+version], updatedAt',
      realizationScenarios: 'id, sourceCustomerId, sourceOfferId, updatedAt',
      settings: 'id',
    });
  }
}

export const db = new K2Database();
