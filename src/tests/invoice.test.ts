import { describe, expect, it } from 'vitest';
import { calculateOffer } from '../domain/profitability/calculation';
import { oneMwhState } from './helpers';

describe('fatura ve vergi motoru', () => {
  it('2.17 golden vergi sırasını korur', () => {
    const result = calculateOffer(
      oneMwhState({
        ptfTlMwh: 1000,
        yekdemTlMwh: 200,
        offerRate: 10,
        distributionUnitTlMwh: 400,
        btvRate: 5,
        kdvRate: 20,
        imbalanceRate: 0,
        piuRate: 0,
        creditRate: 0,
        valorRate: 0,
      }),
    );
    expect(result.totals.activeEnergyBaseAmount).toBeCloseTo(1200, 8);
    expect(result.totals.offerMargin).toBeCloseTo(120, 8);
    expect(result.totals.activeEnergySalesAmount).toBeCloseTo(1320, 8);
    expect(result.totals.btvAmount).toBeCloseTo(66, 8);
    expect(result.periods[0]!.kdvBase).toBeCloseTo(1786, 8);
    expect(result.totals.kdvAmount).toBeCloseTo(357.2, 8);
    expect(result.totals.grossInvoice).toBeCloseTo(2143.2, 8);
  });

  it('sözleşme gücünü BTV dışında, KDV içinde tutar', () => {
    const withoutPower = calculateOffer(
      oneMwhState({ contractPowerTl: 0, creditRate: 0, valorRate: 0 }),
    );
    const withPower = calculateOffer(
      oneMwhState({ contractPowerTl: 1000, creditRate: 0, valorRate: 0 }),
    );
    expect(withPower.totals.btvAmount).toBeCloseTo(withoutPower.totals.btvAmount, 8);
    expect(withPower.totals.kdvAmount - withoutPower.totals.kdvAmount).toBeCloseTo(200, 8);
  });

  it('teklif marjını faturaya ikinci kez eklemez', () => {
    const result = calculateOffer(
      oneMwhState({
        ptfTlMwh: 1000,
        yekdemTlMwh: 0,
        offerRate: 10,
        distributionUnitTlMwh: 0,
        btvRate: 0,
        kdvRate: 0,
        creditRate: 0,
        valorRate: 0,
        imbalanceRate: 0,
        piuRate: 0,
      }),
    );
    expect(result.totals.activeEnergySalesAmount).toBeCloseTo(1100, 8);
    expect(result.totals.grossInvoice).toBeCloseTo(1100, 8);
  });

  it('MWh ve kWh girişlerini aynı sonuca dönüştürür', () => {
    const mwh = calculateOffer(
      oneMwhState({ monthlyConsumption: 31, monthlyConsumptionUnit: 'MWh' }),
    );
    const kwh = calculateOffer(
      oneMwhState({ monthlyConsumption: 31_000, monthlyConsumptionUnit: 'kWh' }),
    );
    expect(kwh.totals.grossInvoice).toBeCloseTo(mwh.totals.grossInvoice, 6);
  });
});
