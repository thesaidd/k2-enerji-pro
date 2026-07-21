import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReconciliationStatusView } from '../components/ui/ReconciliationStatus';
import { calculateOffer } from '../domain/profitability/calculation';
import { resolveReconciliationStatus } from '../domain/profitability/reconciliation';
import { calculateRealization, LEGACY_GES_WARNING } from '../domain/realization/realization';
import { oneMwhState } from './helpers';
import type {
  MonthlyMarketPrice,
  OfferState,
  PlannedOffer,
  RealizationScenario,
} from '../types';

const marketPrices: MonthlyMarketPrice[] = [
  {
    month: '2026-07',
    forecastPtfTlMwh: 100,
    actualPtfTlMwh: 200,
    forecastYekdemTlMwh: 20,
    actualYekdemTlMwh: 30,
    updatedAt: '2026-07-01',
  },
  {
    month: '2026-08',
    forecastPtfTlMwh: 100,
    actualPtfTlMwh: 200,
    forecastYekdemTlMwh: 20,
    actualYekdemTlMwh: 30,
    updatedAt: '2026-08-01',
  },
];

const gesOffer = (
  priceType: 'ptf' | 'ptf_yekdem',
  patch: Partial<OfferState> = {},
): PlannedOffer => {
  const result = calculateOffer(
    oneMwhState({
      usageStart: '2026-07-01',
      usageEnd: '2026-07-31',
      monthlyConsumption: 31,
      creditRate: 0,
      valorRate: 0,
      ges: {
        mode: 'advanced_metering',
        selfConsumptionRate: 0,
        simultaneousSelfConsumptionMwh: 0,
        gridImportMwh: 31,
        gridExportMwh: 10,
        excessAfterNettingMwh: 10,
        priceType,
        excessProductionTaxMode: 'manual',
        settlementMode: 'cash_outflow',
      },
      ...patch,
    }),
    [],
    marketPrices,
  );
  return {
    id: `legacy_ges_${priceType}`,
    recordType: 'planned_offer',
    customerId: 'legacy_customer',
    version: 1,
    title: 'Legacy GES teklif',
    status: 'final',
    stateSnapshot: result.state,
    paymentPlanSnapshot: result.state.paymentPlan,
    resultSnapshot: result,
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  };
};

const withoutPeriodGesFields = (offer: PlannedOffer): PlannedOffer => {
  const legacy = structuredClone(offer);
  for (const period of legacy.resultSnapshot.periods) {
    delete period.gridExportMwh;
    delete period.excessProductionMwh;
    delete period.excessPurchasePrice;
    delete period.excessPurchaseAmount;
  }
  return legacy;
};

const scenarioFor = (
  offer: PlannedOffer,
): Omit<RealizationScenario, 'resultSnapshot'> => ({
  id: 'legacy_scenario',
  sourceCustomerId: offer.customerId,
  sourceOfferId: offer.id,
  sourceOfferVersion: offer.version,
  sourceOfferSnapshot: offer,
  name: 'Legacy gerçekleşme',
  asOfDate: '2026-09-30',
  periodOverrides: [],
  actualPayments: [],
  createdAt: '2026-07-01',
  updatedAt: '2026-07-01',
});

