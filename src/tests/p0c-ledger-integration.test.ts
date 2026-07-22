import { describe, expect, it } from 'vitest';
import { createPaymentPlan } from '../config/paymentPlans';
import { buildPlannedPaymentCalendar } from '../domain/payment-calendar/paymentCalendar';
import {
  allocatePaymentsToReceivables,
  buildReceivableInstallments,
} from '../domain/receivables/ledger';
import { calculateReceivableInstallmentDelinquency } from '../domain/late-fee/lateFee';
import { applyPlannedReconciliation } from '../domain/reconciliation/reconciliation';
import type {
  ActualPayment,
  BillingPeriod,
  PlannedOffer,
  PlannedPayment,
  ReconciliationSettings,
} from '../types';

const period = (index: number): BillingPeriod => ({
  id: `period-${index}`,
  index,
  start: `2026-0${index}-01`,
  end: `2026-0${index}-28`,
  invoiceDate: `2026-0${index}-28`,
  days: 28,
  monthFactor: 1,
  share: 0.5,
  grossConsumptionMwh: 0,
  gesSelfConsumptionMwh: 0,
  gridConsumptionMwh: 0,
  activeEnergyUnitPrice: 0,
  ptfAmount: 0,
  yekdemAmount: 0,
  activeEnergyBaseAmount: 0,
  offerMargin: 0,
  activeEnergySalesAmount: 0,
  distributionAmount: 0,
  contractPowerAmount: 0,
  btvBase: 0,
  btvAmount: 0,
  kdvBase: 0,
  kdvAmount: 0,
  grossInvoice: 100,
  gesSelfConsumptionSavings: 0,
  imbalanceAmount: 0,
  piuAmount: 0,
});

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

const settings = (patch: Partial<ReconciliationSettings>): ReconciliationSettings => ({
  ...createPaymentPlan().reconciliation,
  ...patch,
});

const reconcile = (configuration: ReconciliationSettings, first = 150, second = 100) =>
  applyPlannedReconciliation(
    [period(1), period(2)],
    [payment('period-1', first, '2026-01-28'), payment('period-2', second, '2026-02-28')],
    configuration,
    '2026-01-01',
    '2026-02-28',
  );

