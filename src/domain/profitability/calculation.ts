import { CALCULATION_POLICY_VERSION } from '../../config/calculationPolicy';
import { DEFAULT_OFFER_STATE } from '../../config/defaults';
import { calculateInvoices } from '../invoice/invoice';
import { calculatePlannedPayments } from '../payment-plan/paymentPlan';
import {
  buildDailyCashflow,
  buildSupplierEvents,
  paymentsToCashEvents,
} from '../financing/financing';
import { calculateMonthlyProfit } from './monthlyProfit';
import {
  calculateReferenceInvoice,
  defaultComparisonSettings,
} from '../comparison/tariffComparison';
import { offerStateSchema } from '../validation/schemas';
import { listContractMonths, resolveForecastMarketPrices } from '../market-prices/marketPrices';
import type {
  CalculationResult,
  CalculationTotals,
  MarketPriceSnapshot,
  MonthlyMarketPrice,
  OfferState,
} from '../../types';

const clone = <T>(value: T): T => structuredClone(value);
const sum = <T>(items: T[], picker: (item: T) => number): number =>
  items.reduce((total, item) => total + picker(item), 0);

export const normalizeOfferState = (input: Partial<OfferState>): OfferState => ({
  ...clone(DEFAULT_OFFER_STATE),
  ...clone(input),
  ges: { ...clone(DEFAULT_OFFER_STATE.ges), ...clone(input.ges ?? {}) },
  paymentPlan: clone(input.paymentPlan ?? DEFAULT_OFFER_STATE.paymentPlan),
});

interface CoreResult {
  state: OfferState;
  periods: CalculationResult['periods'];
  payments: CalculationResult['plannedPayments'];
  cashEvents: CalculationResult['cashEvents'];
  cashflow: CalculationResult['plannedCashflow'];
  warnings: string[];
  totals: Omit<
    CalculationTotals,
    'breakevenOfferRate' | 'breakevenUnitPrice' | 'customerAdvantage'
  >;
}

const calculateCore = (
  state: OfferState,
  holidays: string[] = [],
  marketPrices?: MarketPriceSnapshot[],
): CoreResult => {
  const invoices = calculateInvoices(state, marketPrices);
  const settlement = calculatePlannedPayments(
    invoices.periods,
    state.paymentPlan,
    state.usageStart,
    state.usageEnd,
    holidays,
  );
  const supplierEvents = buildSupplierEvents(
    invoices.periods,
    state,
    invoices.excessProductionPurchase,
    holidays,
  );
  const cashEvents = [...supplierEvents, ...paymentsToCashEvents(settlement.payments)].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
  const cashflow = buildDailyCashflow(cashEvents, state.creditRate, state.valorRate);
  const activeEnergyBaseAmount = sum(invoices.periods, (period) => period.activeEnergyBaseAmount);
  const offerMargin = sum(invoices.periods, (period) => period.offerMargin);
  const imbalanceAmount = sum(invoices.periods, (period) => period.imbalanceAmount);
  const piuAmount = sum(invoices.periods, (period) => period.piuAmount);
  const creditCost = sum(cashflow, (day) => day.creditInterest);
  const valorIncome = sum(cashflow, (day) => day.valorInterest);
  const operationalCost = imbalanceAmount + piuAmount + settlement.totalChannelCost;
  const financingIncludedCost =
    activeEnergyBaseAmount +
    operationalCost +
    creditCost -
    valorIncome +
    invoices.excessProductionPurchase;
  const netProfit =
    offerMargin - operationalCost - creditCost + valorIncome - invoices.excessProductionPurchase;
  const gridConsumptionMwh = sum(invoices.periods, (period) => period.gridConsumptionMwh);
  return {
    state,
    periods: invoices.periods,
    payments: settlement.payments,
    cashEvents,
    cashflow,
    warnings: settlement.warnings,
    totals: {
      grossConsumptionMwh: sum(invoices.periods, (period) => period.grossConsumptionMwh),
      gesSelfConsumptionMwh: sum(invoices.periods, (period) => period.gesSelfConsumptionMwh),
      gridConsumptionMwh,
      ptfAmount: sum(invoices.periods, (period) => period.ptfAmount),
      yekdemAmount: sum(invoices.periods, (period) => period.yekdemAmount),
      activeEnergyBaseAmount,
      offerMargin,
      activeEnergySalesAmount: sum(invoices.periods, (period) => period.activeEnergySalesAmount),
      distributionAmount: sum(invoices.periods, (period) => period.distributionAmount),
      contractPowerAmount: sum(invoices.periods, (period) => period.contractPowerAmount),
      btvAmount: sum(invoices.periods, (period) => period.btvAmount),
      kdvAmount: sum(invoices.periods, (period) => period.kdvAmount),
      grossInvoice: sum(invoices.periods, (period) => period.grossInvoice),
      gesSelfConsumptionSavings: sum(
        invoices.periods,
        (period) => period.gesSelfConsumptionSavings,
      ),
      excessProductionPurchase: invoices.excessProductionPurchase,
      imbalanceAmount,
      piuAmount,
      paymentChannelCost: settlement.totalChannelCost,
      creditCost,
      valorIncome,
      operationalCost,
      financingIncludedCost,
      netProfit,
      netProfitRate: activeEnergyBaseAmount > 0 ? netProfit / activeEnergyBaseAmount : 0,
      profitPerMwh: gridConsumptionMwh > 0 ? netProfit / gridConsumptionMwh : 0,
      unitSupplyCost: gridConsumptionMwh > 0 ? financingIncludedCost / gridConsumptionMwh : 0,
    },
  };
};

