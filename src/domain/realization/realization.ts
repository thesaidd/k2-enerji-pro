import { createId } from '../../config/paymentPlans';
import { buildDailyCashflow, buildSupplierEvents } from '../financing/financing';
import { resolveGesExcessPurchasePrice } from '../ges/ges';
import {
  accrueMonthlyLateFeeDocuments,
  buildRealizationInvoiceSummaries,
} from '../late-fee/accrual';
import { calculateLedgerInvoiceDelinquency } from '../late-fee/lateFee';
import { resolveRealizationMarketPrice } from '../market-prices/marketPrices';
import {
  calculateActualPaymentFinancials,
  resolveActualPaymentCommissionDefaults,
} from '../payment-plan/actualPaymentFinancials';
import { calculateMonthlyProfit } from '../profitability/monthlyProfit';
import {
  buildPlannedProfitLedger,
  buildRealizationProfitLedger,
  cashflowNetEffect,
  periodProfitComponents,
  sumProfitLedger,
} from '../profitability/profitLedger';
import { allocatePaymentsToReceivables, buildReceivableInstallments } from '../receivables/ledger';
import type {
  ActualPayment,
  BillingPeriod,
  CashEvent,
  InvoiceDelinquency,
  MarketPriceSnapshot,
  MonthlyMarketPrice,
  PeriodRealizationResult,
  RealizationResult,
  RealizationScenario,
} from '../../types';

const sum = <T>(items: T[], value: (item: T) => number): number =>
  items.reduce((total, item) => total + value(item), 0);

