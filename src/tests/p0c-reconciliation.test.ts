import { describe, expect, it } from 'vitest';
import { applyPlannedReconciliation } from '../domain/reconciliation/reconciliation';
import { createPaymentPlan } from '../config/paymentPlans';
import type { BillingPeriod, PlannedPayment, ReconciliationSettings } from '../types';
import { calculateOffer } from '../domain/profitability/calculation';
import { calculateRealization } from '../domain/realization/realization';
import { oneMwhState } from './helpers';
import type { PlannedOffer, RealizationScenario } from '../types';

const period = (index: number): BillingPeriod =>
  ({
    id: `period-${index}`,
    index,
    start: `2026-0${index}-01`,
    end: `2026-0${index}-28`,
    invoiceDate: `2026-0${index}-28`,
    days: 28,
    monthFactor: 1,
    share: 0.5,
    grossInvoice: 100,
  }) as BillingPeriod;

const payment = (periodId: string, amount: number, date: string): PlannedPayment => ({
  id: `payment-${periodId}`,
  periodId,
  planRowId: 'row',
  planRowName: 'Planlı tahsilat',
  transactionDate: date,
  settlementDate: date,
  paymentChannel: 'eft',
  commissionRate: 0,
  commissionBearer: 'epsas',
  principalAmount: amount,
  epsasChannelCost: 0,
  customerChannelFee: 0,
  netCashIn: amount,
  installmentNo: 1,
  installmentCount: 1,
});

const settings = (patch: Partial<ReconciliationSettings> = {}): ReconciliationSettings => ({
  ...createPaymentPlan().reconciliation,
  ...patch,
});

describe('P0-C planlanan mutabakat motoru', () => {
  it('kapalı mutabakatta fazla ödemeyi avans bırakır ve iade üretmez', () => {
    const result = applyPlannedReconciliation(
      [period(1)],
      [payment('period-1', 130, '2026-01-28')],
      settings({ enabled: false }),
      '2026-01-01',
      '2026-01-28',
    );
    expect(result.endingAdvance).toBeCloseTo(30, 8);
    expect(result.cashEvents).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('müşteri avansı');
  });

  it('kapalı mutabakatta eksik ödemeyi açık alacak bırakır', () => {
    const result = applyPlannedReconciliation(
      [period(1)],
      [payment('period-1', 40, '2026-01-28')],
      settings({ enabled: false }),
      '2026-01-01',
      '2026-01-28',
    );
    expect(result.endingReceivable).toBeCloseTo(60, 8);
    expect(result.payments).toHaveLength(1);
  });

  it('carry_forward avansı sonraki tahsilattan düşer ve yeni nakit olayı üretmez', () => {
    const result = applyPlannedReconciliation(
      [period(1), period(2)],
      [
        payment('period-1', 150, '2026-01-28'),
        payment('period-2', 100, '2026-02-28'),
      ],
      settings({ overpaymentAction: 'carry_forward' }),
      '2026-01-01',
      '2026-02-28',
    );
    expect(result.payments.find((item) => item.periodId === 'period-2')?.principalAmount).toBe(50);
    expect(result.cashEvents).toHaveLength(0);
    expect(result.endingAdvance).toBe(0);
  });

  it('refund_after_days ilk iş gününde müşteri iadesi üretir', () => {
    const result = applyPlannedReconciliation(
      [period(1)],
      [payment('period-1', 125, '2026-01-28')],
      settings({ overpaymentAction: 'refund_after_days', refundOffsetDays: 3 }),
      '2026-01-01',
      '2026-01-28',
    );
    expect(result.cashEvents[0]).toMatchObject({
      type: 'customer_refund',
      amount: 25,
      date: '2026-02-02',
    });
    expect(result.endingAdvance).toBe(0);
  });

  it('collect_after_days tamamlayıcı brüt tahsilat ve tek kanal maliyeti üretir', () => {
    const result = applyPlannedReconciliation(
      [period(1)],
      [payment('period-1', 40, '2026-01-28')],
      settings({
        underpaymentAction: 'collect_after_days',
        collectionOffsetDays: 2,
        collectionCommissionRate: 2,
        collectionCommissionBearer: 'epsas',
      }),
      '2026-01-01',
      '2026-01-28',
    );
    const supplemental = result.payments.find((item) => item.planRowId === 'reconciliation');
    expect(supplemental?.principalAmount).toBeCloseTo(60, 8);
    expect(supplemental?.epsasChannelCost).toBeCloseTo(1.2, 8);
    expect(supplemental?.netCashIn).toBeCloseTo(58.8, 8);
    expect(result.endingReceivable).toBe(0);
  });

  it('carry_to_next_invoice eksikliği sonraki hedefe yalnız bir kez ekler', () => {
    const result = applyPlannedReconciliation(
      [period(1), period(2)],
      [
        payment('period-1', 50, '2026-01-28'),
        payment('period-2', 100, '2026-02-28'),
      ],
      settings({ underpaymentAction: 'carry_to_next_invoice' }),
      '2026-01-01',
      '2026-02-28',
    );
    expect(result.payments.find((item) => item.periodId === 'period-2')?.principalAmount).toBe(150);
    expect(result.endingReceivable).toBe(0);
  });

  it('leave_open otomatik ödeme oluşturmaz', () => {
    const result = applyPlannedReconciliation(
      [period(1)],
      [],
      settings({ underpaymentAction: 'leave_open' }),
      '2026-01-01',
      '2026-01-28',
    );
    expect(result.payments).toHaveLength(0);
    expect(result.endingReceivable).toBe(100);
    expect(result.instructions[0]?.type).toBe('leave_receivable_open');
  });
});

