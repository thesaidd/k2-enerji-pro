import { addIsoDays, adjustToBusinessDay } from '../calendar/calendar';
import type {
  BillingPeriod,
  CashEvent,
  PlannedPayment,
  ReconciliationInstruction,
  ReconciliationSettings,
} from '../../types';

const EPSILON = 1e-6;

export interface PlannedReconciliationResult {
  payments: PlannedPayment[];
  cashEvents: CashEvent[];
  instructions: ReconciliationInstruction[];
  endingAdvance: number;
  endingReceivable: number;
  warnings: string[];
}

const withPrincipal = (payment: PlannedPayment, principalAmount: number): PlannedPayment => {
  const commissionRate = payment.commissionRate ?? 0;
  const commission = (principalAmount * commissionRate) / 100;
  const epsasChannelCost = payment.commissionBearer === 'epsas' ? commission : 0;
  return {
    ...payment,
    principalAmount,
    epsasChannelCost,
    customerChannelFee: payment.commissionBearer === 'customer' ? commission : 0,
    netCashIn: principalAmount - epsasChannelCost,
  };
};

const referenceDate = (
  period: BillingPeriod,
  settings: ReconciliationSettings,
  usageEnd: string,
): string =>
  settings.reference === 'usage_end'
    ? usageEnd
    : settings.reference === 'period_end'
      ? period.end
      : period.invoiceDate;

const instruction = (
  period: BillingPeriod,
  type: ReconciliationInstruction['type'],
  amount: number,
  reference: string,
  note: string,
  extra: Partial<ReconciliationInstruction> = {},
): ReconciliationInstruction => ({
  id: `reconciliation-${period.id}-${type}`,
  periodId: period.id,
  type,
  referenceDate: reference,
  amount,
  source: 'planned',
  note,
  ...extra,
});

