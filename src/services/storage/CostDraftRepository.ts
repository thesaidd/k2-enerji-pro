import { db } from './database';
import type { CostDraft } from '../../types';

export const CostDraftRepository = {
  list: (): Promise<CostDraft[]> => db.costDrafts.orderBy('updatedAt').reverse().toArray(),
  get: (id: string): Promise<CostDraft | undefined> => db.costDrafts.get(id),
  save: async (draft: CostDraft): Promise<CostDraft> => {
    await db.costDrafts.put(structuredClone(draft));
    return draft;
  },
  delete: (id: string): Promise<void> => db.costDrafts.delete(id),
};
