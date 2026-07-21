import type {
  ActualPaymentFinancials,
  BillingPeriod,
  DailyCashflowRow,
  PlannedPayment,
  ProfitComponent,
  ProfitLedgerEntry,
  ReceivableLedger,
} from '../../types';

export const FINANCING_ALLOCATION_METHOD =
  'Dönem brüt fatura payı; toplam sıfırsa dönem payı; kalan son döneme';

const sum = <T>(items: T[], value: (item: T) => number): number =>
  items.reduce((total, item) => total + value(item), 0);

const makeEntry = (
  id: string,
  component: ProfitComponent,
  economicMonth: string,
  amount: number,
  direction: ProfitLedgerEntry['direction'],
  periodId?: string,
  sourceId?: string,
  note?: string,
): ProfitLedgerEntry => {
  const normalizedDirection =
    amount >= 0 ? direction : direction === 'income' ? 'cost' : 'income';
  return {
    id,
    component,
    economicMonth,
    amount: Math.abs(amount),
    direction: normalizedDirection,
    periodId,
    sourceId,
    note,
  };
};

export const profitLedgerImpact = (entry: ProfitLedgerEntry): number =>
  entry.direction === 'income' ? entry.amount : -entry.amount;

export const sumProfitLedger = (entries: ProfitLedgerEntry[]): number =>
  sum(entries, profitLedgerImpact);

const allocationWeights = (periods: BillingPeriod[]): number[] => {
  const invoiceTotal = sum(periods, (period) => Math.max(0, period.grossInvoice));
  if (invoiceTotal > 0) return periods.map((period) => Math.max(0, period.grossInvoice));
  const shareTotal = sum(periods, (period) => Math.max(0, period.share));
  if (shareTotal > 0) return periods.map((period) => Math.max(0, period.share));
  return periods.map(() => 1);
};

export const allocateAmountToPeriods = (
  total: number,
  periods: BillingPeriod[],
): Array<{ period: BillingPeriod; amount: number }> => {
  if (periods.length === 0) return [];
  const weights = allocationWeights(periods);
  const weightTotal = sum(weights, (weight) => weight);
  let allocated = 0;
  return periods.map((period, index) => {
    const amount =
      index === periods.length - 1 ? total - allocated : (total * weights[index]!) / weightTotal;
    allocated += amount;
    return { period, amount };
  });
};

const basePeriodEntries = (periods: BillingPeriod[]): ProfitLedgerEntry[] =>
  periods.flatMap((period) => {
    const month = period.start.slice(0, 7);
    return [
      makeEntry(
        `profit_offer_margin_${period.id}`,
        'offer_margin',
        month,
        period.offerMargin,
        'income',
        period.id,
      ),
      makeEntry(
        `profit_imbalance_${period.id}`,
        'imbalance',
        month,
        period.imbalanceAmount,
        'cost',
        period.id,
      ),
      makeEntry(
        `profit_piu_${period.id}`,
        'piu',
        month,
        period.piuAmount,
        'cost',
        period.id,
      ),
      makeEntry(
        `profit_excess_${period.id}`,
        'excess_production_purchase',
        month,
        period.excessPurchaseAmount ?? 0,
        'cost',
        period.id,
      ),
    ];
  });

const financingEntries = (
  periods: BillingPeriod[],
  cashflow: DailyCashflowRow[],
): ProfitLedgerEntry[] => {
  const credit = sum(cashflow, (day) => day.creditInterest);
  const valor = sum(cashflow, (day) => day.valorInterest);
  return [
    ...allocateAmountToPeriods(credit, periods).map(({ period, amount }) =>
      makeEntry(
        `profit_credit_${period.id}`,
        'credit_interest',
        period.start.slice(0, 7),
        amount,
        'cost',
        period.id,
        undefined,
        FINANCING_ALLOCATION_METHOD,
      ),
    ),
    ...allocateAmountToPeriods(valor, periods).map(({ period, amount }) =>
      makeEntry(
        `profit_valor_${period.id}`,
        'valor_income',
        period.start.slice(0, 7),
        amount,
        'income',
        period.id,
        undefined,
        FINANCING_ALLOCATION_METHOD,
      ),
    ),
  ];
};

