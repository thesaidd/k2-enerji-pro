import { describe, expect, it } from 'vitest';
import {
  accrueMonthlyLateFeeDocuments,
  buildRealizationInvoiceSummaries,
} from '../domain/late-fee/accrual';
import {
  calculateInvoiceDelinquency,
  calculateLateFee,
  calculateLateFeeSegments,
  calculateLedgerInvoiceDelinquency,
} from '../domain/late-fee/lateFee';
import {
  allocatePaymentsToReceivables,
  buildReceivableInstallments,
} from '../domain/receivables/ledger';
import type { ActualPayment, BillingPeriod, PlannedPayment, ReceivableInstallment } from '../types';

const invoice = {
  id: 'invoice_1',
  grossInvoice: 2_567_837.53,
  kdvBase: 2_139_864.6083333334,
  kdvAmount: 427_972.9216666667,
} as BillingPeriod;

const billingPeriod = (
  id: string,
  index: number,
  invoiceDate: string,
  grossInvoice = 1_000_000,
  vatRate = 0.2,
): BillingPeriod =>
  ({
    id,
    index,
    start: invoiceDate,
    end: invoiceDate,
    invoiceDate,
    days: 1,
    monthFactor: 1,
    share: 1,
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
    btvBase: grossInvoice * 0.7,
    btvAmount: grossInvoice * 0.035,
    kdvBase: grossInvoice / (1 + vatRate),
    kdvAmount: (grossInvoice / (1 + vatRate)) * vatRate,
    grossInvoice,
    gesSelfConsumptionSavings: 0,
    imbalanceAmount: 0,
    piuAmount: 0,
  }) satisfies BillingPeriod;

const receivable = (
  id: string,
  invoiceId: string,
  periodIndex: number,
  principalAmount: number,
  dueDate: string,
): ReceivableInstallment => ({
  id,
  invoiceId,
  periodId: invoiceId,
  periodIndex,
  principalAmount,
  dueDate,
  collectedAmount: 0,
  outstandingPrincipal: principalAmount,
  allocations: [],
});

const plannedPayment = (
  id: string,
  periodId: string,
  principalAmount: number,
  transactionDate: string,
): PlannedPayment => ({
  id,
  periodId,
  planRowId: `row_${id}`,
  planRowName: id,
  transactionDate,
  settlementDate: transactionDate,
  paymentChannel: 'eft',
  principalAmount,
  epsasChannelCost: 0,
  customerChannelFee: 0,
  netCashIn: principalAmount,
  installmentNo: 1,
  installmentCount: 1,
});

const context = {
  sourceCustomerId: 'customer_1',
  sourceOfferId: 'offer_1',
  sourceScenarioId: 'scenario_1',
};

