import { addIsoDays } from '../calendar/calendar';
import { allocatePaymentsToReceivables, buildReceivableInstallments } from '../receivables/ledger';
import { marketPriceSourceLabel } from '../market-prices/marketPrices';
import type {
  ActualPayment,
  BillingPeriod,
  CashEvent,
  DailyCashflowRow,
  MarketPriceSnapshot,
  PaymentCalendarModel,
  PaymentCalendarRow,
  PlannedOffer,
  RealizationScenario,
  ReceivableInstallment,
  ReceivableLedger,
} from '../../types';

const DAY_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

const sum = <T>(items: T[], picker: (item: T) => number): number =>
  items.reduce((total, item) => total + picker(item), 0);

const byType = (events: CashEvent[], type: CashEvent['type']): number =>
  sum(
    events.filter((event) => event.type === type),
    (event) => event.amount,
  );

const snapshotSummary = (
  snapshot: MarketPriceSnapshot[] | undefined,
  context: 'planned' | 'realization' = 'planned',
): string =>
  snapshot && snapshot.length > 0
    ? snapshot
        .map(
          (price) =>
            `${price.month}: PTF ${marketPriceSourceLabel(price.ptfPriceSource, context)}, YEKDEM ${marketPriceSourceLabel(price.yekdemPriceSource, context)}`,
        )
        .join(' | ')
    : 'legacy';

const plannedLedger = (
  offer: PlannedOffer,
): {
  ledger: ReceivableLedger;
  payments: ActualPayment[];
} => {
  const installments = buildReceivableInstallments(
    offer.resultSnapshot.periods,
    offer.resultSnapshot.plannedPayments,
  );
  const payments: ActualPayment[] = offer.resultSnapshot.plannedPayments.map((payment) => ({
    id: payment.id,
    invoiceId: payment.periodId,
    receivableInstallmentId: installments.find(
      (installment) => installment.sourcePlannedPaymentId === payment.id,
    )?.id,
    date: payment.transactionDate,
    amount: payment.principalAmount,
    channel: payment.paymentChannel,
    note: payment.planRowName,
  }));
  const asOfDate = [offer.stateSnapshot.usageEnd, ...payments.map((payment) => payment.date)]
    .sort()
    .at(-1)!;
  return {
    ledger: allocatePaymentsToReceivables(installments, payments, asOfDate),
    payments,
  };
};

const fallbackActualCashEvents = (scenario: RealizationScenario): CashEvent[] => [
  ...scenario.sourceOfferSnapshot.resultSnapshot.cashEvents.filter(
    (event) => event.direction === 'out',
  ),
  ...scenario.actualPayments
    .filter((payment) => payment.date <= scenario.asOfDate && payment.amount > 0)
    .map<CashEvent>((payment) => ({
      id: payment.id,
      date: payment.date,
      type: 'customer_payment',
      direction: 'in',
      amount: payment.amount,
      principalAmount: payment.amount,
      periodId: payment.invoiceId,
      label: 'Gerçek müşteri tahsilatı',
      note: payment.note,
    })),
];

const receivableBalances = (
  date: string,
  installments: ReceivableInstallment[],
  ledger: ReceivableLedger,
  payments: ActualPayment[],
): { customerAdvance: number; openReceivable: number } => {
  let customerAdvance = 0;
  let openReceivable = 0;
  for (const installment of installments) {
    const allocated = sum(
      installment.allocations.filter((allocation) => allocation.date <= date),
      (allocation) => allocation.amount,
    );
    if (date < installment.dueDate) customerAdvance += allocated;
    else openReceivable += Math.max(0, installment.principalAmount - allocated);
  }
  for (const payment of payments.filter((item) => item.date <= date)) {
    const allocated = sum(
      ledger.allocations.filter(
        (allocation) => allocation.paymentId === payment.id && allocation.date <= date,
      ),
      (allocation) => allocation.amount,
    );
    customerAdvance += Math.max(0, payment.amount - allocated);
  }
  return { customerAdvance, openReceivable };
};

