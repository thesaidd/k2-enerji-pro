import { db } from './database';
import type { PlannedOffer } from '../../types';

export const PlannedOfferRepository = {
  list: (): Promise<PlannedOffer[]> => db.plannedOffers.orderBy('updatedAt').reverse().toArray(),
  get: (id: string): Promise<PlannedOffer | undefined> => db.plannedOffers.get(id),
  byCustomer: (customerId: string): Promise<PlannedOffer[]> =>
    db.plannedOffers.where('customerId').equals(customerId).reverse().sortBy('updatedAt'),
  save: async (offer: PlannedOffer): Promise<PlannedOffer> => {
    await db.plannedOffers.put(structuredClone(offer));
    return offer;
  },
  saveMany: async (offers: PlannedOffer[]): Promise<void> => {
    await db.plannedOffers.bulkPut(structuredClone(offers));
  },
};