const plannedOffer = (
  result: ReturnType<typeof applyPlannedReconciliation>,
  configuration: ReconciliationSettings,
): PlannedOffer => {
  const plan = { ...createPaymentPlan(), reconciliation: configuration };
  return {
    id: 'offer',
    recordType: 'planned_offer',
    customerId: 'customer',
    version: 1,
    title: 'Ledger testi',
    status: 'final',
    stateSnapshot: {
      customerId: 'customer',
      title: 'Ledger testi',
      usageStart: '2026-01-01',
      usageEnd: '2026-02-28',
      monthlyConsumption: 0,
      monthlyConsumptionUnit: 'MWh',
      customerType: 'tek-terimli-ag-sanayi',
      kdvRate: 20,
      btvRate: 1,
      distributionUnitTlMwh: 0,
      hasDistribution: false,
      contractPowerTl: 0,
      ptfTlMwh: 0,
      yekdemTlMwh: 0,
      offerRate: 0,
      imbalanceRate: 0,
      piuRate: 0,
      creditRate: 0,
      valorRate: 0,
      yekdemDueOffset: 0,
      distributionDueOffset: 0,
      kdvDueOffset: 0,
      btvDueOffset: 0,
      ges: { mode: 'simple_self_consumption', selfConsumptionRate: 0 },
      paymentPlan: plan,
      tariffOverrides: [],
    },
    paymentPlanSnapshot: plan,
    resultSnapshot: {
      valid: true,
      errors: [],
      warnings: result.warnings,
      policyVersion: 'test',
      calculatedAt: '2026-02-28T00:00:00.000Z',
      state: {} as PlannedOffer['stateSnapshot'],
      periods: [period(1), period(2)],
      plannedPayments: result.payments,
      cashEvents: result.payments.map((item) => ({
        id: item.id,
        date: item.transactionDate,
        type: 'customer_payment' as const,
        direction: 'in' as const,
        amount: item.netCashIn,
        principalAmount: item.principalAmount,
        label: item.planRowName,
      })),
      plannedCashflow: [],
      monthlyProfit: [],
      profitLedger: [],
      endingCashBalance: 0,
      openFinancingBalance: 0,
      effectiveCreditRate: 0,
      effectiveValorRate: 0,
      reconciliationInstructions: result.instructions,
      endingCustomerAdvance: result.endingAdvance,
      endingOpenReceivable: result.endingReceivable,
      totals: { excessProductionPurchase: 0 } as PlannedOffer['resultSnapshot']['totals'],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
};

describe('P0-C mutabakat ve receivable ledger entegrasyonu', () => {
  it('disabled multi-period overpayment does not carry', () => {
    const result = reconcile(settings({ enabled: false }));
    expect(result.payments.map((item) => item.principalAmount)).toEqual([150, 100]);
    expect(result.endingAdvance).toBe(50);
    expect(result.endingReceivable).toBe(0);
    expect(result.instructions.some((item) => item.type === 'carry_advance_forward')).toBe(false);
    expect(result.warnings.join(' ')).toContain('otomatik uygulanmadı');
  });

  it('disabled result and planned calendar reconcile', () => {
    const configuration = settings({ enabled: false });
    const result = reconcile(configuration);
    const calendar = buildPlannedPaymentCalendar(plannedOffer(result, configuration), 'Müşteri');
    expect(calendar.summary.customerAdvance).toBe(50);
    expect(calendar.summary.openReceivable).toBe(0);
    expect(calendar.summary.customerAdvance).toBe(result.endingAdvance);
  });

  it('carry-forward integrated offer/calendar ends 0 advance and 0 receivable', () => {
    const configuration = settings({ enabled: true, overpaymentAction: 'carry_forward' });
    const result = reconcile(configuration);
    const calendar = buildPlannedPaymentCalendar(plannedOffer(result, configuration), 'Müşteri');
    expect(result.payments.map((item) => item.principalAmount)).toEqual([150, 50]);
    expect(calendar.summary.customerAdvance).toBe(0);
    expect(calendar.summary.openReceivable).toBe(0);
    expect(calendar.rows.some((row) => row.notes.some((note) => note.includes('nakit değildir')))).toBe(true);
  });

  it('carry-forward does not duplicate principal', () => {
    const result = reconcile(settings({ enabled: true, overpaymentAction: 'carry_forward' }));
    const installments = buildReceivableInstallments(
      [period(1), period(2)],
      result.payments,
      result.instructions,
    );
    const actual: ActualPayment[] = result.payments.map((item) => ({
      id: item.id,
      date: item.transactionDate,
      amount: item.principalAmount,
      channel: 'eft',
    }));
    const ledger = allocatePaymentsToReceivables(installments, actual, '2026-02-28', {
      autoApplyAdvance: true,
    });
    expect(ledger.totalCollectedPrincipal).toBe(150);
    expect(ledger.totalAdvanceApplied).toBe(50);
    expect(200).toBe(ledger.totalCollectedPrincipal + ledger.totalAdvanceApplied + ledger.totalOutstandingPrincipal);
    expect(200).toBe(ledger.totalCollectedPrincipal + ledger.totalAdvanceApplied + ledger.customerAdvance);
  });

  it('actual carry-forward advance applies to future invoice', () => {
    const installments = buildReceivableInstallments(
      [period(1), period(2)],
      [payment('period-1', 100, '2026-01-28'), payment('period-2', 100, '2026-02-28')],
    );
    const ledger = allocatePaymentsToReceivables(
      installments,
      [
        { id: 'actual-1', invoiceId: 'period-1', date: '2026-01-28', amount: 150, channel: 'eft' },
        { id: 'actual-2', invoiceId: 'period-2', date: '2026-02-28', amount: 50, channel: 'eft' },
      ],
      '2026-02-28',
      { autoApplyAdvance: true },
    );
    expect(ledger.advanceApplications).toMatchObject([
      { sourcePaymentId: 'actual-1', targetPeriodId: 'period-2', amount: 50 },
    ]);
    expect(ledger.customerAdvance).toBe(0);
    expect(ledger.totalOutstandingPrincipal).toBe(0);
  });

  it('applied advance cannot be refunded', () => {
    const installments = buildReceivableInstallments(
      [period(1), period(2)],
      [payment('period-1', 100, '2026-01-28'), payment('period-2', 100, '2026-02-28')],
    );
    const ledger = allocatePaymentsToReceivables(
      installments,
      [
        { id: 'actual-1', invoiceId: 'period-1', date: '2026-01-28', amount: 150, channel: 'eft' },
        { id: 'actual-2', invoiceId: 'period-2', date: '2026-02-28', amount: 50, channel: 'eft' },
      ],
      '2026-02-28',
      { autoApplyAdvance: true },
    );
    expect(ledger.advanceLots[0]?.originalAmount).toBe(50);
    expect(ledger.advanceLots[0]?.remainingAmount).toBe(0);
    expect(ledger.customerAdvance).toBe(0);
  });

  it('refund-after-days advance is not auto-applied', () => {
    const installments = buildReceivableInstallments(
      [period(1), period(2)],
      [payment('period-1', 100, '2026-01-28'), payment('period-2', 100, '2026-02-28')],
    );
    const ledger = allocatePaymentsToReceivables(
      installments,
      [
        { id: 'actual-1', invoiceId: 'period-1', date: '2026-01-28', amount: 150, channel: 'eft' },
        { id: 'actual-2', invoiceId: 'period-2', date: '2026-02-28', amount: 50, channel: 'eft' },
      ],
      '2026-02-28',
      { autoApplyAdvance: false },
    );
    expect(ledger.customerAdvance).toBe(50);
    expect(ledger.totalOutstandingPrincipal).toBe(50);
    expect(ledger.advanceApplications).toHaveLength(0);
  });

  it('carry-to-next integrated ledger ends 0/0', () => {
    const configuration = settings({ enabled: true, underpaymentAction: 'carry_to_next_invoice' });
    const result = reconcile(configuration, 50, 100);
    const calendar = buildPlannedPaymentCalendar(plannedOffer(result, configuration), 'Müşteri');
    expect(result.payments.map((item) => item.principalAmount)).toEqual([50, 150]);
    expect(calendar.summary.openReceivable).toBe(0);
    expect(calendar.summary.customerAdvance).toBe(0);
  });

  it('carry-to-next moves due principal without creating advance', () => {
    const result = reconcile(
      settings({ enabled: true, underpaymentAction: 'carry_to_next_invoice' }),
      50,
      100,
    );
    const installments = buildReceivableInstallments(
      [period(1), period(2)],
      result.payments,
      result.instructions,
    );
    const ledger = allocatePaymentsToReceivables(
      installments,
      [
        { id: 'actual-1', invoiceId: 'period-1', date: '2026-01-28', amount: 50, channel: 'eft' },
        { id: 'actual-2', invoiceId: 'period-2', date: '2026-02-28', amount: 150, channel: 'eft' },
      ],
      '2026-02-28',
    );
    expect(ledger.totalCollectedPrincipal).toBe(200);
    expect(ledger.totalOutstandingPrincipal).toBe(0);
    expect(ledger.customerAdvance).toBe(0);
  });

  it('late-fee schedule uses transferred due date', () => {
    const result = reconcile(
      settings({ enabled: true, underpaymentAction: 'carry_to_next_invoice' }),
      50,
      100,
    );
    const installment = buildReceivableInstallments(
      [period(1), period(2)],
      result.payments,
      result.instructions,
    ).find((item) => item.periodId === 'period-1' && item.id.endsWith('_residual'))!;
    expect(installment.dueDate).toBe('2026-02-28');
    const delinquency = calculateReceivableInstallmentDelinquency(
      installment,
      '2026-02-15',
      5.55,
      0.2,
    );
    expect(delinquency.lateFee).toBe(0);
  });
});