interface CalendarSource {
  sourceType: PaymentCalendarModel['sourceType'];
  sourceId: string;
  sourceTitle: string;
  customerId: string;
  customerName: string;
  sourceVersion: number;
  calculationDate: string;
  policyVersion: string;
  priceSourceSummary: string;
  usageStart: string;
  usageEnd: string;
  periods: BillingPeriod[];
  cashEvents: CashEvent[];
  cashflow: DailyCashflowRow[];
  ledger: ReceivableLedger;
  payments: ActualPayment[];
  paymentDescriptions: Map<string, string[]>;
  annotations: Map<string, string[]>;
}

const buildModel = (source: CalendarSource): PaymentCalendarModel => {
  const eventsByDate = new Map<string, CashEvent[]>();
  for (const event of source.cashEvents)
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  const cashflowByDate = new Map(source.cashflow.map((row) => [row.date, row]));
  const consumptionByDate = new Map<string, number>();
  for (const period of source.periods) {
    const dailyConsumption = period.days > 0 ? period.grossConsumptionMwh / period.days : 0;
    for (let day = 0; day < period.days; day += 1) {
      const date = addIsoDays(period.start, day);
      consumptionByDate.set(date, (consumptionByDate.get(date) ?? 0) + dailyConsumption);
    }
  }
  const dates = [
    source.usageStart,
    source.usageEnd,
    source.calculationDate.slice(0, 10),
    ...source.cashEvents.map((event) => event.date),
    ...source.cashflow.map((row) => row.date),
    ...source.ledger.installments.map((installment) => installment.dueDate),
    ...source.payments.map((payment) => payment.date),
    ...source.annotations.keys(),
  ].filter(Boolean);
  const firstDate = [...dates].sort()[0]!;
  const lastDate = [...dates].sort().at(-1)!;
  const rows: PaymentCalendarRow[] = [];
  let carriedBalance = 0;
  for (let date = firstDate; date <= lastDate; date = addIsoDays(date, 1)) {
    const events = eventsByDate.get(date) ?? [];
    const cashflow = cashflowByDate.get(date);
    const openingBalance = cashflow?.openingBalance ?? carriedBalance;
    const balanceAfterOutflows = cashflow?.balanceAfterOutflows ?? openingBalance;
    const closingBalance = cashflow?.closingBalance ?? openingBalance;
    const balances = receivableBalances(
      date,
      source.ledger.installments,
      source.ledger,
      source.payments,
    );
    rows.push({
      date,
      dayLabel: DAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()]!,
      consumptionMwh: consumptionByDate.get(date) ?? 0,
      ptfOutflow: byType(events, 'ptf'),
      yekdemOutflow: byType(events, 'yekdem'),
      distributionOutflow: byType(events, 'distribution'),
      contractPowerOutflow: byType(events, 'contract_power'),
      btvOutflow: byType(events, 'btv'),
      kdvOutflow: byType(events, 'kdv'),
      excessProductionOutflow: byType(events, 'excess_production_purchase'),
      customerGrossPrincipal: sum(
        events.filter((event) => event.type === 'customer_payment'),
        (event) => event.principalAmount ?? event.amount,
      ),
      customerNetCashIn: cashflow?.customerInflows ?? 0,
      lateFeeCashIn: cashflow?.lateFeeInflows ?? 0,
      customerRefund: cashflow?.refunds ?? 0,
      paymentChannelCost: cashflow?.paymentChannelCosts ?? 0,
      customerAdvance: balances.customerAdvance,
      openReceivable: balances.openReceivable,
      paymentDescription: (source.paymentDescriptions.get(date) ?? []).join(' | '),
      openingBalance,
      balanceAfterOutflows,
      interestBase: cashflow?.interestBase ?? balanceAfterOutflows,
      valorInterest: cashflow?.valorInterest ?? 0,
      creditInterest: cashflow?.creditInterest ?? 0,
      closingBalance,
      notes: [
        ...(cashflow?.notes ?? events.map((event) => event.label)),
        ...(source.annotations.get(date) ?? []),
      ],
    });
    carriedBalance = closingBalance;
  }
  const last = rows.at(-1);
  const summary = {
    totalCustomerCashIn: sum(rows, (row) => row.customerNetCashIn),
    totalLateFeeCashIn: sum(rows, (row) => row.lateFeeCashIn),
    totalCashOutflow: sum(
      rows,
      (row) =>
        row.ptfOutflow +
        row.yekdemOutflow +
        row.distributionOutflow +
        row.contractPowerOutflow +
        row.btvOutflow +
        row.kdvOutflow +
        row.excessProductionOutflow +
        row.customerRefund,
    ),
    totalPaymentChannelCost: sum(rows, (row) => row.paymentChannelCost),
    totalCreditCost: sum(rows, (row) => row.creditInterest),
    totalValorIncome: sum(rows, (row) => row.valorInterest),
    minimumBalance: rows.length > 0 ? Math.min(...rows.map((row) => row.closingBalance)) : 0,
    maximumBalance: rows.length > 0 ? Math.max(...rows.map((row) => row.closingBalance)) : 0,
    endingBalance: last?.closingBalance ?? 0,
    openReceivable: last?.openReceivable ?? 0,
    customerAdvance: last?.customerAdvance ?? 0,
  };
  return { ...source, rows, summary };
};

