import { addIsoDays, adjustToBusinessDay, resolvePaymentDate } from '../calendar/calendar';
import { createId } from '../../config/paymentPlans';
import type { BillingPeriod, PaymentPlan, PaymentPlanRow, PlannedPayment } from '../../types';

const appliesToPeriod = (row: PaymentPlanRow, period: BillingPeriod, total: number): boolean => {
  if (!row.enabled) return false;
  if (row.applicationScope === 'first_period') return period.index === 1;
  if (row.applicationScope === 'last_period') return period.index === total;
  if (row.applicationScope === 'selected_periods')
    return row.selectedPeriods.includes(period.index);
  if (row.applicationScope === 'contract_once') return period.index === 1;
  return true;
};

export interface PlannedSettlement {
  payments: PlannedPayment[];
  totalChannelCost: number;
  totalCustomerChannelFee: number;
  endingAdvance: number;
  endingReceivable: number;
  warnings: string[];
}

export const calculatePlannedPayments = (
  periods: BillingPeriod[],
  paymentPlan: PaymentPlan,
  usageStart: string,
  usageEnd: string,
  holidays: string[] = [],
): PlannedSettlement => {
  const invoiceTotal = periods.reduce((sum, period) => sum + period.grossInvoice, 0);
  const paidByPeriod = new Map<string, number>();
  const payments: PlannedPayment[] = [];
  const activeRows = [...paymentPlan.rows]
    .filter((row) => row.enabled)
    .sort((a, b) => a.order - b.order);
  for (const period of periods) {
    for (const rule of activeRows) {
      if (!appliesToPeriod(rule, period, periods.length)) continue;
      const alreadyPaid = paidByPeriod.get(period.id) ?? 0;
      const principal =
        rule.amountType === 'period_invoice_percent'
          ? (period.grossInvoice * rule.amountValue) / 100
          : rule.amountType === 'period_fixed_tl'
            ? rule.amountValue
            : rule.amountType === 'period_remaining_balance'
              ? Math.max(0, period.grossInvoice - alreadyPaid)
              : rule.amountType === 'contract_total_percent'
                ? (invoiceTotal * rule.amountValue) / 100
                : rule.amountValue;
      if (principal <= 0) continue;
      paidByPeriod.set(period.id, alreadyPaid + principal);
      const transactionDate = resolvePaymentDate(
        rule.dateReference,
        period,
        usageStart,
        usageEnd,
        rule.dayOffset,
        rule.fixedDay,
        rule.fixedDayMonthOffset,
        rule.manualDate,
        holidays,
      );
      const installments =
        rule.paymentChannel === 'credit_card_installment' &&
        rule.merchantSettlementMode === 'installment_settlement'
          ? rule.installmentCount
          : 1;
      let usedPrincipal = 0;
      for (let installment = 0; installment < installments; installment += 1) {
        const installmentPrincipal =
          installment === installments - 1 ? principal - usedPrincipal : principal / installments;
        usedPrincipal += installmentPrincipal;
        const settlementDate = adjustToBusinessDay(
          addIsoDays(
            transactionDate,
            rule.bankSettlementDelayDays + installment * rule.installmentIntervalDays,
          ),
          holidays,
        );
        const commission = (installmentPrincipal * rule.commissionRate) / 100;
        const epsasChannelCost = rule.commissionBearer === 'epsas' ? commission : 0;
        payments.push({
          id: createId('planned_payment'),
          periodId: period.id,
          planRowId: rule.id,
          planRowName: rule.name,
          transactionDate,
          settlementDate,
          paymentChannel: rule.paymentChannel,
          principalAmount: installmentPrincipal,
          epsasChannelCost,
          customerChannelFee: rule.commissionBearer === 'customer' ? commission : 0,
          netCashIn: installmentPrincipal - epsasChannelCost,
          installmentNo: installment + 1,
          installmentCount: installments,
          note: rule.note,
        });
      }
    }
  }
  payments.sort((a, b) => a.settlementDate.localeCompare(b.settlementDate));
  const principal = payments.reduce((sum, payment) => sum + payment.principalAmount, 0);
  const endingAdvance = Math.max(0, principal - invoiceTotal);
  const endingReceivable = Math.max(0, invoiceTotal - principal);
  const warnings: string[] = [];
  if (endingAdvance > 1e-6) warnings.push('Ödeme planı sözleşme sonunda müşteri avansı bırakıyor.');
  if (endingReceivable > 1e-6) warnings.push('Ödeme planı sözleşme sonunda açık alacak bırakıyor.');
  return {
    payments,
    totalChannelCost: payments.reduce((sum, payment) => sum + payment.epsasChannelCost, 0),
    totalCustomerChannelFee: payments.reduce((sum, payment) => sum + payment.customerChannelFee, 0),
    endingAdvance,
    endingReceivable,
    warnings,
  };
};