describe('P0-C gerçek müşteri iadesi', () => {
  const fixture = () => {
    const result = calculateOffer(
      oneMwhState({
        usageStart: '2026-07-01',
        usageEnd: '2026-07-31',
        creditRate: 0,
        valorRate: 0,
      }),
    );
    const offer: PlannedOffer = {
      id: 'refund-offer',
      recordType: 'planned_offer',
      customerId: 'customer',
      version: 1,
      title: 'İade teklifi',
      status: 'final',
      stateSnapshot: result.state,
      paymentPlanSnapshot: result.state.paymentPlan,
      resultSnapshot: result,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
    const base = {
      id: 'refund-scenario',
      sourceCustomerId: 'customer',
      sourceOfferId: offer.id,
      sourceOfferVersion: 1,
      sourceOfferSnapshot: offer,
      name: 'İade',
      asOfDate: '2026-08-20',
      periodOverrides: [],
      financingOverrides: { creditRate: 0, valorRate: 0 },
      actualPayments: [
        {
          id: 'overpayment',
          date: '2026-08-10',
          amount: result.totals.grossInvoice + 100,
          channel: 'eft' as const,
        },
      ],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    } satisfies Omit<RealizationScenario, 'resultSnapshot'>;
    return { base };
  };

  it('iade avansı azaltır, nakit çıkışı oluşturur ve doğrudan kâra girmez', () => {
    const { base } = fixture();
    const withoutRefund = calculateRealization(base);
    const withRefund = calculateRealization({
      ...base,
      actualRefunds: [{ id: 'refund', date: '2026-08-15', amount: 40, note: 'Kısmi iade' }],
    });
    expect(withRefund.receivableLedger.customerAdvance).toBeCloseTo(60, 8);
    expect(withRefund.actualRefundTotal).toBe(40);
    expect(withRefund.actualCashEvents?.some((event) => event.type === 'customer_refund')).toBe(true);
    expect(withRefund.actualProfit).toBeCloseTo(withoutRefund.actualProfit, 8);
  });

  it('asOfDate sonrası iadeyi gerçekleşmiş saymaz ve avansı aşan iadeyi reddeder', () => {
    const { base } = fixture();
    const future = calculateRealization({
      ...base,
      actualRefunds: [{ id: 'future', date: '2026-08-21', amount: 40 }],
    });
    expect(future.actualRefundTotal).toBe(0);
    expect(future.receivableLedger.customerAdvance).toBeCloseTo(100, 8);
    expect(() =>
      calculateRealization({
        ...base,
        actualRefunds: [{ id: 'too-much', date: '2026-08-15', amount: 101 }],
      }),
    ).toThrow(/müşteri avansını aşamaz/i);
  });
});
