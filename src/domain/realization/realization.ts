import { createId } from '../../config/paymentPlans';
import { buildDailyCashflow, buildSupplierEvents } from '../financing/financing';
import {
  accrueMonthlyLateFeeDocuments,
  buildRealizationInvoiceSummaries,
} from '../late-fee/accrual';
import { calculateLedgerInvoiceDelinquency } from '../late-fee/lateFee';
import { calculateMonthlyProfit } from '../profitability/monthlyProfit';
import { allocatePaymentsToReceivables, buildReceivableInstallments } from '../receivables/ledger';
import { resolveRealizationMarketPrice } from '../market-prices/marketPrices';
import type {
  ActualPayment,
  BillingPeriod,
  CashEvent,
  PeriodRealizationResult,
  RealizationResult,
  RealizationScenario,
  MonthlyMarketPrice,
  MarketPriceSnapshot,
} from '../../types';

const scenarioPeriod = (
  period: BillingPeriod,
  offerRate: number,
  btvRate: number,
  kdvRate: number,
  imbalanceRate: number,
  piuRate: number,
  marketPrice: MarketPriceSnapshot,
): BillingPeriod => {
  const ptfAmount = period.gridConsumptionMwh * marketPrice.ptfUnitPrice;
  const yekdemAmount = period.gridConsumptionMwh * marketPrice.yekdemUnitPrice;
  const activeEnergyBaseAmount = ptfAmount + yekdemAmount;
  const offerMargin = (activeEnergyBaseAmount * offerRate) / 100;
  const activeEnergySalesAmount = activeEnergyBaseAmount + offerMargin;
  const btvBase = activeEnergySalesAmount;
  const btvAmount = (btvBase * btvRate) / 100;
  const kdvBase =
    activeEnergySalesAmount + period.distributionAmount + period.contractPowerAmount + btvAmount;
  const kdvAmount = (kdvBase * kdvRate) / 100;
  return {
    ...period,
    marketPriceMonth: marketPrice.month,
    ptfUnitPrice: marketPrice.ptfUnitPrice,
    yekdemUnitPrice: marketPrice.yekdemUnitPrice,
    ptfPriceSource: marketPrice.ptfPriceSource,
    yekdemPriceSource: marketPrice.yekdemPriceSource,
    ptfAmount,
    yekdemAmount,
    activeEnergyBaseAmount,
    offerMargin,
    activeEnergySalesAmount,
    activeEnergyUnitPrice:
      period.gridConsumptionMwh > 0 ? activeEnergySalesAmount / period.gridConsumptionMwh : 0,
    btvBase,
    btvAmount,
    kdvBase,
    kdvAmount,
    grossInvoice:
      activeEnergySalesAmount +
      period.distributionAmount +
      period.contractPowerAmount +
      btvAmount +
      kdvAmount,
    gesSelfConsumptionSavings:
      period.gesSelfConsumptionMwh *
      (period.gridConsumptionMwh > 0 ? activeEnergySalesAmount / period.gridConsumptionMwh : 0),
    imbalanceAmount: (activeEnergyBaseAmount * imbalanceRate) / 100,
    piuAmount: (activeEnergyBaseAmount * piuRate) / 100,
  };
};

