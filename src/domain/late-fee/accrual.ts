import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO } from 'date-fns';
import { calculateLateFee, calculateReceivableInstallmentDelinquency } from './lateFee';
import type {
  BillingPeriod,
  InvoiceCarryoverLine,
  LateFeeAccrualDocument,
  RealizationInvoiceSummary,
  ReceivableInstallment,
  ReceivableLedger,
} from '../../types';

export interface LateFeeAccrualContext {
  sourceCustomerId: string;
  sourceOfferId: string;
  sourceScenarioId: string;
}

interface AccrualBucket {
  installment: ReceivableInstallment;
  sourcePeriod: BillingPeriod;
  issueDate: string;
  calculationStartDate: string;
  calculationEndDate: string;
  lateFee: number;
}

const toIsoDate = (date: Date): string => format(date, 'yyyy-MM-dd');

const nextInvoicePeriod = (
  periods: BillingPeriod[],
  sourcePeriod: BillingPeriod,
  installment: ReceivableInstallment,
  issueDate: string,
): BillingPeriod | undefined =>
  [...periods]
    .filter(
      (candidate) =>
        (candidate.index > sourcePeriod.index && candidate.invoiceDate >= issueDate) ||
        (candidate.id === sourcePeriod.id &&
          installment.dueDate < sourcePeriod.invoiceDate &&
          issueDate <= sourcePeriod.invoiceDate),
    )
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.index - b.index)[0];

const lineItems = (
  documentId: string,
  lateFee: number,
  lateFeeVat: number,
): InvoiceCarryoverLine[] => [
  {
    id: `${documentId}_late_fee`,
    kind: 'late_fee',
    label: 'Önceki Dönem Gecikme Bedeli',
    amount: lateFee,
    sourceDocumentIds: [documentId],
    taxableAgain: false,
    createsLateFee: false,
    includedInBtvBase: false,
    includedInKdvBase: false,
  },
  {
    id: `${documentId}_late_fee_vat`,
    kind: 'late_fee_vat',
    label: 'Önceki Dönem Gecikme Bedeli KDV’si',
    amount: lateFeeVat,
    sourceDocumentIds: [documentId],
    taxableAgain: false,
    createsLateFee: false,
    includedInBtvBase: false,
    includedInKdvBase: false,
  },
];

