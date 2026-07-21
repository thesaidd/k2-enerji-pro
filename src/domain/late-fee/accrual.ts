import { addMonths, endOfMonth, format, parseISO } from 'date-fns';
import { calculateLateFee } from './lateFee';
import type { ActualPayment, BillingPeriod } from '../../types';

export interface LateFeeDocument {
  id: string;
  sourceInvoiceId: string;
  issueDate: string;
  carryToPeriodId?: string;
  kind: 'monthly_carryover' | 'final_late_fee_invoice';
  lineItems: Array<{ label: string; amount: number; taxableAgain: false; createsLateFee: false }>;
  lateFee: number;
  lateFeeVat: number;
}

export const accrueMonthlyLateFeeDocuments = (
  periods: BillingPeriod[],
  payments: ActualPayment[],
  asOfDate: string,
  monthlyRate: number,
): LateFeeDocument[] => {
  const documents: LateFeeDocument[] = [];
  for (const period of periods) {
    const invoicePayments = payments
      .filter((payment) => payment.invoiceId === period.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    let principal = period.grossInvoice;
    let cursor = period.invoiceDate;
    while (cursor < asOfDate && principal > 0) {
      const monthEnd = format(endOfMonth(parseISO(cursor)), 'yyyy-MM-dd');
      const segmentEnd = monthEnd < asOfDate ? monthEnd : asOfDate;
      const paid = invoicePayments
        .filter((payment) => payment.date > cursor && payment.date <= segmentEnd)
        .reduce((sum, payment) => sum + payment.amount, 0);
      const days = Math.max(
        0,
        Math.round((parseISO(segmentEnd).getTime() - parseISO(cursor).getTime()) / 86_400_000),
      );
      const lateFee = calculateLateFee(principal, days, monthlyRate);
      const vatRate = period.kdvBase > 0 ? period.kdvAmount / period.kdvBase : 0;
      if (lateFee > 0) {
        const next = periods.find((candidate) => candidate.index === period.index + 1);
        const lateFeeVat = lateFee * vatRate;
        documents.push({
          id: `late_fee_${period.id}_${segmentEnd}`,
          sourceInvoiceId: period.id,
          issueDate: segmentEnd,
          carryToPeriodId: next?.id,
          kind: next ? 'monthly_carryover' : 'final_late_fee_invoice',
          lineItems: [
            {
              label: 'Önceki Dönem Gecikme Bedeli',
              amount: lateFee,
              taxableAgain: false,
              createsLateFee: false,
            },
            {
              label: 'Önceki Dönem Gecikme Bedeli KDV’si',
              amount: lateFeeVat,
              taxableAgain: false,
              createsLateFee: false,
            },
          ],
          lateFee,
          lateFeeVat,
        });
      }
      principal = Math.max(0, principal - paid);
      cursor = format(
        addMonths(parseISO(segmentEnd), segmentEnd === monthEnd ? 0 : 1),
        'yyyy-MM-dd',
      );
      if (segmentEnd === asOfDate) break;
      cursor = format(
        parseISO(segmentEnd).getTime() === endOfMonth(parseISO(segmentEnd)).getTime()
          ? new Date(parseISO(segmentEnd).getTime() + 86_400_000)
          : parseISO(segmentEnd),
        'yyyy-MM-dd',
      );
    }
  }
  return documents;
};