describe('gecikme motoru', () => {
  it('golden gecikme örneğini 360 gün basit faizle hesaplar', () => {
    const delinquency = calculateInvoiceDelinquency(
      invoice,
      '2026-01-01',
      [
        {
          id: 'p1',
          invoiceId: 'invoice_1',
          date: '2026-01-01',
          amount: 1_753_334.56,
          channel: 'eft',
        },
      ],
      '2026-09-25',
      5.55,
    );
    expect(delinquency.outstandingPrincipal).toBeCloseTo(814_502.97, 2);
    expect(delinquency.lateFee).toBeCloseTo(402_323.74, 2);
    expect(delinquency.lateFeeVat).toBeCloseTo(80_464.75, 2);
    expect(delinquency.outstandingPrincipal + delinquency.totalLateFeeReceivable).toBeCloseTo(
      1_297_291.46,
      2,
    );
  });

  it('vade gününü gecikme saymaz', () => {
    const sameDay = calculateInvoiceDelinquency(
      { ...invoice, grossInvoice: 1000 },
      '2026-02-15',
      [],
      '2026-02-15',
      5.55,
    );
    expect(sameDay.delayDays).toBe(0);
    expect(sameDay.lateFee).toBe(0);
  });

  it('kısmi tahsilatı kalan ana para segmentlerine ayırır', () => {
    const payments: ActualPayment[] = [
      { id: 'p1', invoiceId: 'invoice_1', date: '2026-02-20', amount: 400_000, channel: 'eft' },
      { id: 'p2', invoiceId: 'invoice_1', date: '2026-02-25', amount: 350_000, channel: 'eft' },
      { id: 'p3', invoiceId: 'invoice_1', date: '2026-03-10', amount: 250_000, channel: 'eft' },
    ];
    const segments = calculateLateFeeSegments(
      1_000_000,
      '2026-02-15',
      payments,
      '2026-03-10',
      5.55,
    );
    expect(segments.map((segment) => segment.principal)).toEqual([1_000_000, 600_000, 250_000]);
    expect(segments.every((segment) => segment.lateFee > 0)).toBe(true);
  });

  it('ay sonu vadeli alacakta sonlu ve deterministik tahakkuk belgeleri üretir', () => {
    const period = billingPeriod('period_1', 1, '2026-01-31');
    const ledger = allocatePaymentsToReceivables(
      [receivable('r1', period.id, period.index, 1_000_000, '2026-01-31')],
      [],
      '2026-03-31',
    );

    const first = accrueMonthlyLateFeeDocuments([period], ledger, '2026-03-31', 5.55, context);
    const second = accrueMonthlyLateFeeDocuments([period], ledger, '2026-03-31', 5.55, context);

    expect(first.map((document) => document.issueDate)).toEqual(['2026-02-28', '2026-03-31']);
    expect(first.map((document) => document.calculationEndDate)).toEqual([
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(first).toEqual(second);
  });

  it('ay içi tahsilattan sonra yalnız kalan ana parayı tahakkuk ettirir', () => {
    const period = billingPeriod('period_1', 1, '2026-02-01');
    const installment = receivable('r1', period.id, period.index, 1_000_000, '2026-02-01');
    const ledger = allocatePaymentsToReceivables(
      [installment],
      [
        {
          id: 'payment_1',
          receivableInstallmentId: installment.id,
          date: '2026-02-10',
          amount: 400_000,
          channel: 'eft',
        },
      ],
      '2026-02-28',
    );
    const delinquency = calculateLedgerInvoiceDelinquency(period, ledger, '2026-02-28', 5.55);
    const documents = accrueMonthlyLateFeeDocuments([period], ledger, '2026-02-28', 5.55, context);
    const expected = calculateLateFee(1_000_000, 9, 5.55) + calculateLateFee(600_000, 18, 5.55);

    expect(delinquency.segments.map((segment) => segment.principal)).toEqual([1_000_000, 600_000]);
    expect(delinquency.segments.map((segment) => segment.days)).toEqual([9, 18]);
    expect(documents).toHaveLength(1);
    expect(documents[0]!.lateFee).toBeCloseTo(expected, 8);
  });

  it('%80 avans ve %20 vadeli tutarı iki ayrı vade dilimi olarak korur', () => {
    const period = billingPeriod('period_1', 1, '2026-02-28');
    const installments = buildReceivableInstallments(
      [period],
      [
        plannedPayment('advance', period.id, 800_000, '2026-01-20'),
        plannedPayment('balance', period.id, 200_000, '2026-03-10'),
      ],
    );
    const ledger = allocatePaymentsToReceivables(installments, [], '2026-02-01');
    const delinquency = calculateLedgerInvoiceDelinquency(period, ledger, '2026-02-01', 5.55);

    expect(installments.map((item) => [item.principalAmount, item.dueDate])).toEqual([
      [800_000, '2026-01-20'],
      [200_000, '2026-03-10'],
    ]);
    expect(delinquency.installments[0]!.segments).toHaveLength(1);
    expect(delinquency.installments[1]!.segments).toHaveLength(0);
    expect(delinquency.lateFee).toBeCloseTo(calculateLateFee(800_000, 12, 5.55), 8);
  });

  it('asOfDate sonrasındaki tahsilatı açık ana para ve segmentlerden dışlar', () => {
    const period = billingPeriod('period_1', 1, '2026-02-15');
    const installment = receivable('r1', period.id, period.index, 1_000_000, '2026-02-15');
    const ledger = allocatePaymentsToReceivables(
      [installment],
      [
        {
          id: 'future_payment',
          receivableInstallmentId: installment.id,
          date: '2026-03-01',
          amount: 400_000,
          channel: 'eft',
        },
      ],
      '2026-02-20',
    );
    const delinquency = calculateLedgerInvoiceDelinquency(period, ledger, '2026-02-20', 5.55);

    expect(ledger.totalPaymentsAsOf).toBe(0);
    expect(ledger.totalOutstandingPrincipal).toBe(1_000_000);
    expect(delinquency.outstandingPrincipal).toBe(1_000_000);
    expect(delinquency.segments.map((segment) => [segment.principal, segment.days])).toEqual([
      [1_000_000, 5],
    ]);
  });

  it('atanmamış tahsilatı ödeme tarihinde vadesi gelmemiş faturaya uygulamaz', () => {
    const first = receivable('r1', 'period_1', 1, 100, '2026-01-15');
    const future = receivable('r2', 'period_2', 2, 100, '2026-03-15');
    const ledger = allocatePaymentsToReceivables(
      [first, future],
      [{ id: 'payment_1', date: '2026-02-01', amount: 200, channel: 'eft' }],
      '2026-02-01',
    );

    expect(ledger.installments.find((item) => item.id === first.id)!.outstandingPrincipal).toBe(0);
    expect(ledger.installments.find((item) => item.id === future.id)!.outstandingPrincipal).toBe(
      100,
    );
    expect(ledger.customerAdvance).toBe(100);
  });

  it('fazla tahsilatı müşteri avansı yapar ve negatif açık ana para üretmez', () => {
    const installment = receivable('r1', 'period_1', 1, 100, '2026-01-15');
    const ledger = allocatePaymentsToReceivables(
      [installment],
      [{ id: 'payment_1', date: '2026-01-20', amount: 150, channel: 'eft' }],
      '2026-01-20',
    );

    expect(ledger.totalCollectedPrincipal).toBe(100);
    expect(ledger.totalOutstandingPrincipal).toBe(0);
    expect(ledger.customerAdvance).toBe(50);
    expect(ledger.installments.every((item) => item.outstandingPrincipal >= 0)).toBe(true);
  });

  it('gecikme ve KDV carryover kalemlerini iki satırda ve vergi matrahları dışında tutar', () => {
    const first = billingPeriod('period_1', 1, '2026-01-31', 1_000_000, 0.18);
    const next = billingPeriod('period_2', 2, '2026-03-31', 500_000, 0.2);
    const ledger = allocatePaymentsToReceivables(
      [receivable('r1', first.id, first.index, 1_000_000, '2026-02-01')],
      [],
      '2026-02-28',
    );
    const documents = accrueMonthlyLateFeeDocuments(
      [first, next],
      ledger,
      '2026-02-28',
      5.55,
      context,
    );
    const summary = buildRealizationInvoiceSummaries([first, next], documents)[1]!;

    expect(documents[0]!.sourceVatRate).toBeCloseTo(0.18, 12);
    expect(documents[0]!.lateFeeVat).toBeCloseTo(documents[0]!.lateFee * 0.18, 8);
    expect(summary.carryoverLines.map((line) => line.kind)).toEqual(['late_fee', 'late_fee_vat']);
    expect(summary.carryoverLines.map((line) => line.label)).toEqual([
      'Önceki Dönem Gecikme Bedeli',
      'Önceki Dönem Gecikme Bedeli KDV’si',
    ]);
    expect(summary.carryoverLines.every((line) => !line.taxableAgain)).toBe(true);
    expect(summary.carryoverLines.every((line) => !line.includedInBtvBase)).toBe(true);
    expect(summary.carryoverLines.every((line) => !line.includedInKdvBase)).toBe(true);
    expect(summary.btvBase).toBe(next.btvBase);
    expect(summary.btvAmount).toBe(next.btvAmount);
    expect(summary.kdvBase).toBe(next.kdvBase);
    expect(summary.kdvAmount).toBe(next.kdvAmount);
    expect(summary.totalPayable).toBeCloseTo(next.grossInvoice + documents[0]!.totalAmount, 8);
  });

  it('carryover satırlarını yeni gecikme anaparasına veya ikinci tahakkuka dönüştürmez', () => {
    const first = billingPeriod('period_1', 1, '2026-01-31', 1_000_000);
    const next = billingPeriod('period_2', 2, '2026-03-31', 500_000);
    const sourceInstallments = [receivable('r1', first.id, first.index, 1_000_000, '2026-02-01')];
    const ledger = allocatePaymentsToReceivables(sourceInstallments, [], '2026-02-28');
    const documents = accrueMonthlyLateFeeDocuments(
      [first, next],
      ledger,
      '2026-02-28',
      5.55,
      context,
    );
    const rerun = accrueMonthlyLateFeeDocuments([first, next], ledger, '2026-02-28', 5.55, context);
    const nextInstallments = buildReceivableInstallments(
      [next],
      [plannedPayment('next_payment', next.id, next.grossInvoice, '2026-04-10')],
    );

    expect(rerun).toEqual(documents);
    expect(new Set(documents.map((document) => document.id)).size).toBe(documents.length);
    expect(nextInstallments.reduce((sum, item) => sum + item.principalAmount, 0)).toBe(
      next.grossInvoice,
    );
    expect(
      documents.flatMap((document) => document.lineItems).every((line) => !line.createsLateFee),
    ).toBe(true);
  });

  it('sonraki elektrik faturası yoksa kaynak bilgili nihai gecikme faturası üretir', () => {
    const period = billingPeriod('period_1', 1, '2026-01-31', 1_000_000, 0.1);
    const ledger = allocatePaymentsToReceivables(
      [receivable('r1', period.id, period.index, 1_000_000, '2026-02-01')],
      [],
      '2026-02-28',
    );
    const [document] = accrueMonthlyLateFeeDocuments([period], ledger, '2026-02-28', 5.55, context);

    expect(document).toMatchObject({
      title: 'Nihai Gecikme Bedeli Faturası',
      kind: 'final_late_fee_invoice',
      sourceCustomerId: context.sourceCustomerId,
      sourceOfferId: context.sourceOfferId,
      sourceScenarioId: context.sourceScenarioId,
      sourceInvoiceId: period.id,
      sourceReceivableInstallmentId: 'r1',
      calculationStartDate: '2026-02-02',
      calculationEndDate: '2026-02-28',
      openPrincipal: 1_000_000,
      sourceVatRate: 0.1,
    });
    expect(document!.lateFeeVat).toBeCloseTo(document!.lateFee * 0.1, 8);
    expect(document!.totalAmount).toBeCloseTo(document!.lateFee + document!.lateFeeVat, 8);
    expect(document!.lineItems.every((line) => !line.taxableAgain && !line.createsLateFee)).toBe(
      true,
    );
  });
});
