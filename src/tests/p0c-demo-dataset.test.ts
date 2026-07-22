import { describe, expect, it } from 'vitest';
import { DEMO_RECORD_IDS, getDemoDataset } from '../demo/demoDataset';

describe('P0-C deterministik demo veri seti', () => {
  it('aynı çağrıda aynı kayıtları ve deterministik üst seviye idleri üretir', () => {
    expect(getDemoDataset()).toEqual(getDemoDataset());
    const dataset = getDemoDataset();
    expect(dataset.customers.map((item) => item.id)).toEqual([...DEMO_RECORD_IDS.customers]);
    expect(dataset.plannedOffers.map((item) => item.id)).toEqual([...DEMO_RECORD_IDS.offers]);
    expect(dataset.realizationScenarios.map((item) => item.id)).toEqual([...DEMO_RECORD_IDS.scenarios]);
  });

  it('zorunlu demo örneklerini ve iki aylık piyasa verisini içerir', () => {
    const dataset = getDemoDataset();
    expect(dataset.customers).toHaveLength(3);
    expect(dataset.settings[0]?.monthlyMarketPrices).toHaveLength(2);
    expect(dataset.plannedOffers.some((offer) => offer.paymentPlanSnapshot.templateId === 'full_advance')).toBe(true);
    expect(dataset.plannedOffers.some((offer) => offer.paymentPlanSnapshot.templateId === 'partial_advance_balance')).toBe(true);
    expect(dataset.plannedOffers.some((offer) => offer.resultSnapshot.totals.paymentChannelCost > 0)).toBe(true);
    expect(dataset.plannedOffers.some((offer) => offer.resultSnapshot.totals.excessProductionPurchase > 0)).toBe(true);
    expect(dataset.plannedOffers.some((offer) => offer.legacySnapshot != null)).toBe(true);
    const scenario = dataset.realizationScenarios[0]!;
    expect(scenario.resultSnapshot.totalLateFee).toBeGreaterThan(0);
    expect(scenario.resultSnapshot.endingOpenReceivable).toBeGreaterThan(0);
    expect(scenario.resultSnapshot.receivableLedger.customerAdvance).toBeGreaterThan(0);
  });

  it('demo üst seviye idlerinde duplicate oluşturmaz', () => {
    const dataset = getDemoDataset();
    const ids = [
      ...dataset.customers.map((item) => item.id),
      ...dataset.plannedOffers.map((item) => item.id),
      ...dataset.realizationScenarios.map((item) => item.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
