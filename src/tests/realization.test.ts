import { describe, expect, it } from 'vitest';
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
});
