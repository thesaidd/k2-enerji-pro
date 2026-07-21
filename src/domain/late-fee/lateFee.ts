import { differenceInCalendarDays, parseISO } from 'date-fns';
import { LATE_FEE_DAY_BASIS } from '../../config/calculationPolicy';
import type { ActualPayment, BillingPeriod, InvoiceDelinquency, LateFeeSegment } from '../../types';

export interface PaymentAllocation {
  paymentId: string;
  invoiceId?: string;
  date: string;
  amount: number;
  appliedPrincipal: number;
  advance: number;
}

export const calculateLateFee = (
  principal: number,
  delayDays: number,
  monthlyRate: number,
): number =>
  (Math.max(0, principal) * Math.max(0, delayDays) * (monthlyRate / 100) * 12) / LATE_FEE_DAY_BASIS;

export const calculateInvoiceOutstandingPrincipal = (
  invoiceAmount: number,
  payments: Pick<ActualPayment, 'amount'>[],
): number =>
  Math.max(
    0,
    invoiceAmount - payments.reduce((sum, payment) => sum + Math.max(0, payment.amount), 0),
  );

export const calculateLateFeeSegments = (
  invoiceAmount: number,
  dueDate: string,
  payments: ActualPayment[],
  calculationDate: string,
  monthlyRate: number,
): LateFeeSegment[] => {
  const paidOnOrBeforeDue = payments
    .filter((payment) => payment.date <= dueDate)
    .reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
  const relevant = [...payments]
    .filter(
      (payment) => payment.date > dueDate && payment.date <= calculationDate && payment.amount > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const segments: LateFeeSegment[] = [];
  let principal = Math.max(0, invoiceAmount - paidOnOrBeforeDue);
  let cursor = dueDate;
  for (const payment of relevant) {
    if (principal <= 0) break;
    const days = Math.max(0, differenceInCalendarDays(parseISO(payment.date), parseISO(cursor)));
    if (days > 0)
      segments.push({
        startDate: cursor,
        endDate: payment.date,
        days,
        principal,
        lateFee: calculateLateFee(principal, days, monthlyRate),
      });
    principal = Math.max(0, principal - payment.amount);
    cursor = payment.date;
  }
  if (principal > 0 && calculationDate > cursor) {
    const days = Math.max(0, differenceInCalendarDays(parseISO(calculationDate), parseISO(cursor)));
    if (days > 0)
      segments.push({
        startDate: cursor,
        endDate: calculationDate,
        days,
        principal,
        lateFee: calculateLateFee(principal, days, monthlyRate),
      });
  }
  return segments;
};

export const calculateInvoiceDelinquency = (
  invoice: Pick<BillingPeriod, 'id' | 'grossInvoice' | 'kdvAmount' | 'kdvBase'>,
  dueDate: string,
  payments: ActualPayment[],
  calculationDate: string,
  monthlyRate: number,
): InvoiceDelinquency => {
  const segments = calculateLateFeeSegments(
    invoice.grossInvoice,
    dueDate,
    payments,
    calculationDate,
    monthlyRate,
  );
  const outstandingPrincipal = calculateInvoiceOutstandingPrincipal(invoice.grossInvoice, payments);
  const lateFee = segments.reduce((sum, segment) => sum + segment.lateFee, 0);
  const vatRate = invoice.kdvBase > 0 ? invoice.kdvAmount / invoice.kdvBase : 0;
  const lateFeeVat = lateFee * vatRate;
  return {
    invoiceId: invoice.id,
    outstandingPrincipal,
    delayDays: segments.reduce((sum, segment) => sum + segment.days, 0),
    segments,
    lateFee,
    lateFeeVat,
    totalLateFeeReceivable: lateFee + lateFeeVat,
  };
};

export const allocateActualPayments = (
  invoices: Array<{ id: string; dueDate: string; amount: number }>,
  payments: ActualPayment[],
): {
  allocations: PaymentAllocation[];
  byInvoice: Map<string, ActualPayment[]>;
  customerAdvance: number;
} => {
  const balances = new Map(invoices.map((invoice) => [invoice.id, invoice.amount]));
  const byInvoice = new Map<string, ActualPayment[]>();
  const allocations: PaymentAllocation[] = [];
  let customerAdvance = 0;
  for (const payment of [...payments].sort((a, b) => a.date.localeCompare(b.date))) {
    let remaining = payment.amount;
    const candidates = payment.invoiceId
      ? invoices.filter((invoice) => invoice.id === payment.invoiceId)
      : [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (const invoice of candidates) {
      if (remaining <= 0) break;
      const open = balances.get(invoice.id) ?? 0;
      if (open <= 0) continue;
      const applied = Math.min(open, remaining);
      balances.set(invoice.id, open - applied);
      remaining -= applied;
      const allocatedPayment: ActualPayment = {
        ...payment,
        invoiceId: invoice.id,
        amount: applied,
      };
      byInvoice.set(invoice.id, [...(byInvoice.get(invoice.id) ?? []), allocatedPayment]);
      allocations.push({
        paymentId: payment.id,
        invoiceId: invoice.id,
        date: payment.date,
        amount: payment.amount,
        appliedPrincipal: applied,
        advance: 0,
      });
    }
    if (remaining > 0) {
      customerAdvance += remaining;
      allocations.push({
        paymentId: payment.id,
        date: payment.date,
        amount: payment.amount,
        appliedPrincipal: 0,
        advance: remaining,
      });
    }
  }
  return { allocations, byInvoice, customerAdvance };
};