export const accrueMonthlyLateFeeDocuments = (
  periods: BillingPeriod[],
  ledger: ReceivableLedger,
  asOfDate: string,
  monthlyRate: number,
  context: LateFeeAccrualContext,
): LateFeeAccrualDocument[] => {
  const buckets = new Map<string, AccrualBucket>();
  for (const installment of ledger.installments) {
    const sourcePeriod = periods.find((period) => period.id === installment.invoiceId);
    if (!sourcePeriod) continue;
    const sourceVatRate =
      sourcePeriod.kdvBase > 0 ? sourcePeriod.kdvAmount / sourcePeriod.kdvBase : 0;
    const delinquency = calculateReceivableInstallmentDelinquency(
      installment,
      asOfDate,
      monthlyRate,
      sourceVatRate,
    );
    for (const segment of delinquency.segments) {
      let cursorDay = toIsoDate(addDays(parseISO(segment.startDate), 1));
      let iterations = 0;
      while (cursorDay <= segment.endDate) {
        iterations += 1;
        if (iterations > 2400)
          throw new Error('Gecikme tahakkuk dönemi güvenli iterasyon sınırını aştı.');
        const calendarMonthEnd = toIsoDate(endOfMonth(parseISO(cursorDay)));
        const calculationEndDate =
          calendarMonthEnd < segment.endDate ? calendarMonthEnd : segment.endDate;
        const days =
          differenceInCalendarDays(parseISO(calculationEndDate), parseISO(cursorDay)) + 1;
        const issueDate = calendarMonthEnd < asOfDate ? calendarMonthEnd : asOfDate;
        const key = `${installment.id}_${issueDate}`;
        const current = buckets.get(key);
        const lateFee = calculateLateFee(segment.principal, days, monthlyRate);
        if (current) {
          current.calculationStartDate =
            cursorDay < current.calculationStartDate ? cursorDay : current.calculationStartDate;
          current.calculationEndDate =
            calculationEndDate > current.calculationEndDate
              ? calculationEndDate
              : current.calculationEndDate;
          current.lateFee += lateFee;
        } else {
          buckets.set(key, {
            installment,
            sourcePeriod,
            issueDate,
            calculationStartDate: cursorDay,
            calculationEndDate,
            lateFee,
          });
        }
        const nextCursor = toIsoDate(addDays(parseISO(calculationEndDate), 1));
        if (nextCursor <= cursorDay)
          throw new Error('Gecikme tahakkuk tarihinde monoton ilerleme sağlanamadı.');
        cursorDay = nextCursor;
      }
    }
  }

  return [...buckets.values()]
    .map<LateFeeAccrualDocument>((bucket) => {
      const sourceVatRate =
        bucket.sourcePeriod.kdvBase > 0
          ? bucket.sourcePeriod.kdvAmount / bucket.sourcePeriod.kdvBase
          : 0;
      const carryTo = nextInvoicePeriod(
        periods,
        bucket.sourcePeriod,
        bucket.installment,
        bucket.issueDate,
      );
      const kind = carryTo ? 'monthly_carryover' : 'final_late_fee_invoice';
      const id = `late_fee_${bucket.installment.id}_${bucket.issueDate}`;
      const collectedAtIssue = bucket.installment.allocations
        .filter((allocation) => allocation.date <= bucket.issueDate)
        .reduce((sum, allocation) => sum + allocation.amount, 0) +
        (bucket.installment.advanceApplications ?? [])
          .filter((application) => application.applicationDate <= bucket.issueDate)
          .reduce((sum, application) => sum + application.amount, 0);
      const openPrincipal = Math.max(0, bucket.installment.principalAmount - collectedAtIssue);
      const lateFeeVat = bucket.lateFee * sourceVatRate;
      return {
        id,
        title: carryTo ? 'Gecikme Bedeli Tahakkuku' : 'Nihai Gecikme Bedeli Faturası',
        kind,
        sourceCustomerId: context.sourceCustomerId,
        sourceOfferId: context.sourceOfferId,
        sourceScenarioId: context.sourceScenarioId,
        sourceInvoiceId: bucket.sourcePeriod.id,
        sourceReceivableInstallmentId: bucket.installment.id,
        carryToPeriodId: carryTo?.id,
        issueDate: bucket.issueDate,
        calculationStartDate: bucket.calculationStartDate,
        calculationEndDate: bucket.calculationEndDate,
        openPrincipal,
        sourceVatRate,
        lineItems: lineItems(id, bucket.lateFee, lateFeeVat),
        lateFee: bucket.lateFee,
        lateFeeVat,
        totalAmount: bucket.lateFee + lateFeeVat,
      };
    })
    .sort(
      (a, b) =>
        a.issueDate.localeCompare(b.issueDate) ||
        a.sourceReceivableInstallmentId.localeCompare(b.sourceReceivableInstallmentId),
    );
};

export const buildRealizationInvoiceSummaries = (
  periods: BillingPeriod[],
  documents: LateFeeAccrualDocument[],
): RealizationInvoiceSummary[] =>
  periods.map((period) => {
    const sources = documents.filter(
      (document) => document.kind === 'monthly_carryover' && document.carryToPeriodId === period.id,
    );
    const lateFee = sources.reduce((sum, document) => sum + document.lateFee, 0);
    const lateFeeVat = sources.reduce((sum, document) => sum + document.lateFeeVat, 0);
    const sourceDocumentIds = sources.map((document) => document.id);
    const carryoverLines: InvoiceCarryoverLine[] = [];
    if (lateFee > 0)
      carryoverLines.push({
        id: `carry_${period.id}_late_fee`,
        kind: 'late_fee',
        label: 'Önceki Dönem Gecikme Bedeli',
        amount: lateFee,
        sourceDocumentIds,
        taxableAgain: false,
        createsLateFee: false,
        includedInBtvBase: false,
        includedInKdvBase: false,
      });
    if (lateFeeVat > 0)
      carryoverLines.push({
        id: `carry_${period.id}_late_fee_vat`,
        kind: 'late_fee_vat',
        label: 'Önceki Dönem Gecikme Bedeli KDV’si',
        amount: lateFeeVat,
        sourceDocumentIds,
        taxableAgain: false,
        createsLateFee: false,
        includedInBtvBase: false,
        includedInKdvBase: false,
      });
    const carryoverTotal = lateFee + lateFeeVat;
    return {
      periodId: period.id,
      activeEnergyInvoiceTotal: period.grossInvoice,
      btvBase: period.btvBase,
      btvAmount: period.btvAmount,
      kdvBase: period.kdvBase,
      kdvAmount: period.kdvAmount,
      carryoverLines,
      carryoverTotal,
      totalPayable: period.grossInvoice + carryoverTotal,
    };
  });