export const buildPlannedPaymentCalendar = (
  offer: PlannedOffer,
  customerName: string,
): PaymentCalendarModel => {
  const { ledger, payments } = plannedLedger(offer);
  const paymentDescriptions = new Map<string, string[]>();
  for (const payment of offer.resultSnapshot.plannedPayments)
    paymentDescriptions.set(payment.settlementDate, [
      ...(paymentDescriptions.get(payment.settlementDate) ?? []),
      `${payment.planRowName} · ${payment.paymentChannel}`,
    ]);
  return buildModel({
    sourceType: 'planned_offer',
    sourceId: offer.id,
    sourceTitle: offer.title,
    customerId: offer.customerId,
    customerName,
    sourceVersion: offer.version,
    calculationDate: offer.resultSnapshot.calculatedAt,
    policyVersion: offer.resultSnapshot.policyVersion,
    priceSourceSummary: snapshotSummary(offer.resultSnapshot.marketPriceSnapshot),
    usageStart: offer.stateSnapshot.usageStart,
    usageEnd: offer.stateSnapshot.usageEnd,
    periods: offer.resultSnapshot.periods,
    cashEvents: offer.resultSnapshot.cashEvents,
    cashflow: offer.resultSnapshot.plannedCashflow,
    ledger,
    payments,
    paymentDescriptions,
    annotations: new Map(),
  });
};

export const buildRealizationPaymentCalendar = (
  scenario: RealizationScenario,
  customerName: string,
): PaymentCalendarModel => {
  const result = scenario.resultSnapshot;
  const effectivePayments = scenario.actualPayments.filter(
    (payment) => payment.date <= scenario.asOfDate && payment.amount > 0,
  );
  const paymentDescriptions = new Map<string, string[]>();
  for (const payment of effectivePayments)
    paymentDescriptions.set(payment.date, [
      ...(paymentDescriptions.get(payment.date) ?? []),
      `Gerçek tahsilat · ${payment.channel}${payment.note ? ` · ${payment.note}` : ''}`,
    ]);
  const priceSnapshot = result.periods.map((period) => ({
    month: period.marketPriceMonth ?? '',
    ptfUnitPrice: period.ptfUnitPrice ?? 0,
    yekdemUnitPrice: period.yekdemUnitPrice ?? 0,
    ptfPriceSource: period.ptfPriceSource ?? 'legacy',
    yekdemPriceSource: period.yekdemPriceSource ?? 'legacy',
  }));
  const annotations = new Map<string, string[]>();
  for (const document of result.lateFeeDocuments)
    annotations.set(document.issueDate, [
      ...(annotations.get(document.issueDate) ?? []),
      `${document.title}: ${document.totalAmount.toFixed(2)} TL${
        document.carryToPeriodId ? ` · ${document.carryToPeriodId} dönemine aktarıldı` : ''
      }`,
    ]);
  return buildModel({
    sourceType: 'realization_scenario',
    sourceId: scenario.id,
    sourceTitle: scenario.name,
    customerId: scenario.sourceCustomerId,
    customerName,
    sourceVersion: scenario.sourceOfferVersion,
    calculationDate: scenario.asOfDate,
    policyVersion: scenario.sourceOfferSnapshot.resultSnapshot.policyVersion,
    priceSourceSummary: snapshotSummary(priceSnapshot, 'realization'),
    usageStart: scenario.sourceOfferSnapshot.stateSnapshot.usageStart,
    usageEnd: scenario.sourceOfferSnapshot.stateSnapshot.usageEnd,
    periods: result.billingPeriods ?? scenario.sourceOfferSnapshot.resultSnapshot.periods,
    cashEvents: result.actualCashEvents ?? fallbackActualCashEvents(scenario),
    cashflow: result.actualCashflow,
    ledger: result.receivableLedger,
    payments: effectivePayments,
    paymentDescriptions,
    annotations,
  });
};