export const calculateRealization = (
  scenario: Omit<RealizationScenario, 'resultSnapshot'>,
  monthlyLateFeeRate = 5.55,
  monthlyMarketPrices: MonthlyMarketPrice[] = [],
  holidays: string[] = [],
): RealizationResult => {
  const source = scenario.sourceOfferSnapshot.resultSnapshot;
  const state = scenario.sourceOfferSnapshot.stateSnapshot;
  const adjustedPeriods = source.periods.map((period) => {
    const override = scenario.periodOverrides.find((item) => item.periodId === period.id);
    const marketPrice = resolveRealizationMarketPrice(
      period,
      monthlyMarketPrices,
      scenario.asOfDate,
      override,
      state.ptfTlMwh,
      state.yekdemTlMwh,
    );
    return scenarioPeriod(
      period,
      override?.scenarioOfferRate ?? state.offerRate ?? 0,
      state.btvRate,
      state.kdvRate,
      state.imbalanceRate,
      state.piuRate,
      marketPrice,
    );
  });
  const receivableLedger = allocatePaymentsToReceivables(
    buildReceivableInstallments(adjustedPeriods, source.plannedPayments),
    scenario.actualPayments,
    scenario.asOfDate,
  );
  const effectivePayments = scenario.actualPayments.filter(
    (payment) => payment.date <= scenario.asOfDate && payment.amount > 0,
  );
  const actualPaymentEvents: CashEvent[] = effectivePayments.map((payment) => ({
    id: payment.id,
    date: payment.date,
    type: 'customer_payment',
    direction: 'in',
    amount: payment.amount,
    principalAmount: payment.amount,
    periodId: payment.invoiceId,
    label: 'Gerçek müşteri tahsilatı',
    note: payment.note,
  }));
  const supplierEvents = buildSupplierEvents(
    adjustedPeriods,
    state,
    source.totals.excessProductionPurchase,
    holidays,
  );
  const actualCashEvents = [...supplierEvents, ...actualPaymentEvents];
  const actualCashflow = buildDailyCashflow(actualCashEvents, state.creditRate, state.valorRate);
  const actualCreditCost = actualCashflow.reduce((sum, day) => sum + day.creditInterest, 0);
  const actualValorIncome = actualCashflow.reduce((sum, day) => sum + day.valorInterest, 0);
  const lateFeeDocuments = accrueMonthlyLateFeeDocuments(
    adjustedPeriods,
    receivableLedger,
    scenario.asOfDate,
    monthlyLateFeeRate,
    {
      sourceCustomerId: scenario.sourceCustomerId,
      sourceOfferId: scenario.sourceOfferId,
      sourceScenarioId: scenario.id,
    },
  );
  const invoiceSummaries = buildRealizationInvoiceSummaries(adjustedPeriods, lateFeeDocuments);
  const paymentsById = new Map(scenario.actualPayments.map((payment) => [payment.id, payment]));
  const plannedPeriodProfitBase = source.periods.reduce(
    (sum, period) => sum + period.offerMargin,
    0,
  );
  const periods: PeriodRealizationResult[] = adjustedPeriods.map((adjusted) => {
    const period = source.periods.find((candidate) => candidate.id === adjusted.id)!;
    const override = scenario.periodOverrides.find((item) => item.periodId === period.id);
    const marketPrice = resolveRealizationMarketPrice(
      period,
      monthlyMarketPrices,
      scenario.asOfDate,
      override,
      state.ptfTlMwh,
      state.yekdemTlMwh,
    );
    const offerRate = override?.scenarioOfferRate ?? state.offerRate ?? 0;
    const receivableInstallments = receivableLedger.installments.filter(
      (installment) => installment.invoiceId === period.id,
    );
    const delinquency = calculateLedgerInvoiceDelinquency(
      adjusted,
      receivableLedger,
      scenario.asOfDate,
      monthlyLateFeeRate,
    );
    const paymentGroups = new Map<string, ActualPayment>();
    for (const allocation of receivableLedger.allocations.filter(
      (item) => item.invoiceId === period.id,
    )) {
      const sourcePayment = paymentsById.get(allocation.paymentId)!;
      const current = paymentGroups.get(allocation.paymentId);
      paymentGroups.set(allocation.paymentId, {
        ...sourcePayment,
        invoiceId: period.id,
        receivableInstallmentId: current ? undefined : allocation.receivableInstallmentId,
        amount: (current?.amount ?? 0) + allocation.amount,
      });
    }
    const payments = [...paymentGroups.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    const profitShare =
      plannedPeriodProfitBase > 0 ? period.offerMargin / plannedPeriodProfitBase : period.share;
    const plannedNetProfit = source.totals.netProfit * profitShare;
    const financingShare = adjusted.grossInvoice / Math.max(1, source.totals.grossInvoice);
    const actualNetProfit =
      adjusted.offerMargin -
      adjusted.imbalanceAmount -
      adjusted.piuAmount -
      actualCreditCost * financingShare +
      actualValorIncome * financingShare +
      delinquency.lateFee;
    return {
      periodId: period.id,
      plannedInvoice: period.grossInvoice,
      plannedDueDate: receivableInstallments[0]?.dueDate ?? period.invoiceDate,
      receivableInstallments,
      invoiceSummary: invoiceSummaries.find((summary) => summary.periodId === period.id)!,
      actualPayments: payments,
      outstandingPrincipal: delinquency.outstandingPrincipal,
      delayDays: delinquency.delayDays,
      lateFee: delinquency.lateFee,
      lateFeeVat: delinquency.lateFeeVat,
      actualCreditCost: actualCreditCost * financingShare,
      actualValorIncome: actualValorIncome * financingShare,
      scenarioOfferRate: offerRate,
      plannedNetProfit,
      actualNetProfit,
      variance: actualNetProfit - plannedNetProfit,
      delinquency,
      marketPriceMonth: marketPrice.month,
      ptfUnitPrice: marketPrice.ptfUnitPrice,
      yekdemUnitPrice: marketPrice.yekdemUnitPrice,
      ptfPriceSource: marketPrice.ptfPriceSource,
      yekdemPriceSource: marketPrice.yekdemPriceSource,
      marketPriceWarnings: marketPrice.warnings,
    };
  });
  const totalLateFee = periods.reduce((sum, period) => sum + period.lateFee, 0);
  const totalLateFeeVat = periods.reduce((sum, period) => sum + period.lateFeeVat, 0);
  const lateFeeMonth = scenario.asOfDate.slice(0, 7);
  const monthlyProfit = calculateMonthlyProfit(adjustedPeriods, actualCashflow, 0, {
    [lateFeeMonth]: totalLateFee,
  });
  const actualProfit = periods.reduce((sum, period) => sum + period.actualNetProfit, 0);
  return {
    periods,
    billingPeriods: adjustedPeriods,
    receivableLedger,
    lateFeeDocuments,
    finalLateFeeDocuments: lateFeeDocuments.filter(
      (document) => document.kind === 'final_late_fee_invoice',
    ),
    actualCashflow,
    monthlyProfit,
    plannedProfit: source.totals.netProfit,
    actualProfit,
    variance: actualProfit - source.totals.netProfit,
    totalLateFee,
    totalLateFeeVat,
    endingOpenReceivable: receivableLedger.totalOutstandingPrincipal,
    actualCashEvents,
    marketPriceWarnings: [
      ...new Set(periods.flatMap((period) => period.marketPriceWarnings ?? [])),
    ],
  };
};

export const createRealizationScenario = (
  sourceOffer: RealizationScenario['sourceOfferSnapshot'],
  name = 'Gerçekleşen Durum',
  monthlyMarketPrices: MonthlyMarketPrice[] = [],
  holidays: string[] = [],
): RealizationScenario => {
  const now = new Date().toISOString();
  const base = {
    id: createId('scenario'),
    sourceCustomerId: sourceOffer.customerId,
    sourceOfferId: sourceOffer.id,
    sourceOfferVersion: sourceOffer.version,
    sourceOfferSnapshot: structuredClone(sourceOffer),
    name,
    asOfDate: sourceOffer.stateSnapshot.usageEnd,
    periodOverrides: [],
    actualPayments: [],
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...base,
    resultSnapshot: calculateRealization(base, 5.55, monthlyMarketPrices, holidays),
  };
};

export const newActualPaymentId = (): string => createId('actual_payment');
