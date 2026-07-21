import type {
  ActualPayment,
  BillingPeriod,
  PlannedPayment,
  ReceivableInstallment,
  ReceivableLedger,
  ReceivablePaymentAllocation,
} from '../../types';

const EPSILON = 1e-9;

const compareInstallments = (a: ReceivableInstallment, b: ReceivableInstallment): number =>
  a.dueDate.localeCompare(b.dueDate) || a.periodIndex - b.periodIndex || a.id.localeCompare(b.id);

export const buildReceivableInstallments = (
  periods: BillingPeriod[],
  plannedPayments: PlannedPayment[],
): ReceivableInstallment[] => {
  const installments: ReceivableInstallment[] = [];
  for (const period of periods) {
    const planned = plannedPayments
      .filter((payment) => payment.periodId === period.id && payment.principalAmount > 0)
      .sort(
        (a, b) =>
          a.transactionDate.localeCompare(b.transactionDate) ||
          a.installmentNo - b.installmentNo ||
          a.id.localeCompare(b.id),
      );
    let remainingPrincipal = Math.max(0, period.grossInvoice);
    for (const payment of planned) {
      if (remainingPrincipal <= EPSILON) break;
      const principalAmount = Math.min(remainingPrincipal, payment.principalAmount);
      if (principalAmount <= EPSILON) continue;
      installments.push({
        id: `receivable_${period.id}_${payment.id}`,
        invoiceId: period.id,
        periodId: period.id,
        periodIndex: period.index,
        sourcePlannedPaymentId: payment.id,
        principalAmount,
        dueDate: payment.transactionDate,
        collectedAmount: 0,
        outstandingPrincipal: principalAmount,
        allocations: [],
      });
      remainingPrincipal -= principalAmount;
    }
    if (remainingPrincipal > EPSILON) {
      installments.push({
        id: `receivable_${period.id}_residual`,
        invoiceId: period.id,
        periodId: period.id,
        periodIndex: period.index,
        principalAmount: remainingPrincipal,
        dueDate: planned.at(-1)?.transactionDate ?? period.invoiceDate,
        collectedAmount: 0,
        outstandingPrincipal: remainingPrincipal,
        allocations: [],
      });
    }
  }
  return installments.sort(compareInstallments);
};

export const allocatePaymentsToReceivables = (
  sourceInstallments: ReceivableInstallment[],
  payments: ActualPayment[],
  asOfDate: string,
): ReceivableLedger => {
  const installments: ReceivableInstallment[] = structuredClone(sourceInstallments).map(
    (installment) => ({
      ...installment,
      collectedAmount: 0,
      outstandingPrincipal: installment.principalAmount,
      allocations: [],
    }),
  );
  const allocations: ReceivablePaymentAllocation[] = [];
  let customerAdvance = 0;
  const effectivePayments = payments
    .map((payment, index) => ({ payment, index }))
    .filter(({ payment }) => payment.date <= asOfDate && payment.amount > 0)
    .sort(
      (a, b) =>
        a.payment.date.localeCompare(b.payment.date) ||
        a.index - b.index ||
        a.payment.id.localeCompare(b.payment.id),
    );

  for (const { payment } of effectivePayments) {
    let remaining = payment.amount;
    const candidates = installments
      .filter((installment) => {
        if (installment.outstandingPrincipal <= EPSILON) return false;
        if (payment.receivableInstallmentId)
          return installment.id === payment.receivableInstallmentId;
        if (payment.invoiceId) return installment.invoiceId === payment.invoiceId;
        return installment.dueDate <= payment.date;
      })
      .sort(compareInstallments);

    for (const installment of candidates) {
      if (remaining <= EPSILON) break;
      const amount = Math.min(installment.outstandingPrincipal, remaining);
      const allocation: ReceivablePaymentAllocation = {
        paymentId: payment.id,
        receivableInstallmentId: installment.id,
        invoiceId: installment.invoiceId,
        periodId: installment.periodId,
        date: payment.date,
        amount,
      };
      installment.allocations.push(allocation);
      installment.collectedAmount += amount;
      installment.outstandingPrincipal = Math.max(
        0,
        installment.principalAmount - installment.collectedAmount,
      );
      allocations.push(allocation);
      remaining -= amount;
    }
    if (remaining > EPSILON) customerAdvance += remaining;
  }

  const totalPaymentsAsOf = effectivePayments.reduce((sum, { payment }) => sum + payment.amount, 0);
  const totalCollectedPrincipal = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );
  return {
    asOfDate,
    installments,
    allocations,
    totalPaymentsAsOf,
    totalCollectedPrincipal,
    totalOutstandingPrincipal: installments.reduce(
      (sum, installment) => sum + installment.outstandingPrincipal,
      0,
    ),
    customerAdvance,
  };
};
