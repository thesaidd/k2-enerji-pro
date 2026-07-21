import { differenceInCalendarDays, parseISO } from 'date-fns';
import { createId } from '../../config/paymentPlans';
import { buildDailyCashflow } from '../financing/financing';
import { allocateActualPayments, calculateInvoiceDelinquency } from '../late-fee/lateFee';
import { calculateMonthlyProfit } from '../profitability/monthlyProfit';
import type {
  BillingPeriod,
  CashEvent,
  PeriodRealizationResult,
  RealizationResult,
  RealizationScenario,
} from '../../types';

const scenarioPeriod = (
  period: BillingPeriod,
  offerRate: number,
  btvRate: number,
  kdvRate: number,
): BillingPeriod => {
  const offerMargin = (period.activeEnergyBaseAmount * offerRate) / 100;
  const activeEnergySalesAmount = period.activeEnergyBaseAmount + offerMargin;
  const btvBase = activeEnergySalesAmount;
  const btvAmount = (btvBase * btvRate) / 100;
  const kdvBase =
    activeEnergySalesAmount + period.distributionAmount + period.contractPowerAmount + btvAmount;
  const kdvAmount = (kdvBase * kdvRate) / 100;
  return {
    ...period,
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
  };
};

export const calculateRealization = (
  scenario: Omit<RealizationScenario, 'resultSnapshot'>,
  monthlyLateFeeRate = 5.55,
): RealizationResult => {
  const source = scenario.sourceOfferSnapshot.resultSnapshot;
  const state = scenario.sourceOfferSnapshot.stateSnapshot;
  const dueByPeriod = new Map<string, string>();
  for (const payment of source.plannedPayments) {
    if (!payment.periodId) continue;
    const current = dueByPeriod.get(payment.periodId);
    if (!current || payment.transactionDate < current)
      dueByPeriod.set(payment.periodId, payment.transactionDate);
  }
  const invoiceList = source.periods.map((period) => ({
    id: period.id,
    dueDate: dueByPeriod.get(period.id) ?? period.invoiceDate,
    amount: period.grossInvoice,
  }));
  const allocation = allocateActualPayments(invoiceList, scenario.actualPayments);
  const actualPaymentEvents: CashEvent[] = scenario.actualPayments.map((payment) => ({
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
  const supplierEvents = source.cashEvents.filter((event) => event.direction === 'out');
  const actualCashflow = buildDailyCashflow(
    [...supplierEvents, ...actualPaymentEvents],
    state.creditRate,
    state.valorRate,
  );
  const actualCreditCost = actualCashflow.reduce((sum, day) => sum + day.creditInterest, 0);
  const actualValorIncome = actualCashflow.reduce((sum, day) => sum + day.valorInterest, 0);
  const plannedPeriodProfitBase = source.periods.reduce(
    (sum, period) => sum + period.offerMargin,
    0,
  );
  const periods: PeriodRealizationResult[] = source.periods.map((period) => {
    const override = scenario.periodOverrides.find((item) => item.periodId === period.id);
    const offerRate = override?.scenarioOfferRate ?? state.offerRate ?? 0;
    const adjusted = scenarioPeriod(period, offerRate, state.btvRate, state.kdvRate);
    const payments = allocation.byInvoice.get(period.id) ?? [];
    const dueDate = dueByPeriod.get(period.id) ?? period.invoiceDate;
    const calculationDate = override?.calculationDate ?? scenario.asOfDate;
    const delinquency = calculateInvoiceDelinquency(
      adjusted,
      dueDate,
      payments,
      calculationDate,
      monthlyLateFeeRate,
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
    const lastPaymentDate = payments.at(-1)?.date ?? calculationDate;
    return {
      periodId: period.id,
      plannedInvoice: period.grossInvoice,
      plannedDueDate: dueDate,
      actualPayments: payments,
      outstandingPrincipal: delinquency.outstandingPrincipal,
      delayDays: Math.max(
        0,
        differenceInCalendarDays(parseISO(lastPaymentDate), parseISO(dueDate)),
      ),
      lateFee: delinquency.lateFee,
      lateFeeVat: delinquency.lateFeeVat,
      actualCreditCost: actualCreditCost * financingShare,
      actualValorIncome: actualValorIncome * financingShare,
      scenarioOfferRate: offerRate,
      plannedNetProfit,
      actualNetProfit,
      variance: actualNetProfit - plannedNetProfit,
      delinquency,
    };
  });
  const totalLateFee = periods.reduce((sum, period) => sum + period.lateFee, 0);
  const totalLateFeeVat = periods.reduce((sum, period) => sum + period.lateFeeVat, 0);
  const adjustedPeriods = source.periods.map((period) => {
    const result = periods.find((item) => item.periodId === period.id)!;
    return scenarioPeriod(period, result.scenarioOfferRate, state.btvRate, state.kdvRate);
  });
  const lateFeeMonth = scenario.asOfDate.slice(0, 7);
  const monthlyProfit = calculateMonthlyProfit(adjustedPeriods, actualCashflow, 0, {
    [lateFeeMonth]: totalLateFee,
  });
  const actualProfit = periods.reduce((sum, period) => sum + period.actualNetProfit, 0);
  return {
    periods,
    actualCashflow,
    monthlyProfit,
    plannedProfit: source.totals.netProfit,
    actualProfit,
    variance: actualProfit - source.totals.netProfit,
    totalLateFee,
    totalLateFeeVat,
    endingOpenReceivable: periods.reduce((sum, period) => sum + period.outstandingPrincipal, 0),
  };
};

export const createRealizationScenario = (
  sourceOffer: RealizationScenario['sourceOfferSnapshot'],
  name = 'Gerçekleşen Durum',
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
  return { ...base, resultSnapshot: calculateRealization(base) };
};

export const newActualPaymentId = (): string => createId('actual_payment');
