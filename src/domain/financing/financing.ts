import { addIsoDays, adjustToBusinessDay, epiasPaymentDate } from '../calendar/calendar';
import { FINANCING_DAY_BASIS } from '../../config/calculationPolicy';
import { createId } from '../../config/paymentPlans';
import type {
  BillingPeriod,
  CashEvent,
  DailyCashflowOptions,
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
  let hasPeriodExcessEvent = false;
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
    if ((period.excessPurchaseAmount ?? 0) > 0 && state.ges.mode === 'advanced_metering') {
      hasPeriodExcessEvent = true;
      events.push({
        id: createId('cash'),
        date: adjustToBusinessDay(
          addIsoDays(period.end, state.ges.excessPurchasePaymentOffsetDays ?? 10),
          holidays,
        ),
        type: 'excess_production_purchase',
        direction: 'out',
        amount: period.excessPurchaseAmount!,
        periodId: period.id,
        label: 'İhtiyaç fazlası üretim satın alımı',
        note: 'Öz tüketim tasarrufundan ayrı belge',
      });
    }
  }
  if (
    !hasPeriodExcessEvent &&
    excessProductionPurchase > 0 &&
    state.ges.mode === 'advanced_metering'
  ) {
    events.push({
      id: createId('cash'),
      date: adjustToBusinessDay(
        addIsoDays(state.usageEnd, state.ges.excessPurchasePaymentOffsetDays ?? 10),
        holidays,
      ),
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
  options: DailyCashflowOptions = {},
): DailyCashflowRow[] => {
  const validDate = (date: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  for (const date of [
    ...events.map((event) => event.date),
    options.calculationStartDate,
    options.calculationEndDate,
  ].filter((date): date is string => date != null))
    if (!validDate(date)) throw new Error(`Geçersiz finansman tarihi: ${date}`);

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const firstEventDate = sorted[0]?.date;
  const lastEventDate = sorted.at(-1)?.date;
  if (!firstEventDate && (!options.calculationStartDate || !options.calculationEndDate)) return [];
  const first = options.calculationStartDate ?? firstEventDate!;
  const last = options.calculationEndDate ?? lastEventDate!;
  if (firstEventDate && first > firstEventDate)
    throw new Error('Hesaplama başlangıcı ilk nakit olayından sonra olamaz.');
  if (lastEventDate && last < lastEventDate)
    throw new Error('Hesaplama bitişi son nakit olayından önce olamaz.');
  if (last < first) throw new Error('Finansman hesaplama bitişi başlangıçtan önce olamaz.');
  const grouped = new Map<string, CashEvent[]>();
  for (const event of sorted) grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
  const rows: DailyCashflowRow[] = [];
  let openingBalance = 0;
  let date = first;
  for (let iteration = 0; date <= last; iteration += 1) {
    if (iteration > 366_000) throw new Error('Finansman ufku güvenli iterasyon sınırını aştı.');
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
    const nextDate = addIsoDays(date, 1);
    if (nextDate <= date) throw new Error('Finansman tarihi ilerletilemedi.');
    date = nextDate;
  }
  return rows;
};