export const buildPlannedProfitLedger = (
  periods: BillingPeriod[],
  payments: PlannedPayment[],
  cashflow: DailyCashflowRow[],
): ProfitLedgerEntry[] => {
  const entries = [...basePeriodEntries(periods), ...financingEntries(periods, cashflow)];
  for (const payment of payments) {
    const period = periods.find((candidate) => candidate.id === payment.periodId);
    if (period)
      entries.push(
        makeEntry(
          `profit_channel_${payment.id}_${period.id}`,
          'payment_channel_cost',
          period.start.slice(0, 7),
          payment.epsasChannelCost,
          'cost',
          period.id,
          payment.id,
        ),
      );
    else
      entries.push(
        ...allocateAmountToPeriods(payment.epsasChannelCost, periods).map(
          ({ period: fallbackPeriod, amount }) =>
            makeEntry(
              `profit_channel_${payment.id}_${fallbackPeriod.id}`,
              'payment_channel_cost',
              fallbackPeriod.start.slice(0, 7),
              amount,
              'cost',
              fallbackPeriod.id,
              payment.id,
              'Atanmamış kanal maliyeti dönem brüt fatura payıyla dağıtıldı.',
            ),
        ),
      );
  }
  return entries;
};

export const buildRealizationProfitLedger = (
  periods: BillingPeriod[],
  cashflow: DailyCashflowRow[],
  receivableLedger: ReceivableLedger,
  paymentFinancials: ActualPaymentFinancials[],
  lateFeesByPeriod: Record<string, number>,
): ProfitLedgerEntry[] => {
  const entries = [...basePeriodEntries(periods), ...financingEntries(periods, cashflow)];
  for (const financials of paymentFinancials) {
    const allocations = receivableLedger.allocations.filter(
      (allocation) => allocation.paymentId === financials.paymentId,
    );
    const allocatedPrincipal = sum(allocations, (allocation) => allocation.amount);
    const allocatedCost =
      financials.principalAmount > 0
        ? financials.epsasChannelCost *
          Math.min(1, allocatedPrincipal / financials.principalAmount)
        : 0;
    let assignedCost = 0;
    allocations.forEach((allocation, index) => {
      const period = periods.find((candidate) => candidate.id === allocation.periodId);
      if (!period) return;
      const amount =
        index === allocations.length - 1
          ? allocatedCost - assignedCost
          : allocatedPrincipal > 0
            ? (allocatedCost * allocation.amount) / allocatedPrincipal
            : 0;
      assignedCost += amount;
      entries.push(
        makeEntry(
          `profit_actual_channel_${financials.paymentId}_${allocation.receivableInstallmentId}`,
          'payment_channel_cost',
          period.start.slice(0, 7),
          amount,
          'cost',
          period.id,
          financials.paymentId,
          'Gerçek tahsilat ledger anapara tahsis oranı.',
        ),
      );
    });
    const unassignedCost = financials.epsasChannelCost - assignedCost;
    if (Math.abs(unassignedCost) > 0)
      entries.push(
        ...allocateAmountToPeriods(unassignedCost, periods).map(({ period, amount }) =>
          makeEntry(
            `profit_actual_channel_unassigned_${financials.paymentId}_${period.id}`,
            'payment_channel_cost',
            period.start.slice(0, 7),
            amount,
            'cost',
            period.id,
            financials.paymentId,
            'Avans/atanmamış kanal maliyeti dönem brüt fatura payıyla dağıtıldı.',
          ),
        ),
      );
  }
  for (const period of periods)
    entries.push(
      makeEntry(
        `profit_late_fee_${period.id}`,
        'late_fee_income',
        period.start.slice(0, 7),
        lateFeesByPeriod[period.id] ?? 0,
        'income',
        period.id,
        period.id,
        'Gecikme bedeli kaynak faturanın tüketim ayına yazıldı; KDV kâr dışıdır.',
      ),
    );
  return entries;
};

export const periodProfitComponents = (
  entries: ProfitLedgerEntry[],
  periodId: string,
): Record<ProfitComponent, number> => {
  const components = {
    offer_margin: 0,
    imbalance: 0,
    piu: 0,
    payment_channel_cost: 0,
    credit_interest: 0,
    valor_income: 0,
    excess_production_purchase: 0,
    late_fee_income: 0,
  } satisfies Record<ProfitComponent, number>;
  for (const entry of entries.filter((candidate) => candidate.periodId === periodId)) {
    const impact = profitLedgerImpact(entry);
    const incomeComponent = ['offer_margin', 'valor_income', 'late_fee_income'].includes(
      entry.component,
    );
    components[entry.component] += incomeComponent ? impact : -impact;
  }
  return components;
};

export const cashflowNetEffect = (cashflow: DailyCashflowRow[]): number =>
  sum(
    cashflow,
    (day) =>
      day.customerInflows +
      day.lateFeeInflows -
      day.supplierOutflows -
      day.refunds -
      day.creditInterest +
      day.valorInterest,
  );
