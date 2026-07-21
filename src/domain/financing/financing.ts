import { addIsoDays, epiasPaymentDate } from '../calendar/calendar';
import { FINANCING_DAY_BASIS } from '../../config/calculationPolicy';
import { createId } from '../../config/paymentPlans';
import type {
  BillingPeriod,
  CashEvent,
  DailyCashflowRow,
  OfferState,
  PlannedPayment,
} from '../../types';

export const buildSupplierEvents = (
  periods: BillingPeriod[],
  state: OfferState,
  excessProductionPurchase = 0,
  holidays: string[] = [],
): CashEvent[] => {
  const events: CashEvent[] = [];
  for (const period of periods) {
    const dailyPtf = period.days > 0 ? period.ptfAmount / period.days : 0;
    for (let day = 0; day < period.days; day += 1) {
      const deliveryDate = addIsoDays(period.start, day);
      if (dailyPtf !== 0)
        events.push({
          id: createId('cash'),
          date: epiasPaymentDate(deliveryDate, holidays),
          rawDate: deliveryDate,
          type: 'ptf',
          direction: 'out',
          amount: dailyPtf,
          periodId: period.id,
          label: 'EPİAŞ PTF ödemesi',
        });
    }
    const push = (type: CashEvent['type'], label: string, offset: number, amount: number) => {
      if (amount > 0)
        events.push({
          id: createId('cash'),
          date: addIsoDays(period.end, offset),
          type,
          direction: 'out',
          amount,
          periodId: period.id,
          label,
        });
    };
    push('yekdem', 'YEKDEM ödemesi', state.yekdemDueOffset, period.yekdemAmount);
    push('distribution', 'Dağıtım ödemesi', state.distributionDueOffset, period.distributionAmount);
    push(
      'contract_power',
      'Sözleşme gücü ödemesi',
      state.distributionDueOffset,
      period.contractPowerAmount,
    );
    push('kdv', 'KDV ödemesi', state.kdvDueOffset, period.kdvAmount);
    push('btv', 'BTV ödemesi', state.btvDueOffset, period.btvAmount);
  }
  if (excessProductionPurchase > 0 && state.ges.mode === 'advanced_metering') {
    events.push({
      id: createId('cash'),
      date: addIsoDays(state.usageEnd, 10),
      type: 'excess_production_purchase',
      direction: 'out',
      amount: excessProductionPurchase,
      label: 'İhtiyaç fazlası üretim satın alımı',
      note: 'Öz tüketim tasarrufundan ayrı belge',
    });
  }
  return events;
};

export const paymentsToCashEvents = (payments: PlannedPayment[]): CashEvent[] =>
  payments.map((payment) => ({
    id: payment.id,
    date: payment.settlementDate,
    rawDate: payment.transactionDate,
    type: 'customer_payment',
    direction: 'in',
    amount: payment.netCashIn,
    principalAmount: payment.principalAmount,
    channelCost: payment.epsasChannelCost,
    periodId: payment.periodId,
    label: payment.planRowName,
    note: payment.note,
  }));

export const buildDailyCashflow = (
  events: CashEvent[],
  creditRate: number,
  valorRate: number,
): DailyCashflowRow[] => {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]!.date;
  const last = sorted[sorted.length - 1]!.date;
  const grouped = new Map<string, CashEvent[]>();
  for (const event of sorted) grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
  const rows: DailyCashflowRow[] = [];
  let openingBalance = 0;
  for (let date = first; date <= last; date = addIsoDays(date, 1)) {
    const dayEvents = grouped.get(date) ?? [];
    const supplierOutflows = dayEvents
      .filter((event) => event.direction === 'out' && event.type !== 'customer_refund')
      .reduce((sum, event) => sum + event.amount, 0);
    const refunds = dayEvents
      .filter((event) => event.type === 'customer_refund')
      .reduce((sum, event) => sum + event.amount, 0);
    const customerInflows = dayEvents
      .filter((event) => event.direction === 'in' && event.type === 'customer_payment')
      .reduce((sum, event) => sum + event.amount, 0);
    const lateFeeInflows = dayEvents
      .filter((event) => event.type === 'late_fee_payment')
      .reduce((sum, event) => sum + event.amount, 0);
    const paymentChannelCosts = dayEvents.reduce((sum, event) => sum + (event.channelCost ?? 0), 0);
    const balanceAfterOutflows = openingBalance - supplierOutflows - refunds;
    const interestBase = balanceAfterOutflows;
    const creditInterest =
      interestBase < 0 ? Math.abs(interestBase) * (creditRate / 100 / FINANCING_DAY_BASIS) : 0;
    const valorInterest =
      interestBase > 0 ? interestBase * (valorRate / 100 / FINANCING_DAY_BASIS) : 0;
    const closingBalance =
      balanceAfterOutflows - creditInterest + valorInterest + customerInflows + lateFeeInflows;
    rows.push({
      date,
      openingBalance,
      supplierOutflows,
      customerInflows,
      lateFeeInflows,
      refunds,
      paymentChannelCosts,
      balanceAfterOutflows,
      interestBase,
      creditInterest,
      valorInterest,
      closingBalance,
      notes: dayEvents.map((event) => event.label),
    });
    openingBalance = closingBalance;
  }
  return rows;
};
