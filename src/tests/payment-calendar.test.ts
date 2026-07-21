import { describe, expect, it } from 'vitest';
import { createPaymentPlan } from '../config/paymentPlans';
import {
  buildPlannedPaymentCalendar,
  buildRealizationPaymentCalendar,
  filterPaymentCalendarRows,
  PAYMENT_CALENDAR_HEADERS,
  paymentCalendarToRows,
  paymentCalendarUrl,
} from '../domain/payment-calendar/paymentCalendar';
import { calculateOffer } from '../domain/profitability/calculation';
import { calculateRealization } from '../domain/realization/realization';
import { oneMwhState } from './helpers';
import type { MonthlyMarketPrice, PlannedOffer, RealizationScenario } from '../types';

const monthlyPrices: MonthlyMarketPrice[] = [
  {
    month: '2026-07',
    forecastPtfTlMwh: 3200,
    actualPtfTlMwh: 3300,
    forecastYekdemTlMwh: 400,
    actualYekdemTlMwh: 410,
    updatedAt: '2026-07-01',
  },
];

const offerWithPlan = (templateId = 'standard_deferred'): PlannedOffer => {
  const state = oneMwhState({
    usageStart: '2026-07-01',
    usageEnd: '2026-07-31',
    monthlyConsumption: 31,
    offerRate: 8,
    paymentPlan: createPaymentPlan(templateId),
  });
  const result = calculateOffer(state, [], monthlyPrices);
  return {
    id: 'offer_1',
    recordType: 'planned_offer',
    customerId: 'customer_1',
    version: 2,
    title: 'Takvim teklifi',
    status: 'final',
    stateSnapshot: result.state,
    paymentPlanSnapshot: result.state.paymentPlan,
    resultSnapshot: result,
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  };
};

const realizationScenario = (): RealizationScenario => {
  const offer = offerWithPlan();
  const base = {
    id: 'scenario_1',
    sourceCustomerId: offer.customerId,
    sourceOfferId: offer.id,
    sourceOfferVersion: offer.version,
    sourceOfferSnapshot: structuredClone(offer),
    name: 'Takvim gerçekleşmesi',
    asOfDate: '2026-08-31',
    periodOverrides: [],
    actualPayments: [
      {
        id: 'actual_1',
        invoiceId: offer.resultSnapshot.periods[0]!.id,
        date: '2026-08-20',
        amount: offer.resultSnapshot.periods[0]!.grossInvoice / 2,
        channel: 'eft' as const,
      },
    ],
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  } satisfies Omit<RealizationScenario, 'resultSnapshot'>;
  return {
    ...base,
    resultSnapshot: calculateRealization(base, 5.55, monthlyPrices),
  };
};

