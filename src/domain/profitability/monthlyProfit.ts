import { FINANCING_ALLOCATION_METHOD, profitLedgerImpact } from './profitLedger';
import type {
  BillingPeriod,
  DailyCashflowRow,
  MonthlyProfitRow,
  ProfitLedgerEntry,
} from '../../types';

export const calculateMonthlyProfit = (
  periods: BillingPeriod[],
  cashflow: DailyCashflowRow[],
  profitLedger: ProfitLedgerEntry[],
): MonthlyProfitRow[] => {
  const months = new Map<string, MonthlyProfitRow>();
  const ensure = (month: string): MonthlyProfitRow => {
    const current = months.get(month);
    if (current) return current;
    const created: MonthlyProfitRow = {
      month,
      consumptionMwh: 0,
      activeEnergySalesRevenue: 0,
      offerMargin: 0,
      imbalance: 0,
      piu: 0,
      channelCost: 0,
      creditInterest: 0,
      valorIncome: 0,
      lateFeeIncome: 0,
      excessProductionPurchase: 0,
      accrualProfit: 0,
      cashInflows: 0,
      cashOutflows: 0,
      supplierOutflows: 0,
      refunds: 0,
      lateFeeCashInflows: 0,
      cashCreditInterest: 0,
      cashValorIncome: 0,
      cashResult: 0,
      financingAllocationMethod: FINANCING_ALLOCATION_METHOD,
      reconciliationDifference: 0,
    };
    months.set(month, created);
    return created;
  };
  for (const period of periods) {
    const row = ensure(period.start.slice(0, 7));
    row.consumptionMwh += period.gridConsumptionMwh;
    row.activeEnergySalesRevenue += period.activeEnergySalesAmount;
  }
  for (const entry of profitLedger) {
    const row = ensure(entry.economicMonth);
    if (entry.component === 'offer_margin') row.offerMargin += entry.amount;
    else if (entry.component === 'imbalance') row.imbalance += entry.amount;
    else if (entry.component === 'piu') row.piu += entry.amount;
    else if (entry.component === 'payment_channel_cost') row.channelCost += entry.amount;
    else if (entry.component === 'credit_interest') row.creditInterest += entry.amount;
    else if (entry.component === 'valor_income') row.valorIncome += entry.amount;
    else if (entry.component === 'late_fee_income') row.lateFeeIncome += entry.amount;
    else if (entry.component === 'excess_production_purchase')
      row.excessProductionPurchase += entry.amount;
    row.accrualProfit += profitLedgerImpact(entry);
  }
  for (const day of cashflow) {
    const row = ensure(day.date.slice(0, 7));
    row.cashInflows += day.customerInflows + day.lateFeeInflows;
    row.lateFeeCashInflows += day.lateFeeInflows;
    row.supplierOutflows += day.supplierOutflows;
    row.refunds += day.refunds;
    row.cashCreditInterest += day.creditInterest;
    row.cashValorIncome += day.valorInterest;
    row.cashOutflows += day.supplierOutflows + day.refunds + day.creditInterest;
    row.cashResult +=
      day.customerInflows +
      day.lateFeeInflows -
      day.supplierOutflows -
      day.refunds -
      day.creditInterest +
      day.valorInterest;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
};
