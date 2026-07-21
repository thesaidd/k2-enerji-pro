import { describe, expect, it } from 'vitest';
import { createPaymentPlan } from '../config/paymentPlans';
import { calculateOffer } from '../domain/profitability/calculation';
import { calculateRealization } from '../domain/realization/realization';
import { oneMwhState } from './helpers';
import type { PlannedOffer, RealizationScenario } from '../types';

describe('planlanan ve gerçekleşen ayrımı', () => {
  it('gecikmeli tahsilatta kaynak teklifi değiştirmez', () => {
    const result = calculateOffer(
      oneMwhState({ offerRate: 10, usageStart: '2026-02-01', usageEnd: '2026-02-28' }),
    );
    const offer: PlannedOffer = {
      id: 'o1',
      recordType: 'planned_offer',
      customerId: 'c1',
      version: 1,
      title: 'Teklif',
      status: 'final',
      stateSnapshot: result.state,
      paymentPlanSnapshot: result.state.paymentPlan,
      resultSnapshot: result,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const before = JSON.stringify(offer);
    const due = result.plannedPayments[0]!.transactionDate;
    const scenario = {
      id: 's1',
      sourceCustomerId: 'c1',
      sourceOfferId: 'o1',
      sourceOfferVersion: 1,
      sourceOfferSnapshot: structuredClone(offer),
      name: '5 gün gecikmeli',
      asOfDate: '2026-03-15',
      periodOverrides: [],
      actualPayments: [
        {
          id: 'p1',
          invoiceId: result.periods[0]!.id,
          date:
            new Date(`${due}T00:00:00`).toISOString().slice(0, 10) === due
              ? '2026-03-15'
              : '2026-03-15',
          amount: result.periods[0]!.grossInvoice,
          channel: 'eft' as const,
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    } satisfies Omit<RealizationScenario, 'resultSnapshot'>;
    const realized = calculateRealization(scenario);
    expect(realized.totalLateFee).toBeGreaterThan(0);
    expect(realized.actualProfit).not.toBe(realized.plannedProfit);
    expect(JSON.stringify(offer)).toBe(before);
  });

  it('gerçekleşme sonucunda %80 avans ve %20 vadeli alacağı birleştirmez', () => {
    const result = calculateOffer(
      oneMwhState({
        offerRate: 10,
        usageStart: '2026-02-01',
        usageEnd: '2026-02-28',
        paymentPlan: createPaymentPlan('partial_advance_balance'),
      }),
    );
    const offer: PlannedOffer = {
      id: 'o1',
      recordType: 'planned_offer',
      customerId: 'c1',
      version: 1,
      title: 'Teklif',
      status: 'final',
      stateSnapshot: result.state,
      paymentPlanSnapshot: result.state.paymentPlan,
      resultSnapshot: result,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const scenario = {
      id: 's1',
      sourceCustomerId: 'c1',
      sourceOfferId: 'o1',
      sourceOfferVersion: 1,
      sourceOfferSnapshot: structuredClone(offer),
      name: 'Çoklu vade',
      asOfDate: '2026-02-01',
      periodOverrides: [],
      actualPayments: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    } satisfies Omit<RealizationScenario, 'resultSnapshot'>;

    const realized = calculateRealization(scenario);
    const installments = realized.periods[0]!.delinquency.installments;

    expect(installments).toHaveLength(2);
    expect(installments[0]!.principalAmount).toBeCloseTo(result.periods[0]!.grossInvoice * 0.8, 8);
    expect(installments[1]!.principalAmount).toBeCloseTo(result.periods[0]!.grossInvoice * 0.2, 8);
    expect(installments[0]!.dueDate).not.toBe(installments[1]!.dueDate);
    expect(installments[0]!.segments.length).toBeGreaterThan(0);
    expect(installments[1]!.segments).toHaveLength(0);
  });

  it('asOfDate sonrasındaki tahsilatı gerçekleşme nakit akışına ve alacağa almaz', () => {
    const result = calculateOffer(
      oneMwhState({ offerRate: 10, usageStart: '2026-02-01', usageEnd: '2026-02-28' }),
    );
    const offer: PlannedOffer = {
      id: 'o1',
      recordType: 'planned_offer',
      customerId: 'c1',
      version: 1,
      title: 'Teklif',
      status: 'final',
      stateSnapshot: result.state,
      paymentPlanSnapshot: result.state.paymentPlan,
      resultSnapshot: result,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const scenario = {
      id: 's1',
      sourceCustomerId: 'c1',
      sourceOfferId: 'o1',
      sourceOfferVersion: 1,
      sourceOfferSnapshot: structuredClone(offer),
      name: 'Gelecek tahsilat',
      asOfDate: '2026-03-15',
      periodOverrides: [],
      actualPayments: [
        {
          id: 'future_payment',
          invoiceId: result.periods[0]!.id,
          date: '2026-03-20',
          amount: result.periods[0]!.grossInvoice,
          channel: 'eft' as const,
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    } satisfies Omit<RealizationScenario, 'resultSnapshot'>;

    const realized = calculateRealization(scenario);

    expect(realized.receivableLedger.totalPaymentsAsOf).toBe(0);
    expect(realized.endingOpenReceivable).toBeCloseTo(result.periods[0]!.grossInvoice, 8);
    expect(realized.actualCashflow.reduce((sum, day) => sum + day.customerInflows, 0)).toBe(0);
  });
});
