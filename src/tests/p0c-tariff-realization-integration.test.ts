import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFER_STATE } from '../config/defaults';
import { DEFAULT_TARIFF_VERSIONS } from '../config/tariffs';
import { buildRealizationPaymentCalendar } from '../domain/payment-calendar/paymentCalendar';
import { calculateOffer } from '../domain/profitability/calculation';
import { calculateRealization } from '../domain/realization/realization';
import { validateTariffVersions } from '../domain/tariff/tariff';
import type {
  CalculationResult,
  MonthlyMarketPrice,
  PlannedOffer,
  RealizationScenario,
  TariffVersion,
} from '../types';

const relevantTariff = () =>
  structuredClone(
    DEFAULT_TARIFF_VERSIONS.find(
      (tariff) => tariff.customerType === DEFAULT_OFFER_STATE.customerType,
    )!,
  );

const offerState = (patch: Partial<typeof DEFAULT_OFFER_STATE> = {}) => ({
  ...structuredClone(DEFAULT_OFFER_STATE),
  usageStart: '2026-07-01',
  usageEnd: '2026-07-31',
  monthlyConsumption: 100,
  offerRate: 5,
  creditRate: 0,
  valorRate: 0,
  ...patch,
});

const toOffer = (result: CalculationResult): PlannedOffer => ({
  id: 'source-offer',
  recordType: 'planned_offer',
  customerId: 'customer',
  version: 1,
  title: 'Kaynak teklif',
  status: 'final',
  stateSnapshot: structuredClone(result.state),
  paymentPlanSnapshot: structuredClone(result.state.paymentPlan),
  resultSnapshot: structuredClone(result),
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const scenarioBase = (
  offer: PlannedOffer,
  asOfDate = offer.stateSnapshot.usageEnd,
): Omit<RealizationScenario, 'resultSnapshot'> => ({
  id: 'scenario',
  sourceCustomerId: offer.customerId,
  sourceOfferId: offer.id,
  sourceOfferVersion: offer.version,
  sourceOfferSnapshot: structuredClone(offer),
  name: 'Gerçekleşme',
  asOfDate,
  periodOverrides: [],
  actualPayments: offer.resultSnapshot.plannedPayments.map((payment) => ({
    id: `actual-${payment.id}`,
    invoiceId: payment.periodId,
    date: payment.transactionDate,
    amount: payment.principalAmount,
    channel: payment.paymentChannel,
  })),
  actualRefunds: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const prices: MonthlyMarketPrice[] = [
  {
    month: '2026-07',
    forecastPtfTlMwh: 1000,
    actualPtfTlMwh: 1000,
    forecastYekdemTlMwh: 0,
    actualYekdemTlMwh: 0,
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    month: '2026-08',
    forecastPtfTlMwh: 1100,
    actualPtfTlMwh: 1100,
    forecastYekdemTlMwh: 0,
    actualYekdemTlMwh: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

describe('P0-C tarife kaynağı ve geçerlilik entegrasyonu', () => {
  it('catalog update is used by a new offer', () => {
    const tariff = { ...relevantTariff(), distributionUnitTlMwh: 2000 };
    const result = calculateOffer(
      offerState({ distributionUnitTlMwh: 1829.503, tariffSourceMode: 'catalog' }),
      [],
      undefined,
      [tariff],
    );
    expect(result.periods[0]?.tariffSnapshot).toMatchObject({
      distributionUnitTlMwh: 2000,
      manualOverride: false,
      sourceMode: 'catalog',
    });
  });

  it('new offer is not marked legacy because numeric state differs', () => {
    const result = calculateOffer(
      offerState({ kdvRate: 1, btvRate: 2, distributionUnitTlMwh: 3, tariffSourceMode: 'catalog' }),
    );
    expect(result.periods[0]?.tariffSnapshot).toMatchObject({
      kdvRate: 20,
      btvRate: 1,
      distributionUnitTlMwh: 1829.503,
      manualOverride: false,
      sourceMode: 'catalog',
    });
  });

  it('default 2026 tariff does not cover 2027', () => {
    const result = calculateOffer(
      offerState({ usageStart: '2027-01-01', usageEnd: '2027-01-31' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('geçerli tarife bulunamadı');
  });

  it('added 2027 tariff enables 2027 offer', () => {
    const nextTariff: TariffVersion = {
      ...relevantTariff(),
      id: 'tariff-2027',
      validFrom: '2027-01-01',
      validTo: '2027-12-31',
      distributionUnitTlMwh: 2100,
      versionLabel: '2027.1',
    };
    const result = calculateOffer(
      offerState({ usageStart: '2027-01-01', usageEnd: '2027-01-31' }),
      [],
      undefined,
      [...DEFAULT_TARIFF_VERSIONS, nextTariff],
    );
    expect(result.valid).toBe(true);
    expect(result.periods[0]?.tariffSnapshot).toMatchObject({
      tariffId: 'tariff-2027',
      distributionUnitTlMwh: 2100,
    });
  });

  it('2026 and 2027 periods use separate snapshots', () => {
    const nextTariff: TariffVersion = {
      ...relevantTariff(),
      id: 'tariff-2027',
      validFrom: '2027-01-01',
      validTo: '2027-12-31',
      distributionUnitTlMwh: 2100,
      versionLabel: '2027.1',
    };
    const result = calculateOffer(
      offerState({ usageStart: '2026-12-01', usageEnd: '2027-01-31' }),
      [],
      undefined,
      [...DEFAULT_TARIFF_VERSIONS, nextTariff],
    );
    expect(result.periods.map((period) => period.tariffSnapshot?.versionLabel)).toEqual([
      '2026.1',
      '2027.1',
    ]);
  });

  it('overlapping active tariffs are rejected', () => {
    const first = relevantTariff();
    const duplicate = { ...first, id: 'overlap', validFrom: '2026-06-01' };
    expect(validateTariffVersions([first, duplicate]).join(' ')).toContain('çakışıyor');
  });

  it('invalid tariff date range is rejected', () => {
    expect(
      validateTariffVersions([
        { ...relevantTariff(), validFrom: '2026-12-31', validTo: '2026-01-01' },
      ]).join(' '),
    ).toContain('başlangıcı bitişten sonra');
  });
});

describe('P0-C gerçekleşme tarife ve GES kaynakları', () => {
  it('realization uses each period tariff snapshot', () => {
    const result = calculateOffer(
      offerState({
        usageEnd: '2026-08-31',
        tariffOverrides: [
          { month: '2026-07', kdvRate: 10, btvRate: 1, distributionUnitTlMwh: 100, reason: 'Temmuz' },
          { month: '2026-08', kdvRate: 20, btvRate: 5, distributionUnitTlMwh: 200, reason: 'Ağustos' },
        ],
      }),
      [],
      prices,
    );
    const realization = calculateRealization(scenarioBase(toOffer(result)), 5.55, prices);
    expect(realization.billingPeriods?.map((period) => period.grossInvoice)).toEqual(
      result.periods.map((period) => period.grossInvoice),
    );
    expect(realization.billingPeriods?.map((period) => period.tariffSnapshot?.kdvRate)).toEqual([
      10,
      20,
    ]);
  });

  it('manual override survives realization', () => {
    const result = calculateOffer(
      offerState({
        tariffOverrides: [
          { month: '2026-07', kdvRate: 18, btvRate: 2, distributionUnitTlMwh: 500, reason: 'Onaylı' },
        ],
      }),
      [],
      prices,
    );
    const realization = calculateRealization(scenarioBase(toOffer(result)), 5.55, prices);
    expect(realization.billingPeriods?.[0]?.tariffSnapshot).toMatchObject({
      sourceMode: 'explicit_override',
      manualOverride: true,
      overrideReason: 'Onaylı',
      kdvRate: 18,
      btvRate: 2,
    });
    expect(realization.billingPeriods?.[0]?.grossInvoice).toBe(result.periods[0]?.grossInvoice);
  });

  it('settings changes do not mutate source snapshot', () => {
    const result = calculateOffer(offerState(), [], prices);
    const offer = toOffer(result);
    const scenario = scenarioBase(offer);
    const before = JSON.stringify(offer);
    const first = calculateRealization(scenario, 5.55, prices);
    calculateOffer(offerState(), [], prices, [{ ...relevantTariff(), kdvRate: 1 }]);
    const second = calculateRealization(scenario, 5.55, prices);
    expect(JSON.stringify(offer)).toBe(before);
    expect(second.billingPeriods).toEqual(first.billingPeriods);
  });

  it('actual GES manual tax is included exactly once and all totals reconcile', () => {
    const result = calculateOffer(
      offerState({
        ges: {
          mode: 'advanced_metering',
          selfConsumptionRate: 0,
          totalProductionMwh: 10,
          simultaneousSelfConsumptionMwh: 0,
          gridImportMwh: 100,
          gridExportMwh: 10,
          excessAfterNettingMwh: 10,
          priceType: 'ptf',
          nettingMethod: 'manual',
          excessProductionTaxMode: 'manual',
          manualTaxAmountTl: 500,
          settlementMode: 'cash_outflow',
          excessPurchasePaymentOffsetDays: 10,
        },
      }),
      [],
      prices,
    );
    const offer = toOffer(result);
    const base = scenarioBase(offer, '2026-08-31');
    const actual = calculateRealization(base, 5.55, prices);
    const scenario: RealizationScenario = { ...base, resultSnapshot: actual };
    const calendar = buildRealizationPaymentCalendar(scenario, 'Müşteri');
    const supplierTotal = (actual.actualCashEvents ?? [])
      .filter((event) => event.type === 'excess_production_purchase')
      .reduce((sum, event) => sum + event.amount, 0);
    const profitLedgerGes = actual.profitLedger
      .filter((entry) => entry.component === 'excess_production_purchase')
      .reduce((sum, entry) => sum + entry.amount, 0);
    expect(actual.actualExcessProductionPurchase).toBe(10_500);
    expect(actual.billingPeriods?.[0]?.excessPurchaseAmount).toBe(10_500);
    expect(actual.periods[0]?.actualExcessProductionPurchase).toBe(10_500);
    expect(supplierTotal).toBe(10_500);
    expect(profitLedgerGes).toBe(10_500);
    expect(calendar.summary.totalExcessProductionPurchase).toBe(10_500);
  });
});