const scenarioPeriod = (
  period: BillingPeriod,
  offerRate: number,
  btvRate: number,
  kdvRate: number,
  imbalanceRate: number,
  piuRate: number,
  marketPrice: MarketPriceSnapshot,
  ges: RealizationScenario['sourceOfferSnapshot']['stateSnapshot']['ges'],
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
  const excessPurchasePrice = resolveGesExcessPurchasePrice(
    ges,
    marketPrice.ptfUnitPrice,
    marketPrice.yekdemUnitPrice,
  );
  const excessPurchaseAmount = (period.excessProductionMwh ?? 0) * excessPurchasePrice;
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
    excessPurchasePrice,
    excessPurchaseAmount,
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
      state.ges,
    );
  });
  const sourceInstallments = buildReceivableInstallments(adjustedPeriods, source.plannedPayments);
  const receivableLedger = allocatePaymentsToReceivables(
    sourceInstallments,
    scenario.actualPayments,
    scenario.asOfDate,
  );
  const effectivePayments = scenario.actualPayments.filter(
    (payment) => payment.date <= scenario.asOfDate && payment.amount > 0,
  );
  const actualPaymentFinancials = effectivePayments.map((payment) =>
    calculateActualPaymentFinancials(
      payment,
      resolveActualPaymentCommissionDefaults(
        payment.receivableInstallmentId,
        sourceInstallments,
        source.plannedPayments,
      ),
    ),
  );
  const financialsByPayment = new Map(
    actualPaymentFinancials.map((financials) => [financials.paymentId, financials]),
  );
  const actualPaymentEvents: CashEvent[] = effectivePayments.map((payment) => {
    const financials = financialsByPayment.get(payment.id)!;
    return {
      id: payment.id,
      date: payment.date,
      type: 'customer_payment',
      direction: 'in',
      amount: financials.netCashIn,
      principalAmount: financials.principalAmount,
      channelCost: financials.epsasChannelCost,
      periodId: payment.invoiceId,
      label: 'Gerçek müşteri tahsilatı',
      note: payment.note,
    };
  });
  const actualExcessProductionPurchase = sum(
    adjustedPeriods,
    (period) => period.excessPurchaseAmount ?? 0,
  );
  const supplierEvents = buildSupplierEvents(
    adjustedPeriods,
    state,
    actualExcessProductionPurchase,
    holidays,
  ).filter((event) => event.date <= scenario.asOfDate);
  const actualCashEvents = [...supplierEvents, ...actualPaymentEvents].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const effectiveCreditRate = scenario.financingOverrides?.creditRate ?? state.creditRate;
  const effectiveValorRate = scenario.financingOverrides?.valorRate ?? state.valorRate;
  const financingStartDate = [
    scenario.asOfDate,
    ...(state.usageStart <= scenario.asOfDate ? [state.usageStart] : []),
    ...actualCashEvents.map((event) => event.date),
  ].sort()[0]!;
  const actualCashflow = buildDailyCashflow(
    actualCashEvents,
    effectiveCreditRate,
    effectiveValorRate,
    {
      calculationStartDate: financingStartDate,
      calculationEndDate: scenario.asOfDate,
    },
  );
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
  const delinquencyByPeriod = new Map<string, InvoiceDelinquency>(
    adjustedPeriods.map((period) => [
      period.id,
      calculateLedgerInvoiceDelinquency(
        period,
        receivableLedger,
        scenario.asOfDate,
        monthlyLateFeeRate,
      ),
    ]),
  );
  const profitLedger = buildRealizationProfitLedger(
    adjustedPeriods,
    actualCashflow,
    receivableLedger,
    actualPaymentFinancials,
    Object.fromEntries(
      [...delinquencyByPeriod].map(([periodId, delinquency]) => [periodId, delinquency.lateFee]),
    ),
  );
  const plannedProfitLedger =
    source.profitLedger ??
    buildPlannedProfitLedger(source.periods, source.plannedPayments, source.plannedCashflow);
  const paymentsById = new Map(scenario.actualPayments.map((payment) => [payment.id, payment]));
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
    const receivableInstallments = receivableLedger.installments.filter(
      (installment) => installment.invoiceId === period.id,
    );
    const delinquency = delinquencyByPeriod.get(period.id)!;
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
    const actualComponents = periodProfitComponents(profitLedger, period.id);
    const plannedNetProfit = sumProfitLedger(
      plannedProfitLedger.filter((entry) => entry.periodId === period.id),
    );
    const actualNetProfit = sumProfitLedger(
      profitLedger.filter((entry) => entry.periodId === period.id),
    );
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
      actualOfferMargin: actualComponents.offer_margin,
      actualImbalance: actualComponents.imbalance,
      actualPiu: actualComponents.piu,
      actualPaymentChannelCost: actualComponents.payment_channel_cost,
      actualCreditCost: actualComponents.credit_interest,
      actualValorIncome: actualComponents.valor_income,
      actualExcessProductionPurchase: actualComponents.excess_production_purchase,
      lateFeeIncome: actualComponents.late_fee_income,
      scenarioOfferRate: override?.scenarioOfferRate ?? state.offerRate ?? 0,
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
  const totalLateFee = sum(periods, (period) => period.lateFee);
  const totalLateFeeVat = sum(periods, (period) => period.lateFeeVat);
  const actualPaymentChannelCost = sum(
    actualPaymentFinancials,
    (financials) => financials.epsasChannelCost,
  );
  const actualCreditCost = sum(actualCashflow, (day) => day.creditInterest);
  const actualValorIncome = sum(actualCashflow, (day) => day.valorInterest);
  const monthlyProfit = calculateMonthlyProfit(adjustedPeriods, actualCashflow, profitLedger);
  const actualProfit = sumProfitLedger(profitLedger);
  const endingCashBalance = actualCashflow.at(-1)?.closingBalance ?? 0;
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
    profitLedger,
    plannedProfit: source.totals.netProfit,
    actualProfit,
    variance: actualProfit - source.totals.netProfit,
    totalLateFee,
    totalLateFeeVat,
    endingOpenReceivable: receivableLedger.totalOutstandingPrincipal,
    actualPaymentFinancials,
    actualPaymentChannelCost,
    actualExcessProductionPurchase,
    actualCreditCost,
    actualValorIncome,
    effectiveCreditRate,
    effectiveValorRate,
    financingStartDate,
    financingEndDate: scenario.asOfDate,
    endingCashBalance,
    openFinancingBalance: Math.max(0, -endingCashBalance),
    profitReconciliationDifference: sum(monthlyProfit, (row) => row.accrualProfit) - actualProfit,
    cashReconciliationDifference:
      sum(monthlyProfit, (row) => row.cashResult) - cashflowNetEffect(actualCashflow),
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