const findBreakevenRate = (
  state: OfferState,
  holidays: string[],
  marketPrices?: MarketPriceSnapshot[],
): number => {
  let low = -99;
  let high = 100;
  let lowProfit = calculateCore({ ...clone(state), offerRate: low }, holidays, marketPrices).totals
    .netProfit;
  let highProfit = calculateCore({ ...clone(state), offerRate: high }, holidays, marketPrices)
    .totals.netProfit;
  if (lowProfit >= 0) return low;
  if (highProfit <= 0) return high;
  for (let iteration = 0; iteration < 45; iteration += 1) {
    const middle = (low + high) / 2;
    const profit = calculateCore({ ...clone(state), offerRate: middle }, holidays, marketPrices)
      .totals.netProfit;
    if (profit >= 0) {
      high = middle;
      highProfit = profit;
    } else {
      low = middle;
      lowProfit = profit;
    }
  }
  void lowProfit;
  void highProfit;
  return (low + high) / 2;
};

const invalidResult = (
  state: OfferState,
  errors: string[],
  marketPriceSnapshot: MarketPriceSnapshot[] = [],
): CalculationResult => ({
  valid: false,
  errors,
  warnings: [],
  policyVersion: CALCULATION_POLICY_VERSION,
  calculatedAt: new Date().toISOString(),
  state,
  periods: [],
  plannedPayments: [],
  cashEvents: [],
  plannedCashflow: [],
  monthlyProfit: [],
  marketPriceSnapshot,
  totals: {
    grossConsumptionMwh: 0,
    gesSelfConsumptionMwh: 0,
    gridConsumptionMwh: 0,
    ptfAmount: 0,
    yekdemAmount: 0,
    activeEnergyBaseAmount: 0,
    offerMargin: 0,
    activeEnergySalesAmount: 0,
    distributionAmount: 0,
    contractPowerAmount: 0,
    btvAmount: 0,
    kdvAmount: 0,
    grossInvoice: 0,
    gesSelfConsumptionSavings: 0,
    excessProductionPurchase: 0,
    imbalanceAmount: 0,
    piuAmount: 0,
    paymentChannelCost: 0,
    creditCost: 0,
    valorIncome: 0,
    operationalCost: 0,
    financingIncludedCost: 0,
    netProfit: 0,
    netProfitRate: 0,
    profitPerMwh: 0,
    unitSupplyCost: 0,
    breakevenUnitPrice: 0,
    breakevenOfferRate: 0,
    customerAdvantage: 0,
  },
});

export const calculateOffer = (
  input: Partial<OfferState>,
  holidays: string[] = [],
  monthlyMarketPrices?: MonthlyMarketPrice[],
): CalculationResult => {
  const state = normalizeOfferState(input);
  const parsed = offerStateSchema.safeParse(state);
  if (!parsed.success)
    return invalidResult(
      state,
      parsed.error.issues.map((issue) => issue.message),
    );
  const marketPriceResolution = resolveForecastMarketPrices(
    listContractMonths(state.usageStart, state.usageEnd),
    monthlyMarketPrices,
    state.ptfTlMwh,
    state.yekdemTlMwh,
  );
  if (marketPriceResolution.errors.length > 0)
    return invalidResult(state, marketPriceResolution.errors, marketPriceResolution.values);
  const core = calculateCore(state, holidays, marketPriceResolution.values);
  const breakevenOfferRate = findBreakevenRate(state, holidays, marketPriceResolution.values);
  const breakevenUnitPrice =
    core.totals.gridConsumptionMwh > 0
      ? (core.totals.activeEnergyBaseAmount / core.totals.gridConsumptionMwh) *
        (1 + breakevenOfferRate / 100)
      : 0;
  const partial: CalculationResult = {
    valid: true,
    errors: [],
    warnings: core.warnings,
    policyVersion: CALCULATION_POLICY_VERSION,
    calculatedAt: new Date().toISOString(),
    state: clone(state),
    periods: core.periods,
    plannedPayments: core.payments,
    cashEvents: core.cashEvents,
    plannedCashflow: core.cashflow,
    monthlyProfit: calculateMonthlyProfit(
      core.periods,
      core.cashflow,
      core.totals.paymentChannelCost,
    ),
    marketPriceSnapshot: clone(marketPriceResolution.values),
    totals: { ...core.totals, breakevenOfferRate, breakevenUnitPrice, customerAdvantage: 0 },
  };
  const referenceInvoice = calculateReferenceInvoice(
    state,
    partial,
    defaultComparisonSettings(state),
  );
  partial.totals.customerAdvantage =
    referenceInvoice - partial.totals.grossInvoice + partial.totals.gesSelfConsumptionSavings;
  return partial;
};

export const sensitivitySeries = (
  state: OfferState,
  holidays: string[] = [],
  min = -5,
  max = 20,
  step = 1,
  monthlyMarketPrices?: MonthlyMarketPrice[],
) => {
  const series: Array<{
    offerRate: number;
    netProfit: number;
    customerInvoice: number;
    customerAdvantage: number;
  }> = [];
  const marketPriceResolution = resolveForecastMarketPrices(
    listContractMonths(state.usageStart, state.usageEnd),
    monthlyMarketPrices,
    state.ptfTlMwh,
    state.yekdemTlMwh,
  );
  if (marketPriceResolution.errors.length > 0) return series;
  for (let rate = min; rate <= max + 1e-9; rate += step) {
    const core = calculateCore(
      { ...clone(state), offerRate: rate },
      holidays,
      marketPriceResolution.values,
    );
    const customerAdvantage = core.totals.gesSelfConsumptionSavings - core.totals.offerMargin;
    series.push({
      offerRate: rate,
      netProfit: core.totals.netProfit,
      customerInvoice: core.totals.grossInvoice,
      customerAdvantage,
    });
  }
  return series;
};
