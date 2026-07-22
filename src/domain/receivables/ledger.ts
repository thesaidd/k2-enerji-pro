import type {
  ActualPayment,
  AdvanceApplication,
  BillingPeriod,
  CustomerAdvanceLot,
  PlannedPayment,
  ReconciliationInstruction,
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
  reconciliationInstructions: ReconciliationInstruction[] = [],
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
        invoiceDate: period.invoiceDate,
        sourcePlannedPaymentId: payment.id,
        principalAmount,
        dueDate: payment.transactionDate,
        collectedAmount: 0,
        advanceAppliedAmount: 0,
        outstandingPrincipal: principalAmount,
        allocations: [],
        advanceApplications: [],
      });
      remainingPrincipal -= principalAmount;
    }
    if (remainingPrincipal > EPSILON) {
      installments.push({
        id: `receivable_${period.id}_residual`,
        invoiceId: period.id,
        periodId: period.id,
        periodIndex: period.index,
        invoiceDate: period.invoiceDate,
        principalAmount: remainingPrincipal,
        dueDate: planned.at(-1)?.transactionDate ?? period.invoiceDate,
        collectedAmount: 0,
        advanceAppliedAmount: 0,
        outstandingPrincipal: remainingPrincipal,
        allocations: [],
        advanceApplications: [],
      });
    }
  }
  for (const item of reconciliationInstructions.filter(
    (candidate) =>
      candidate.type === 'carry_receivable_forward' &&
      candidate.targetPeriodId &&
      candidate.applicationDate,
  )) {
    let remaining = item.amount;
    for (const installment of [...installments]
      .filter((candidate) => candidate.periodId === item.periodId)
      .reverse()) {
      if (remaining <= EPSILON) break;
      installment.carriedToPeriodId = item.targetPeriodId;
      installment.carriedApplicationDate = item.applicationDate;
      installment.dueDate = item.applicationDate!;
      remaining -= installment.principalAmount;
    }
  }
  return installments.sort(compareInstallments);
};

export interface ReceivableAllocationOptions {
  autoApplyAdvance?: boolean;
}

export const allocatePaymentsToReceivables = (
  sourceInstallments: ReceivableInstallment[],
  payments: ActualPayment[],
  asOfDate: string,
  options: ReceivableAllocationOptions = {},
): ReceivableLedger => {
  const installments: ReceivableInstallment[] = structuredClone(sourceInstallments).map(
    (installment) => ({
      ...installment,
      collectedAmount: 0,
      advanceAppliedAmount: 0,
      outstandingPrincipal: installment.principalAmount,
      allocations: [],
      advanceApplications: [],
    }),
  );
  const allocations: ReceivablePaymentAllocation[] = [];
  const advanceLots: CustomerAdvanceLot[] = [];
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
    const explicitlyTargetedInstallment = payment.receivableInstallmentId
      ? installments.find((installment) => installment.id === payment.receivableInstallmentId)
      : undefined;
    const explicitlyTargetedPeriod = explicitlyTargetedInstallment?.periodId ?? payment.invoiceId;
    const candidates = installments
      .filter((installment) => {
        if (installment.outstandingPrincipal <= EPSILON) return false;
        if (payment.receivableInstallmentId)
          return (
            installment.id === payment.receivableInstallmentId ||
            installment.carriedToPeriodId === explicitlyTargetedPeriod
          );
        if (payment.invoiceId)
          return (
            installment.invoiceId === payment.invoiceId ||
            installment.carriedToPeriodId === payment.invoiceId
          );
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
    if (remaining > EPSILON) {
      const paymentAllocations = allocations.filter((allocation) => allocation.paymentId === payment.id);
      const sourcePeriodId =
        payment.invoiceId ??
        explicitlyTargetedInstallment?.periodId ??
        paymentAllocations.at(-1)?.periodId;
      advanceLots.push({
        id: `advance_${payment.id}`,
        sourcePaymentId: payment.id,
        sourcePeriodId,
        availableDate: payment.date,
        originalAmount: remaining,
        appliedAmount: 0,
        remainingAmount: remaining,
        applications: [],
      });
    }
  }

  const advanceApplications: AdvanceApplication[] = [];
  if (options.autoApplyAdvance) {
    for (const lot of advanceLots) {
      const sourcePeriodIndex = lot.sourcePeriodId
        ? installments.find((installment) => installment.periodId === lot.sourcePeriodId)?.periodIndex ?? 0
        : 0;
      const candidates = installments
        .filter((installment) => {
          const invoiceDate = installment.invoiceDate ?? installment.dueDate;
          return (
            installment.outstandingPrincipal > EPSILON &&
            installment.periodIndex > sourcePeriodIndex &&
            invoiceDate <= asOfDate
          );
        })
        .sort((a, b) =>
          (a.invoiceDate ?? a.dueDate).localeCompare(b.invoiceDate ?? b.dueDate) ||
          compareInstallments(a, b),
        );
      for (const installment of candidates) {
        if (lot.remainingAmount <= EPSILON) break;
        const amount = Math.min(installment.outstandingPrincipal, lot.remainingAmount);
        const invoiceDate = installment.invoiceDate ?? installment.dueDate;
        const applicationDate = lot.availableDate > invoiceDate ? lot.availableDate : invoiceDate;
        const application: AdvanceApplication = {
          id: `advance_application_${lot.sourcePaymentId}_${installment.id}`,
          advanceLotId: lot.id,
          sourcePaymentId: lot.sourcePaymentId,
          sourcePeriodId: lot.sourcePeriodId,
          targetInvoiceId: installment.invoiceId,
          targetPeriodId: installment.periodId,
          applicationDate,
          amount,
        };
        lot.appliedAmount += amount;
        lot.remainingAmount = Math.max(0, lot.originalAmount - lot.appliedAmount);
        lot.applications.push(application);
        installment.advanceAppliedAmount = (installment.advanceAppliedAmount ?? 0) + amount;
        installment.advanceApplications = [
          ...(installment.advanceApplications ?? []),
          application,
        ];
        installment.outstandingPrincipal = Math.max(0, installment.outstandingPrincipal - amount);
        advanceApplications.push(application);
      }
    }
  }

  const totalPaymentsAsOf = effectivePayments.reduce((sum, { payment }) => sum + payment.amount, 0);
  const totalCollectedPrincipal = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );
  const totalAdvanceApplied = advanceApplications.reduce(
    (sum, application) => sum + application.amount,
    0,
  );
  return {
    asOfDate,
    installments,
    allocations,
    totalPaymentsAsOf,
    totalCollectedPrincipal,
    totalAdvanceApplied,
    totalOutstandingPrincipal: installments.reduce(
      (sum, installment) => sum + installment.outstandingPrincipal,
      0,
    ),
    customerAdvance: advanceLots.reduce((sum, lot) => sum + lot.remainingAmount, 0),
    advanceLots,
    advanceApplications,
  };
};
