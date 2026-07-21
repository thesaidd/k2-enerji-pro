import { format, parseISO } from 'date-fns';
import type { BillingPeriod, DailyCashflowRow, MonthlyProfitRow } from '../../types';

export const calculateMonthlyProfit = (
  periods: BillingPeriod[],
  cashflow: DailyCashflowRow[],
  channelCostTotal: number,
  lateFeesByMonth: Record<string, number> = {},
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
      lateFeeIncome: lateFeesByMonth[month] ?? 0,
      accrualProfit: 0,
      cashInflows: 0,
      cashOutflows: 0,
      cashResult: 0,
    };
    months.set(month, created);
    return created;
  };
  const invoiceTotal = periods.reduce((sum, period) => sum + period.grossInvoice, 0);
  for (const period of periods) {
    const month = period.start.slice(0, 7);
    const row = ensure(month);
    row.consumptionMwh += period.gridConsumptionMwh;
    row.activeEnergySalesRevenue += period.activeEnergySalesAmount;
    row.offerMargin += period.offerMargin;
    row.imbalance += period.imbalanceAmount;
    row.piu += period.piuAmount;
    row.channelCost +=
      invoiceTotal > 0 ? (channelCostTotal * period.grossInvoice) / invoiceTotal : 0;
  }
  for (const day of cashflow) {
    const month = format(parseISO(day.date), 'yyyy-MM');
    const row = ensure(month);
    row.creditInterest += day.creditInterest;
    row.valorIncome += day.valorInterest;
    row.cashInflows += day.customerInflows + day.lateFeeInflows;
    row.cashOutflows += day.supplierOutflows + day.refunds + day.creditInterest;
  }
  for (const row of months.values()) {
    row.accrualProfit =
      row.offerMargin -
      row.imbalance -
      row.piu -
      row.channelCost -
      row.creditInterest +
      row.valorIncome +
      row.lateFeeIncome;
    row.cashResult = row.cashInflows - row.cashOutflows;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
};