export const applyPlannedReconciliation = (
  periods: BillingPeriod[],
  sourcePayments: PlannedPayment[],
  settings: ReconciliationSettings,
  usageStart: string,
  usageEnd: string,
  holidays: string[] = [],
): PlannedReconciliationResult => {
  void usageStart;
  let payments = structuredClone(sourcePayments);
  const cashEvents: CashEvent[] = [];
  const instructions: ReconciliationInstruction[] = [];
  const warnings: string[] = [];
  let advance = 0;
  let carriedReceivable = 0;
  let openReceivable = 0;
  const autoApplyAdvance =
    settings.enabled &&
    (settings.overpaymentAction === 'carry_forward' ||
      settings.overpaymentAction === 'refund_at_contract_end');

  for (const period of periods) {
    const openingReceivable = carriedReceivable;
    carriedReceivable = 0;
    let periodPayments = payments
      .filter((payment) => payment.periodId === period.id)
      .sort((a, b) => a.settlementDate.localeCompare(b.settlementDate) || a.id.localeCompare(b.id));

    if (openingReceivable > EPSILON && periodPayments.length > 0) {
      const last = periodPayments.at(-1)!;
      const augmented = withPrincipal(last, last.principalAmount + openingReceivable);
      payments = payments.map((payment) => (payment.id === last.id ? augmented : payment));
      periodPayments = periodPayments.map((payment) => (payment.id === last.id ? augmented : payment));
    }

    let targetPrincipal = period.grossInvoice + openingReceivable;
    const advanceApplied = autoApplyAdvance ? Math.min(advance, targetPrincipal) : 0;
    if (advanceApplied > EPSILON) {
      advance -= advanceApplied;
      targetPrincipal -= advanceApplied;
      let remainingReduction = advanceApplied;
      for (const candidate of [...periodPayments].reverse()) {
        if (remainingReduction <= EPSILON) break;
        const reduction = Math.min(candidate.principalAmount, remainingReduction);
        const updated = withPrincipal(candidate, candidate.principalAmount - reduction);
        payments = payments.map((payment) => (payment.id === candidate.id ? updated : payment));
        periodPayments = periodPayments.map((payment) =>
          payment.id === candidate.id ? updated : payment,
        );
        remainingReduction -= reduction;
      }
    }

    const plannedPrincipal = periodPayments.reduce(
      (total, payment) => total + payment.principalAmount,
      0,
    );
    const difference = plannedPrincipal - targetPrincipal;
    const reference = referenceDate(period, settings, usageEnd);

    if (difference > EPSILON) {
      if (!settings.enabled) {
        advance += difference;
        warnings.push(
          `${period.id} döneminde ${difference.toFixed(2)} TL müşteri avansı tutuldu; mutabakat kapalı olduğu için sonraki döneme otomatik uygulanmadı.`,
        );
      } else if (
        settings.overpaymentAction === 'carry_forward' ||
        settings.overpaymentAction === 'refund_at_contract_end'
      ) {
        advance += difference;
        const targetPeriod = periods.find((candidate) => candidate.index === period.index + 1);
        instructions.push(
          instruction(
            period,
            'carry_advance_forward',
            difference,
            reference,
            settings.overpaymentAction === 'carry_forward'
              ? 'Dönem fazla ödemesi sonraki dönem faturasına uygulanmak üzere müşteri avansına taşındı.'
              : 'Dönem fazla ödemesi gelecekteki faturalara uygulanır; sözleşme sonunda yalnız kalan avans iade edilir.',
            {
              sourcePeriodId: period.id,
              targetPeriodId: targetPeriod?.id,
              applicationDate: targetPeriod?.invoiceDate,
            },
          ),
        );
      } else if (settings.overpaymentAction === 'refund_after_days') {
        const scheduledDate = adjustToBusinessDay(
          addIsoDays(reference, settings.refundOffsetDays),
          holidays,
        );
        cashEvents.push({
          id: `planned-refund-${period.id}`,
          date: scheduledDate,
          type: 'customer_refund',
          direction: 'out',
          amount: difference,
          periodId: period.id,
          label: 'Planlanan müşteri iadesi',
          note: 'Mutabakat fazla ödeme iadesi; kâr değildir.',
        });
        instructions.push(
          instruction(period, 'refund_customer', difference, reference, 'Fazla ödeme iade edilir.', {
            scheduledDate,
          }),
        );
      }
    } else if (difference < -EPSILON) {
      const shortage = -difference;
      if (!settings.enabled) {
        openReceivable += shortage;
        warnings.push(`${period.id} döneminde ${shortage.toFixed(2)} TL açık alacak kaldı; mutabakat kapalı.`);
      } else if (settings.underpaymentAction === 'collect_after_days') {
        const scheduledDate = adjustToBusinessDay(
          addIsoDays(reference, settings.collectionOffsetDays),
          holidays,
        );
        const commission = (shortage * settings.collectionCommissionRate) / 100;
        const epsasChannelCost =
          settings.collectionCommissionBearer === 'epsas' ? commission : 0;
        payments.push({
          id: `supplemental-${period.id}`,
          periodId: period.id,
          planRowId: 'reconciliation',
          planRowName: 'Tamamlayıcı tahsilat',
          transactionDate: scheduledDate,
          settlementDate: scheduledDate,
          paymentChannel: settings.collectionChannel,
          commissionRate: settings.collectionCommissionRate,
          commissionBearer: settings.collectionCommissionBearer,
          principalAmount: shortage,
          epsasChannelCost,
          customerChannelFee:
            settings.collectionCommissionBearer === 'customer' ? commission : 0,
          netCashIn: shortage - epsasChannelCost,
          installmentNo: 1,
          installmentCount: 1,
          note: 'Mutabakat tamamlayıcı tahsilatı',
        });
        instructions.push(
          instruction(
            period,
            'supplemental_collection',
            shortage,
            reference,
            'Eksik ödeme seçilen kanalla tamamlanır.',
            {
              scheduledDate,
              paymentChannel: settings.collectionChannel,
              commissionRate: settings.collectionCommissionRate,
              commissionBearer: settings.collectionCommissionBearer,
            },
          ),
        );
      } else if (settings.underpaymentAction === 'carry_to_next_invoice') {
        if (period.index < periods.length) {
          const targetPeriod = periods.find((candidate) => candidate.index === period.index + 1)!;
          const targetPayments = sourcePayments
            .filter((payment) => payment.periodId === targetPeriod.id)
            .sort(
              (a, b) =>
                a.transactionDate.localeCompare(b.transactionDate) || a.id.localeCompare(b.id),
            );
          const applicationDate = targetPayments.at(-1)?.transactionDate ?? targetPeriod.invoiceDate;
          carriedReceivable = shortage;
          instructions.push(
            instruction(
              period,
              'carry_receivable_forward',
              shortage,
              reference,
              'Dönem eksik ödemesi sonraki dönem hedef anaparasına taşındı.',
              {
                sourcePeriodId: period.id,
                targetPeriodId: targetPeriod.id,
                applicationDate,
              },
            ),
          );
        } else {
          openReceivable += shortage;
          warnings.push(`Son dönemde ${shortage.toFixed(2)} TL açık alacak kaldı.`);
        }
      } else {
        openReceivable += shortage;
        instructions.push(
          instruction(
            period,
            'leave_receivable_open',
            shortage,
            reference,
            'Eksik ödeme otomatik tahsilat oluşturulmadan açık bırakıldı.',
          ),
        );
      }
    }
  }

  if (
    settings.enabled &&
    settings.overpaymentAction === 'refund_at_contract_end' &&
    advance > EPSILON &&
    periods.length > 0
  ) {
    const lastPeriod = periods.at(-1)!;
    const scheduledDate = adjustToBusinessDay(usageEnd, holidays);
    const amount = advance;
    advance = 0;
    cashEvents.push({
      id: `planned-contract-refund-${lastPeriod.id}`,
      date: scheduledDate,
      type: 'customer_refund',
      direction: 'out',
      amount,
      periodId: lastPeriod.id,
      label: 'Sözleşme sonu müşteri iadesi',
      note: 'Kalan müşteri avansı tek seferde iade edilir; kâr değildir.',
    });
    instructions.push(
      instruction(
        lastPeriod,
        'refund_customer',
        amount,
        usageEnd,
        'Sözleşme sonunda kalan müşteri avansı iade edilir.',
        { scheduledDate },
      ),
    );
  }

  payments = payments
    .filter((payment) => payment.principalAmount > EPSILON)
    .sort((a, b) => a.settlementDate.localeCompare(b.settlementDate) || a.id.localeCompare(b.id));
  if (advance > EPSILON)
    warnings.push(`Ödeme planı sözleşme sonunda ${advance.toFixed(2)} TL müşteri avansı bırakıyor.`);
  const endingReceivable = openReceivable + carriedReceivable;
  if (endingReceivable > EPSILON)
    warnings.push(`Ödeme planı sözleşme sonunda ${endingReceivable.toFixed(2)} TL açık alacak bırakıyor.`);

  return {
    payments,
    cashEvents,
    instructions,
    endingAdvance: advance,
    endingReceivable,
    warnings,
  };
};