describe('planlanan ödeme/kullanım takvimi', () => {
  it('günlük finansman satırlarını plannedCashflow ile mutabık tutar', () => {
    const offer = offerWithPlan();
    const calendar = buildPlannedPaymentCalendar(offer, 'ABC Sanayi');
    for (const cashflow of offer.resultSnapshot.plannedCashflow) {
      const row = calendar.rows.find((item) => item.date === cashflow.date)!;
      expect(row.openingBalance).toBeCloseTo(cashflow.openingBalance, 10);
      expect(row.balanceAfterOutflows).toBeCloseTo(cashflow.balanceAfterOutflows, 10);
      expect(row.creditInterest).toBeCloseTo(cashflow.creditInterest, 10);
      expect(row.valorInterest).toBeCloseTo(cashflow.valorInterest, 10);
      expect(row.closingBalance).toBeCloseTo(cashflow.closingBalance, 10);
    }
  });

  it('tedarikçi çıkış kategorilerini supplier outflow ile mutabık tutar', () => {
    const offer = offerWithPlan();
    const calendar = buildPlannedPaymentCalendar(offer, 'ABC Sanayi');
    for (const cashflow of offer.resultSnapshot.plannedCashflow) {
      const row = calendar.rows.find((item) => item.date === cashflow.date)!;
      const categorized =
        row.ptfOutflow +
        row.yekdemOutflow +
        row.distributionOutflow +
        row.contractPowerOutflow +
        row.btvOutflow +
        row.kdvOutflow +
        row.excessProductionOutflow;
      expect(categorized).toBeCloseTo(cashflow.supplierOutflows, 8);
    }
  });

  it('müşteri net nakit girişini cash event ve özet toplamıyla mutabık tutar', () => {
    const offer = offerWithPlan();
    const calendar = buildPlannedPaymentCalendar(offer, 'ABC Sanayi');
    const eventTotal = offer.resultSnapshot.cashEvents
      .filter((event) => event.type === 'customer_payment')
      .reduce((sum, event) => sum + event.amount, 0);
    expect(calendar.summary.totalCustomerCashIn).toBeCloseTo(eventTotal, 8);
    expect(calendar.rows.reduce((sum, row) => sum + row.customerNetCashIn, 0)).toBeCloseTo(
      eventTotal,
      8,
    );
  });

  it('her günlük satırda kapanış bakiyesi invariantını korur', () => {
    const calendar = buildPlannedPaymentCalendar(offerWithPlan(), 'ABC Sanayi');
    for (const row of calendar.rows)
      expect(row.closingBalance).toBeCloseTo(
        row.balanceAfterOutflows -
          row.creditInterest +
          row.valorInterest +
          row.customerNetCashIn +
          row.lateFeeCashIn,
        8,
      );
  });

  it('müşteri tahsilatına aynı gün valör üretmez', () => {
    const offer = offerWithPlan('full_advance');
    const calendar = buildPlannedPaymentCalendar(offer, 'ABC Sanayi');
    const paymentDay = calendar.rows.find((row) => row.customerNetCashIn > 0)!;
    expect(paymentDay.openingBalance).toBe(0);
    expect(paymentDay.valorInterest).toBe(0);
  });

  it('günlük tüketim toplamını mevcut dönem tüketimiyle mutabık tutar', () => {
    const offer = offerWithPlan();
    const calendar = buildPlannedPaymentCalendar(offer, 'ABC Sanayi');
    expect(calendar.rows.reduce((sum, row) => sum + row.consumptionMwh, 0)).toBeCloseTo(
      offer.resultSnapshot.totals.grossConsumptionMwh,
      10,
    );
  });

  it('filtreler satır görünümünü değiştirirken finansal özeti değiştirmez', () => {
    const calendar = buildPlannedPaymentCalendar(offerWithPlan(), 'ABC Sanayi');
    const before = structuredClone(calendar.summary);
    const filtered = filterPaymentCalendarRows(calendar.rows, {
      startDate: '2026-07-15',
      endDate: '2026-07-20',
      movementsOnly: true,
    });
    expect(filtered.length).toBeLessThan(calendar.rows.length);
    expect(calendar.summary).toEqual(before);
  });

  it('CSV çıktısında gerekli metadata ve günlük sütunları içerir', () => {
    const rows = paymentCalendarToRows(buildPlannedPaymentCalendar(offerWithPlan(), 'ABC Sanayi'));
    expect(rows).toContainEqual(['Müşteri', 'ABC Sanayi']);
    expect(rows).toContainEqual(['Kaynak türü', 'planned_offer']);
    expect(rows).toContainEqual([...PAYMENT_CALENDAR_HEADERS]);
  });

  it('teklif detayından doğru teklif seçimini taşıyan URL üretir', () => {
    expect(paymentCalendarUrl('planned_offer', 'offer 1')).toBe(
      '/payment-calendar?source=planned_offer&id=offer%201',
    );
  });
});

describe('gerçekleşen ödeme/kullanım takvimi', () => {
  it('gerçekleşme takvimini actualCashflow ile mutabık tutar', () => {
    const scenario = realizationScenario();
    const calendar = buildRealizationPaymentCalendar(scenario, 'ABC Sanayi');
    expect(scenario.resultSnapshot.billingPeriods?.[0]?.ptfUnitPrice).toBe(3300);
    expect(calendar.rows.reduce((total, row) => total + row.consumptionMwh, 0)).toBeCloseTo(
      scenario.resultSnapshot.billingPeriods!.reduce(
        (total, period) => total + period.grossConsumptionMwh,
        0,
      ),
      10,
    );
    for (const cashflow of scenario.resultSnapshot.actualCashflow) {
      const row = calendar.rows.find((item) => item.date === cashflow.date)!;
      expect(row.customerNetCashIn).toBeCloseTo(cashflow.customerInflows, 8);
      expect(row.creditInterest).toBeCloseTo(cashflow.creditInterest, 8);
      expect(row.closingBalance).toBeCloseTo(cashflow.closingBalance, 8);
    }
    for (const document of scenario.resultSnapshot.lateFeeDocuments) {
      const documentDay = calendar.rows.find((row) => row.date === document.issueDate)!;
      expect(documentDay.notes.join(' ')).toContain(document.title);
    }
  });

  it('planlanan ve gerçekleşen kaynakları birbirine karıştırmaz', () => {
    const scenario = realizationScenario();
    const planned = buildPlannedPaymentCalendar(scenario.sourceOfferSnapshot, 'ABC Sanayi');
    const actual = buildRealizationPaymentCalendar(scenario, 'ABC Sanayi');
    expect(planned.sourceType).toBe('planned_offer');
    expect(actual.sourceType).toBe('realization_scenario');
    expect(actual.summary.totalCustomerCashIn).not.toBe(planned.summary.totalCustomerCashIn);
    expect(actual.sourceId).toBe(scenario.id);
  });
});
