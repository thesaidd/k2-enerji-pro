import type {
  ActualPayment,
  ActualPaymentFinancials,
  CommissionBearer,
  PaymentChannel,
  PlannedPayment,
  ReceivableInstallment,
} from '../../types';

export interface ActualPaymentCommissionDefaults {
  commissionRate: number;
  commissionBearer: CommissionBearer;
  paymentChannel?: PaymentChannel;
  sourcePlannedPaymentId?: string;
}

export const resolveActualPaymentCommissionDefaults = (
  receivableInstallmentId: string | undefined,
  installments: ReceivableInstallment[],
  plannedPayments: PlannedPayment[],
): ActualPaymentCommissionDefaults => {
  const installment = installments.find((item) => item.id === receivableInstallmentId);
  const plannedPayment = plannedPayments.find(
    (item) => item.id === installment?.sourcePlannedPaymentId,
  );
  if (!plannedPayment)
    return {
      commissionRate: 0,
      commissionBearer: 'epsas',
    };
  const commission = plannedPayment.epsasChannelCost + plannedPayment.customerChannelFee;
  const derivedRate =
    plannedPayment.principalAmount > 0 ? (commission / plannedPayment.principalAmount) * 100 : 0;
  const derivedBearer: CommissionBearer =
    plannedPayment.customerChannelFee > 0 ? 'customer' : 'epsas';
  return {
    commissionRate: plannedPayment.commissionRate ?? derivedRate,
    commissionBearer: plannedPayment.commissionBearer ?? derivedBearer,
    paymentChannel: plannedPayment.paymentChannel,
    sourcePlannedPaymentId: plannedPayment.id,
  };
};

export const calculateActualPaymentFinancials = (
  payment: ActualPayment,
  defaults: ActualPaymentCommissionDefaults = {
    commissionRate: 0,
    commissionBearer: 'epsas',
  },
): ActualPaymentFinancials => {
  const commissionRate =
    payment.commissionRate != null && Number.isFinite(payment.commissionRate)
      ? Math.min(100, Math.max(0, payment.commissionRate))
      : defaults.commissionRate;
  const commissionBearer = payment.commissionBearer ?? defaults.commissionBearer;
  const commission = (payment.amount * commissionRate) / 100;
  const epsasChannelCost = commissionBearer === 'epsas' ? commission : 0;
  const customerChannelFee = commissionBearer === 'customer' ? commission : 0;
  return {
    paymentId: payment.id,
    principalAmount: payment.amount,
    commissionRate,
    commissionBearer,
    epsasChannelCost,
    customerChannelFee,
    netCashIn: payment.amount - epsasChannelCost,
  };
};
