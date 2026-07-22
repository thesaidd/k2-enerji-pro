import { differenceInCalendarDays, parseISO } from 'date-fns';
import { LATE_FEE_DAY_BASIS } from '../../config/calculationPolicy';
import { allocatePaymentsToReceivables } from '../receivables/ledger';
import type {
  ActualPayment,
  BillingPeriod,
  InvoiceDelinquency,
  LateFeeSegment,
  ReceivableInstallment,
  ReceivableInstallmentDelinquency,
  ReceivableLedger,
} from '../../types';

export interface PaymentAllocation {
  paymentId: string;
  invoiceId?: string;
  receivableInstallmentId?: string;
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
  payments: Array<Pick<ActualPayment, 'amount' | 'date'>>,
  calculationDate?: string,
): number =>
  Math.max(
    0,
    invoiceAmount -
      payments
        .filter((payment) => !calculationDate || payment.date <= calculationDate)
        .reduce((sum, payment) => sum + Math.max(0, payment.amount), 0),
  );

export const calculateLateFeeSegments = (
  invoiceAmount: number,
  dueDate: string,
  payments: ActualPayment[],
  calculationDate: string,
  monthlyRate: number,
  receivableInstallmentId?: string,
): LateFeeSegment[] => {
  const effectivePayments = payments.filter(
    (payment) => payment.date <= calculationDate && payment.amount > 0,
  );
  const paidOnOrBeforeDue = effectivePayments
    .filter((payment) => payment.date <= dueDate)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const relevant = [...effectivePayments]
    .filter((payment) => payment.date > dueDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const segments: LateFeeSegment[] = [];
  let principal = Math.max(0, invoiceAmount - paidOnOrBeforeDue);
  let cursor = dueDate;
  for (const payment of relevant) {
    if (principal <= 0) break;
    const days = Math.max(0, differenceInCalendarDays(parseISO(payment.date), parseISO(cursor)));
    if (days > 0)
      segments.push({
        receivableInstallmentId,
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
        receivableInstallmentId,
        startDate: cursor,
        endDate: calculationDate,
        days,
        principal,
        lateFee: calculateLateFee(principal, days, monthlyRate),
      });
  }
  return segments;
};

export const calculateReceivableInstallmentDelinquency = (
  installment: ReceivableInstallment,
  calculationDate: string,
  monthlyRate: number,
  sourceVatRate: number,
): ReceivableInstallmentDelinquency => {
  const payments: ActualPayment[] = installment.allocations.map((allocation) => ({
    id: allocation.paymentId,
    invoiceId: allocation.invoiceId,
    receivableInstallmentId: allocation.receivableInstallmentId,
    date: allocation.date,
    amount: allocation.amount,
    channel: 'other' as const,
  })).concat(
    (installment.advanceApplications ?? []).map((application) => ({
      id: application.id,
      invoiceId: application.targetInvoiceId,
      receivableInstallmentId: installment.id,
      date: application.applicationDate,
      amount: application.amount,
      channel: 'other' as const,
      note: 'Müşteri avansı faturaya uygulandı; nakit olayı değildir.',
    })),
  );
  const effectivePayments = payments.filter((payment) => payment.date <= calculationDate);
  const segments = calculateLateFeeSegments(
    installment.principalAmount,
    installment.dueDate,
    effectivePayments,
    calculationDate,
    monthlyRate,
    installment.id,
  );
  const collectedAmount = Math.min(
    installment.principalAmount,
    effectivePayments.reduce((sum, payment) => sum + payment.amount, 0),
  );
  const outstandingPrincipal = Math.max(0, installment.principalAmount - collectedAmount);
  const lateFee = segments.reduce((sum, segment) => sum + segment.lateFee, 0);
  const lateFeeVat = lateFee * sourceVatRate;
  return {
    receivableInstallmentId: installment.id,
    invoiceId: installment.invoiceId,
    dueDate: installment.dueDate,
    principalAmount: installment.principalAmount,
    collectedAmount,
    outstandingPrincipal,
    delayDays: segments.reduce((sum, segment) => sum + segment.days, 0),
    segments,
    lateFee,
    sourceVatRate,
    lateFeeVat,
    totalLateFeeReceivable: lateFee + lateFeeVat,
  };
};

export const calculateLedgerInvoiceDelinquency = (
  invoice: Pick<BillingPeriod, 'id' | 'kdvAmount' | 'kdvBase'>,
  ledger: ReceivableLedger,
  calculationDate: string,
  monthlyRate: number,
): InvoiceDelinquency => {
  const sourceVatRate = invoice.kdvBase > 0 ? invoice.kdvAmount / invoice.kdvBase : 0;
  const installments = ledger.installments
    .filter((installment) => installment.invoiceId === invoice.id)
    .map((installment) =>
      calculateReceivableInstallmentDelinquency(
        installment,
        calculationDate,
        monthlyRate,
        sourceVatRate,
      ),
    );
  const segments = installments
    .flatMap((installment) => installment.segments)
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        (a.receivableInstallmentId ?? '').localeCompare(b.receivableInstallmentId ?? ''),
    );
  const lateFee = installments.reduce((sum, installment) => sum + installment.lateFee, 0);
  const lateFeeVat = installments.reduce((sum, installment) => sum + installment.lateFeeVat, 0);
  return {
    invoiceId: invoice.id,
    outstandingPrincipal: installments.reduce(
      (sum, installment) => sum + installment.outstandingPrincipal,
      0,
    ),
    delayDays: Math.max(0, ...installments.map((installment) => installment.delayDays)),
    segments,
    installments,
    lateFee,
    lateFeeVat,
    totalLateFeeReceivable: lateFee + lateFeeVat,
  };
};

