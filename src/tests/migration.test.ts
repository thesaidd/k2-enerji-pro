import { describe, expect, it } from 'vitest';
import { preview217Migration } from '../services/migration/migrate217';

describe('2.17 migration', () => {
  it('müşteri, teklif ve legacy snapshotı korur; GES alacağını taşımaz', () => {
    const preview = preview217Migration({
      customers: [
        {
          id: 'c1',
          name: 'ABC Sanayi',
          offers: [
            {
              title: '1. Teklif',
              state: {
                usageStart: '2026-07-01',
                usageEnd: '2026-07-31',
                monthlyConsumption: 100,
                monthlyConsumptionUnit: 'MWh',
                offerPct: 5,
                gesRate: 30,
                totalGesReceivable: 999,
                customerPayableAfterGes: 123,
              },
              resultSnapshot: { profitTL: 987.65, totalGesReceivable: 999 },
            },
          ],
        },
      ],
    });
    expect(preview.customers).toBe(1);
    expect(preview.offers).toBe(1);
    expect(preview.payload.offers[0]!.stateSnapshot.ges.selfConsumptionRate).toBe(30);
    expect(preview.payload.offers[0]!.resultSnapshot.totals).not.toHaveProperty(
      'totalGesReceivable',
    );
    expect(preview.payload.offers[0]!.legacySnapshot).toMatchObject({ profitTL: 987.65 });
    expect(preview.warnings[0]).toContain('Eski GES oranı');
  });
});
