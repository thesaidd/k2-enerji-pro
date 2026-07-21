import type { PaymentChannel, PaymentPlan, PaymentPlanRow } from '../types';

export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  cash: 'Nakit',
  eft: 'EFT',
  bank_transfer: 'Havale',
  automatic_payment: 'Otomatik Ödeme',
  credit_card_single: 'Kredi Kartı · Tek Çekim',
  credit_card_installment: 'Kredi Kartı · Taksitli',
  dbs: 'DBS / DTS',
  other: 'Diğer',
};

export const createId = (prefix: string): string =>
  `${prefix}_${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

export const defaultPaymentRow = (): PaymentPlanRow => ({
  id: createId('payment_row'),
  order: 1,
  enabled: true,
  name: 'Yeni tahsilat',
  applicationScope: 'each_period',
  selectedPeriods: [],
  amountType: 'period_remaining_balance',
  amountValue: 0,
  dateReference: 'invoice_date',
  dayOffset: 10,
  fixedDay: 10,
  fixedDayMonthOffset: 1,
  paymentChannel: 'eft',
  installmentCount: 1,
  installmentIntervalDays: 30,
  merchantSettlementMode: 'upfront_net',
  bankSettlementDelayDays: 0,
  commissionRate: 0,
  commissionBearer: 'epsas',
  note: '',
});

const row = (spec: Partial<PaymentPlanRow>): Partial<PaymentPlanRow> => spec;

export interface PaymentPlanTemplate {
  id: string;
  name: string;
  summary: string;
  rows: Partial<PaymentPlanRow>[];
}

export const PAYMENT_PLAN_TEMPLATES: PaymentPlanTemplate[] = [
  {
    id: 'standard_deferred',
    name: 'Standart Vadeli',
    summary: 'Her faturanın kalan tamamı, fatura tarihinden 10 gün sonra EFT ile tahsil edilir.',
    rows: [row({ name: 'Standart tahsilat', dayOffset: 10 })],
  },
  {
    id: 'fixed_day',
    name: 'Sabit Gün',
    summary: 'Her faturanın kalan tamamı takip eden ayın 10. günü tahsil edilir.',
    rows: [
      row({ name: "Ayın 10'u", dateReference: 'fixed_day', fixedDay: 10, fixedDayMonthOffset: 1 }),
    ],
  },
  {
    id: 'full_advance',
    name: 'Tam Ön Ödeme',
    summary: 'Dönem faturasının tamamı kullanım başlangıcından 10 gün önce avans olarak alınır.',
    rows: [
      row({
        name: 'Tam avans',
        amountType: 'period_invoice_percent',
        amountValue: 100,
        dateReference: 'period_start',
        dayOffset: -10,
      }),
    ],
  },
  {
    id: 'partial_advance_balance',
    name: 'Kısmi Avans + Kalan',
    summary: '%80 avans, kalan tutar fatura tarihinden 10 gün sonra tahsil edilir.',
    rows: [
      row({
        name: '%80 avans',
        amountType: 'period_invoice_percent',
        amountValue: 80,
        dateReference: 'period_start',
        dayOffset: -10,
      }),
      row({ name: 'Kalan tahsilat', amountType: 'period_remaining_balance', dayOffset: 10 }),
    ],
  },
  {
    id: 'card_single',
    name: 'Kredi Kartı Tek Çekim',
    summary: 'Kalan fatura kartla tek çekim; banka aktarımı bir gün sonra.',
    rows: [
      row({
        name: 'Kart tahsilatı',
        paymentChannel: 'credit_card_single',
        bankSettlementDelayDays: 1,
        dayOffset: 10,
      }),
    ],
  },
  {
    id: 'card_installment_upfront',
    name: 'Kart Taksitli · Peşin Aktarım',
    summary: 'Müşteri üç taksit öder, banka EPSAŞ’a tek seferde aktarır.',
    rows: [
      row({
        name: 'Taksitli kart · peşin aktarım',
        paymentChannel: 'credit_card_installment',
        installmentCount: 3,
        merchantSettlementMode: 'upfront_net',
        bankSettlementDelayDays: 1,
        dayOffset: 10,
      }),
    ],
  },
  {
    id: 'card_installment_settlement',
    name: 'Kart Taksitli · Taksitli Aktarım',
    summary: 'Banka tutarı EPSAŞ’a 30 gün arayla üç parçada aktarır.',
    rows: [
      row({
        name: 'Taksitli kart · taksitli aktarım',
        paymentChannel: 'credit_card_installment',
        installmentCount: 3,
        merchantSettlementMode: 'installment_settlement',
        installmentIntervalDays: 30,
        dayOffset: 10,
      }),
    ],
  },
  {
    id: 'mixed',
    name: 'Karma Plan',
    summary: '%30 avans EFT, %40 kart ve kalan tutar vadeli EFT.',
    rows: [
      row({
        name: '%30 avans EFT',
        amountType: 'period_invoice_percent',
        amountValue: 30,
        dateReference: 'period_start',
        dayOffset: -10,
      }),
      row({
        name: '%40 kart',
        amountType: 'period_invoice_percent',
        amountValue: 40,
        paymentChannel: 'credit_card_single',
        bankSettlementDelayDays: 1,
        dayOffset: 0,
      }),
      row({ name: 'Kalan EFT', amountType: 'period_remaining_balance', dayOffset: 10 }),
    ],
  },
  {
    id: 'custom',
    name: 'Özel Plan',
    summary: 'Tüm tahsilat kuralları ve tarihleri kullanıcı tarafından tanımlanır.',
    rows: [],
  },
];

export const createPaymentPlan = (templateId = 'standard_deferred'): PaymentPlan => {
  const template =
    PAYMENT_PLAN_TEMPLATES.find((item) => item.id === templateId) ?? PAYMENT_PLAN_TEMPLATES[0]!;
  return {
    version: 1,
    id: createId('payment_plan'),
    name: template.name,
    templateId: template.id,
    mode: template.id === 'custom' ? 'custom' : 'template',
    rows: template.rows.map((spec, index) => ({
      ...defaultPaymentRow(),
      ...spec,
      id: createId('payment_row'),
      order: index + 1,
    })),
    reconciliation: {
      enabled: true,
      reference: 'invoice_date',
      offsetDays: 10,
      overpaymentAction: 'carry_forward',
      refundOffsetDays: 10,
      underpaymentAction: 'collect_after_days',
      collectionOffsetDays: 10,
      collectionChannel: 'eft',
      collectionCommissionRate: 0,
      collectionCommissionBearer: 'epsas',
    },
  };
};
