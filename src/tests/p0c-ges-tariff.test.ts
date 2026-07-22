import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFER_STATE } from '../config/defaults';
import { DEFAULT_TARIFF_VERSIONS } from '../config/tariffs';
import { calculateGesPeriod } from '../domain/ges/ges';
import { calculateOffer } from '../domain/profitability/calculation';
import { resolveTariffForPeriod } from '../domain/tariff/tariff';
import type { TariffVersion } from '../types';

const state = () => ({
  ...structuredClone(DEFAULT_OFFER_STATE),
  usageStart: '2026-07-01',
  usageEnd: '2026-07-31',
  monthlyConsumption: 100,
  offerRate: 5,
  creditRate: 0,
  valorRate: 0,
});

const advanced = () => ({
  mode: 'advanced_metering' as const,
  selfConsumptionRate: 0,
  totalProductionMwh: 80,
  simultaneousSelfConsumptionMwh: 40,
  gridImportMwh: 60,
  gridExportMwh: 30,
  excessAfterNettingMwh: 10,
  priceType: 'ptf_yekdem' as const,
  nettingMethod: 'monthly' as const,
  excessProductionTaxMode: 'no_tax_in_demo' as const,
  settlementMode: 'cash_outflow' as const,
  excessPurchasePaymentOffsetDays: 10,
});

describe('P0-C GES demo destek sınırları', () => {
  it('monthly ve manual mahsuplaşmayı ayrı ve deterministik hesaplar', () => {
    const monthly = calculateGesPeriod(100, 1, advanced(), 1000, 200);
    const manual = calculateGesPeriod(
      100,
      1,
      { ...advanced(), nettingMethod: 'manual', excessAfterNettingMwh: 7 },
      1000,
      200,
    );
    expect(monthly.excessProductionMwh).toBe(10);
    expect(manual.excessProductionMwh).toBe(7);
  });

  it('hourly ve invoice_offset seçeneklerinde final sonucu geçersiz yapar', () => {
    const hourly = calculateOffer({ ...state(), ges: { ...advanced(), nettingMethod: 'hourly' } });
    const offset = calculateOffer({ ...state(), ges: { ...advanced(), settlementMode: 'invoice_offset' } });
    expect(hourly.valid).toBe(false);
    expect(hourly.errors.join(' ')).toContain('Saatlik mahsuplaşma');
    expect(offset.valid).toBe(false);
    expect(offset.errors.join(' ')).toContain('Faturadan mahsup');
  });

  it.each([
    ['ptf', 1000],
    ['ptf_yekdem', 1200],
    ['manual', 750],
    ['regulated', 750],
  ] as const)('%s fiyat türünü açık girdilerle hesaplar', (priceType, expected) => {
    const result = calculateGesPeriod(
      100,
      1,
      { ...advanced(), priceType, excessPurchasePrice: 750 },
      1000,
      200,
    );
    expect(result.excessPurchasePrice).toBe(expected);
  });

  it('regulated fiyat için açık manuel değer ister', () => {
    const result = calculateOffer({
      ...state(),
      ges: { ...advanced(), priceType: 'regulated', excessPurchasePrice: undefined },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('açıkça girilmelidir');
  });

  it('ödeme offsetini snapshot ve ilk iş günü nakit olayına uygular', () => {
    const result = calculateOffer(
      { ...state(), ges: { ...advanced(), excessPurchasePaymentOffsetDays: 1 } },
      [],
    );
    const event = result.cashEvents.find((candidate) => candidate.type === 'excess_production_purchase');
    expect(result.state.ges.excessPurchasePaymentOffsetDays).toBe(1);
    expect(event?.date).toBe('2026-08-03');
    expect(result.cashEvents.filter((candidate) => candidate.type === 'excess_production_purchase')).toHaveLength(1);
    expect(result.totals.excessProductionPurchase).toBeCloseTo(
      result.periods.reduce((sum, period) => sum + (period.excessPurchaseAmount ?? 0), 0),
      8,
    );
  });
});

describe('P0-C dönemsel tarife çözümleme', () => {
  const tariff = (patch: Partial<TariffVersion> = {}): TariffVersion => ({
    ...DEFAULT_TARIFF_VERSIONS.find(
      (candidate) => candidate.customerType === DEFAULT_OFFER_STATE.customerType,
    )!,
    ...patch,
  });

  it('dönem için tam bir geçerli tarife seçer ve snapshotlar', () => {
    const result = calculateOffer(state(), [], undefined, [tariff()]);
    expect(result.valid).toBe(true);
    expect(result.periods[0]?.tariffSnapshot?.tariffId).toBe(tariff().id);
  });

  it('tarife olmayan dönemde sıfır veya önceki tarifeye sessiz fallback yapmaz', () => {
    const result = calculateOffer(state(), [], undefined, [tariff({ validTo: '2026-06-30' })]);
    expect(result.valid).toBe(false);
    expect(result.periods).toHaveLength(0);
    expect(result.errors.join(' ')).toContain('geçerli tarife bulunamadı');
  });

  it('dönem içine düşen tarife sınırını açık hata yapar', () => {
    const result = resolveTariffForPeriod(
      DEFAULT_OFFER_STATE.customerType,
      '2026-07-01',
      '2026-07-31',
      [tariff({ validFrom: '2026-07-15' })],
    );
    expect(result.error).toContain('tarife sınırı');
  });

  it('manuel override nedenini zorunlu tutar ve değerleri snapshotlar', () => {
    const missingReason = calculateOffer({
      ...state(),
      tariffOverrides: [
        { month: '2026-07', kdvRate: 18, btvRate: 2, distributionUnitTlMwh: 500, reason: '' },
      ],
    });
    const valid = calculateOffer({
      ...state(),
      tariffOverrides: [
        {
          month: '2026-07',
          kdvRate: 18,
          btvRate: 2,
          distributionUnitTlMwh: 500,
          reason: 'Onaylı demo varsayımı',
        },
      ],
    });
    expect(missingReason.valid).toBe(false);
    expect(valid.periods[0]?.tariffSnapshot).toMatchObject({
      manualOverride: true,
      overrideReason: 'Onaylı demo varsayımı',
      kdvRate: 18,
      btvRate: 2,
      distributionUnitTlMwh: 500,
    });
  });

  it('tarife ayarı değişince eski sonuç snapshotını değiştirmez', () => {
    const first = calculateOffer(state(), [], undefined, [tariff({ kdvRate: 20 })]);
    const before = structuredClone(first.periods[0]?.tariffSnapshot);
    calculateOffer(state(), [], undefined, [tariff({ kdvRate: 1 })]);
    expect(first.periods[0]?.tariffSnapshot).toEqual(before);
  });
});