export interface PaymentCalendarFilters {
  startDate?: string;
  endDate?: string;
  movementsOnly?: boolean;
}

export const filterPaymentCalendarRows = (
  rows: PaymentCalendarRow[],
  filters: PaymentCalendarFilters,
): PaymentCalendarRow[] =>
  rows.filter((row) => {
    if (filters.startDate && row.date < filters.startDate) return false;
    if (filters.endDate && row.date > filters.endDate) return false;
    if (!filters.movementsOnly) return true;
    return (
      row.ptfOutflow !== 0 ||
      row.yekdemOutflow !== 0 ||
      row.distributionOutflow !== 0 ||
      row.contractPowerOutflow !== 0 ||
      row.btvOutflow !== 0 ||
      row.kdvOutflow !== 0 ||
      row.excessProductionOutflow !== 0 ||
      row.customerNetCashIn !== 0 ||
      row.lateFeeCashIn !== 0 ||
      row.customerRefund !== 0 ||
      row.paymentChannelCost !== 0
    );
  });

export const PAYMENT_CALENDAR_HEADERS = [
  'Tarih',
  'Gün',
  'Günlük tüketim MWh',
  'PTF çıkışı',
  'YEKDEM çıkışı',
  'Dağıtım çıkışı',
  'Sözleşme gücü çıkışı',
  'BTV çıkışı',
  'KDV çıkışı',
  'GES ihtiyaç fazlası',
  'Müşteri brüt anapara',
  'Müşteri net nakit girişi',
  'Gecikme tahsilatı',
  'Müşteri iadesi',
  'Ödeme kanalı maliyeti',
  'Avans bakiyesi',
  'Açık alacak bakiyesi',
  'Ödeme kanalı / plan satırı',
  'Açılış bakiyesi',
  'Çıkışlar sonrası bakiye',
  'Faiz bazı',
  'Valör getirisi',
  'Kredi maliyeti',
  'Kapanış bakiyesi',
  'Not',
] as const;

export const paymentCalendarToRows = (model: PaymentCalendarModel): unknown[][] => [
  ['K2 EnerjiPro 3.0 Ödeme / Kullanım Takvimi'],
  ['Müşteri', model.customerName],
  ['Kaynak türü', model.sourceType],
  ['Kaynak', model.sourceTitle],
  ['Sürüm', model.sourceVersion],
  ['Hesaplama tarihi', model.calculationDate],
  ['Politika', model.policyVersion],
  ['Fiyat veri kaynağı', model.priceSourceSummary],
  [],
  [...PAYMENT_CALENDAR_HEADERS],
  ...model.rows.map((row) => [
    row.date,
    row.dayLabel,
    row.consumptionMwh,
    row.ptfOutflow,
    row.yekdemOutflow,
    row.distributionOutflow,
    row.contractPowerOutflow,
    row.btvOutflow,
    row.kdvOutflow,
    row.excessProductionOutflow,
    row.customerGrossPrincipal,
    row.customerNetCashIn,
    row.lateFeeCashIn,
    row.customerRefund,
    row.paymentChannelCost,
    row.customerAdvance,
    row.openReceivable,
    row.paymentDescription,
    row.openingBalance,
    row.balanceAfterOutflows,
    row.interestBase,
    row.valorInterest,
    row.creditInterest,
    row.closingBalance,
    row.notes.join(' | '),
  ]),
];

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export const paymentCalendarToExcelHtml = (model: PaymentCalendarModel): string =>
  `<html><head><meta charset="utf-8"></head><body><table>${paymentCalendarToRows(model)
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')}</table></body></html>`;

export const paymentCalendarUrl = (
  sourceType: PaymentCalendarModel['sourceType'],
  sourceId: string,
): string => `/payment-calendar?source=${sourceType}&id=${encodeURIComponent(sourceId)}`;