describe('legacy GES snapshot uyumluluğu', () => {
  it('dönemsel GES alanı olmayan eski snapshot toplamını korur ve kaynağı değiştirmez', () => {
    const legacy = withoutPeriodGesFields(gesOffer('ptf'));
    const before = JSON.stringify(legacy);
    const result = calculateRealization(scenarioFor(legacy), 5.55, marketPrices);

    expect(result.actualExcessProductionPurchase).toBeGreaterThan(0);
    expect(
      result.periods.reduce(
        (total, period) => total + period.actualExcessProductionPurchase,
        0,
      ),
    ).toBeCloseTo(result.actualExcessProductionPurchase, 10);
    expect(
      result.billingPeriods?.reduce(
        (total, period) => total + (period.excessPurchaseAmount ?? 0),
        0,
      ),
    ).toBeCloseTo(result.actualExcessProductionPurchase, 10);
    expect(result.marketPriceWarnings).toContain(LEGACY_GES_WARNING);
    expect(JSON.stringify(legacy)).toBe(before);
  });

  it('yeni snapshot GES tutarını ikinci kez hesaplamaz', () => {
    const offer = gesOffer('ptf');
    const result = calculateRealization(scenarioFor(offer), 5.55, marketPrices);

    expect(result.actualExcessProductionPurchase).toBeCloseTo(10 * 200, 10);
    expect(result.actualCashEvents?.filter((event) => event.type === 'excess_production_purchase'))
      .toHaveLength(1);
    expect(result.marketPriceWarnings).not.toContain(LEGACY_GES_WARNING);
  });

  it('actual PTF fiyatını eski snapshot fiziksel GES yeniden üretimine yansıtır', () => {
    const legacy = withoutPeriodGesFields(gesOffer('ptf'));
    const result = calculateRealization(scenarioFor(legacy), 5.55, marketPrices);

    expect(legacy.resultSnapshot.totals.excessProductionPurchase).toBeCloseTo(10 * 100, 10);
    expect(result.actualExcessProductionPurchase).toBeCloseTo(10 * 200, 10);
  });

  it('PTF+YEKDEM legacy yeniden üretiminde iki actual fiyatı da kullanır', () => {
    const legacy = withoutPeriodGesFields(gesOffer('ptf_yekdem'));
    const result = calculateRealization(scenarioFor(legacy), 5.55, marketPrices);

    expect(result.actualExcessProductionPurchase).toBeCloseTo(10 * (200 + 30), 10);
  });

  it('fiziksel miktar üretilemezse kaynak toplamını dönem payı ve son kalanla dağıtır', () => {
    const legacy = withoutPeriodGesFields(
      gesOffer('ptf', { usageEnd: '2026-08-31', monthlyConsumption: 31 }),
    );
    delete legacy.stateSnapshot.ges.gridExportMwh;
    delete legacy.stateSnapshot.ges.excessAfterNettingMwh;
    const result = calculateRealization(scenarioFor(legacy), 5.55, marketPrices);
    const periodTotal =
      result.billingPeriods?.reduce(
        (total, period) => total + (period.excessPurchaseAmount ?? 0),
        0,
      ) ?? 0;

    expect(periodTotal).toBeCloseTo(legacy.resultSnapshot.totals.excessProductionPurchase, 10);
    expect(result.actualExcessProductionPurchase).toBeCloseTo(periodTotal, 10);
  });
});

describe('üç durumlu mutabakat uyumluluğu', () => {
  it('alanları olmayan eski planlanan teklifi Mutabık göstermez', () => {
    const view = render(
      <ReconciliationStatusView
        label="Planlanan mutabakat"
        profitDifference={undefined}
        cashDifference={undefined}
      />,
    );
    const rendered = within(view.container);

    expect(rendered.getByText('Mutabakat hesaplanmadı')).toBeVisible();
    expect(rendered.queryByText(/^Mutabık$/)).not.toBeInTheDocument();
    expect(rendered.getByText(/Eski snapshot — mutabakat bilgisi hesaplanmamış/)).toBeVisible();
  });

  it('sıfır farkları Mutabık, toleransı aşan farkı Mutabakat farkı sayar', () => {
    expect(resolveReconciliationStatus(0, 0)).toBe('reconciled');
    expect(resolveReconciliationStatus(1e-5, 0)).toBe('difference');

    const reconciledView = render(
      <ReconciliationStatusView
        label="Yeni teklif mutabakatı"
        profitDifference={0}
        cashDifference={0}
      />,
    );
    const differenceView = render(
      <ReconciliationStatusView
        label="Farklı teklif mutabakatı"
        profitDifference={1e-5}
        cashDifference={0}
      />,
    );

    expect(within(reconciledView.container).getByText(/^Mutabık$/)).toBeVisible();
    expect(within(differenceView.container).getByText('Mutabakat farkı')).toBeVisible();
  });

  it('eksik, NaN ve finite olmayan farkları hesaplanmamış sayar', () => {
    expect(resolveReconciliationStatus(undefined, 0)).toBe('not_calculated');
    expect(resolveReconciliationStatus(Number.NaN, 0)).toBe('not_calculated');
    expect(resolveReconciliationStatus(0, Number.POSITIVE_INFINITY)).toBe('not_calculated');
  });

  it('alanları olmayan eski gerçekleşme snapshotını Mutabık göstermez', () => {
    const view = render(
      <ReconciliationStatusView
        label="Gerçekleşen mutabakat"
        profitDifference={undefined}
        cashDifference={undefined}
      />,
    );
    const rendered = within(view.container);

    expect(rendered.getByText('Mutabakat hesaplanmadı')).toBeVisible();
    expect(rendered.queryByText(/^Mutabık$/)).not.toBeInTheDocument();
  });
});