export const calculateInvoiceDelinquency = (
  invoice: Pick<BillingPeriod, 'id' | 'grossInvoice' | 'kdvAmount' | 'kdvBase'>,
  dueDate: string,
  payments: ActualPayment[],
  calculationDate: string,
  monthlyRate: number,
): InvoiceDelinquency => {
  const effectivePayments = payments.filter(
    (payment) => payment.date <= calculationDate && payment.amount > 0,
  );
  const sourceVatRate = invoice.kdvBase > 0 ? invoice.kdvAmount / invoice.kdvBase : 0;
  const installment: ReceivableInstallment = {
    id: `receivable_${invoice.id}`,
    invoiceId: invoice.id,
    periodId: invoice.id,
    periodIndex: 1,
    principalAmount: invoice.grossInvoice,
    dueDate,
    collectedAmount: effectivePayments.reduce((sum, payment) => sum + payment.amount, 0),
    outstandingPrincipal: calculateInvoiceOutstandingPrincipal(
      invoice.grossInvoice,
      effectivePayments,
      calculationDate,
    ),
    allocations: effectivePayments.map((payment) => ({
      paymentId: payment.id,
      receivableInstallmentId: `receivable_${invoice.id}`,
      invoiceId: invoice.id,
      periodId: invoice.id,
      date: payment.date,
      amount: payment.amount,
    })),
  };
  const installmentResult = calculateReceivableInstallmentDelinquency(
    installment,
    calculationDate,
    monthlyRate,
    sourceVatRate,
  );
  return {
    invoiceId: invoice.id,
    outstandingPrincipal: installmentResult.outstandingPrincipal,
    delayDays: installmentResult.delayDays,
    segments: installmentResult.segments,
    installments: [installmentResult],
    lateFee: installmentResult.lateFee,
    lateFeeVat: installmentResult.lateFeeVat,
    totalLateFeeReceivable: installmentResult.totalLateFeeReceivable,
  };
};

export const allocateActualPayments = (
  invoices: Array<{ id: string; dueDate: string; amount: number }>,
  payments: ActualPayment[],
  asOfDate = payments.reduce(
    (latest, payment) => (payment.date > latest ? payment.date : latest),
    '',
  ),
): {
  allocations: PaymentAllocation[];
  byInvoice: Map<string, ActualPayment[]>;
  customerAdvance: number;
} => {
  const installments: ReceivableInstallment[] = invoices.map((invoice, index) => ({
    id: `receivable_${invoice.id}`,
    invoiceId: invoice.id,
    periodId: invoice.id,
    periodIndex: index + 1,
    principalAmount: invoice.amount,
    dueDate: invoice.dueDate,
    collectedAmount: 0,
    outstandingPrincipal: invoice.amount,
    allocations: [],
  }));
  const ledger = allocatePaymentsToReceivables(installments, payments, asOfDate);
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  const byInvoice = new Map<string, ActualPayment[]>();
  const allocations: PaymentAllocation[] = ledger.allocations.map((allocation) => {
    const source = paymentsById.get(allocation.paymentId)!;
    byInvoice.set(allocation.invoiceId, [
      ...(byInvoice.get(allocation.invoiceId) ?? []),
      {
        ...source,
        invoiceId: allocation.invoiceId,
        receivableInstallmentId: allocation.receivableInstallmentId,
        amount: allocation.amount,
      },
    ]);
    return {
      paymentId: allocation.paymentId,
      invoiceId: allocation.invoiceId,
      receivableInstallmentId: allocation.receivableInstallmentId,
      date: allocation.date,
      amount: source.amount,
      appliedPrincipal: allocation.amount,
      advance: 0,
    };
  });
  const appliedByPayment = new Map<string, number>();
  for (const allocation of ledger.allocations)
    appliedByPayment.set(
      allocation.paymentId,
      (appliedByPayment.get(allocation.paymentId) ?? 0) + allocation.amount,
    );
  for (const payment of payments.filter((item) => item.date <= asOfDate && item.amount > 0)) {
    const advance = Math.max(0, payment.amount - (appliedByPayment.get(payment.id) ?? 0));
    if (advance > 0)
      allocations.push({
        paymentId: payment.id,
        date: payment.date,
        amount: payment.amount,
        appliedPrincipal: 0,
        advance,
      });
  }
  return { allocations, byInvoice, customerAdvance: ledger.customerAdvance };
};
