import { describe, expect, it } from 'vitest';
import { calculateOffer } from '../domain/profitability/calculation';
import { DEFAULT_OFFER_STATE } from '../config/defaults';

describe('GES öz tüketim modeli', () => {
  it.each([
    [0, 0, 100],
    [30, 30, 70],
    [100, 100, 0],
  ])('%%%s öz tüketimde fiziksel enerjiyi doğru ayırır', (rate, self, grid) => {
    const result = calculateOffer({
      ...structuredClone(DEFAULT_OFFER_STATE),
      usageStart: '2026-07-01',
      usageEnd: '2026-07-31',
      monthlyConsumption: 100,
      ges: {
        mode: 'simple_self_consumption',
        selfConsumptionRate: rate,
        excessProductionTaxMode: 'manual',
      },
      offerRate: 0,
      creditRate: 0,
      valorRate: 0,
    });
    expect(result.totals.gesSelfConsumptionMwh).toBeCloseTo(self, 8);
    expect(result.totals.gridConsumptionMwh).toBeCloseTo(grid, 8);
    expect(result).not.toHaveProperty('gesReceivable');
    expect(result.totals).not.toHaveProperty('totalGesCashIn');
    expect(JSON.stringify(result)).not.toContain('customerPayableAfterGes');
  });

  it('dağıtım ve aktif enerjiyi net şebeke tüketiminden hesaplar', () => {
    const result = calculateOffer({
      ...structuredClone(DEFAULT_OFFER_STATE),
      usageStart: '2026-07-01',
      usageEnd: '2026-07-31',
      monthlyConsumption: 100,
      ptfTlMwh: 1000,
      yekdemTlMwh: 200,
      distributionUnitTlMwh: 300,
      offerRate: 0,
      btvRate: 5,
      kdvRate: 20,
      tariffSourceMode: 'legacy_numeric',
      creditRate: 0,
      valorRate: 0,
      ges: {
        mode: 'simple_self_consumption',
        selfConsumptionRate: 30,
        excessProductionTaxMode: 'manual',
      },
    });
    expect(result.totals.activeEnergyBaseAmount).toBeCloseTo(70 * 1200, 8);
    expect(result.totals.distributionAmount).toBeCloseTo(70 * 300, 8);
    expect(result.totals.gesSelfConsumptionSavings).toBeCloseTo(30 * 1200, 8);
  });

  it('sözleşme gücünü öz tüketimden etkilemez', () => {
    const zero = calculateOffer({
      ...structuredClone(DEFAULT_OFFER_STATE),
      usageStart: '2026-07-01',
      usageEnd: '2026-07-31',
      contractPowerTl: 1000,
      creditRate: 0,
      valorRate: 0,
      ges: {
        mode: 'simple_self_consumption',
        selfConsumptionRate: 0,
        excessProductionTaxMode: 'manual',
      },
    });
    const full = calculateOffer({
      ...structuredClone(DEFAULT_OFFER_STATE),
      usageStart: '2026-07-01',
      usageEnd: '2026-07-31',
      contractPowerTl: 1000,
      creditRate: 0,
      valorRate: 0,
      ges: {
        mode: 'simple_self_consumption',
        selfConsumptionRate: 100,
        excessProductionTaxMode: 'manual',
      },
    });
    expect(full.totals.contractPowerAmount).toBeCloseTo(zero.totals.contractPowerAmount, 8);
  });

  it('gelişmiş modda ihtiyaç fazlasını ayrı nakit çıkışı tutar', () => {
    const result = calculateOffer({
      ...structuredClone(DEFAULT_OFFER_STATE),
      usageStart: '2026-07-01',
      usageEnd: '2026-07-31',
      monthlyConsumption: 100,
      creditRate: 0,
      valorRate: 0,
      ges: {
        mode: 'advanced_metering',
        selfConsumptionRate: 0,
        totalProductionMwh: 80,
        simultaneousSelfConsumptionMwh: 40,
        gridImportMwh: 60,
        gridExportMwh: 40,
        excessAfterNettingMwh: 10,
        priceType: 'manual',
        excessPurchasePrice: 500,
        excessProductionTaxMode: 'manual',
        settlementMode: 'cash_outflow',
      },
    });
    expect(result.totals.excessProductionPurchase).toBeCloseTo(5000, 8);
    expect(
      result.cashEvents.some(
        (event) => event.type === 'excess_production_purchase' && event.direction === 'out',
      ),
    ).toBe(true);
  });
});
