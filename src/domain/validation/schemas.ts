import { z } from 'zod';

const nonNegative = z.number().finite().nonnegative();
const rate = nonNegative.max(100);
const nullableFinite = z.number().finite().nullable();
const nullableNonNegative = nonNegative.nullable();

export const monthlyMarketPriceSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-MM biçiminde olmalıdır.'),
  forecastPtfTlMwh: nullableFinite,
  actualPtfTlMwh: nullableFinite,
  forecastYekdemTlMwh: nullableNonNegative,
  actualYekdemTlMwh: nullableNonNegative,
  sourceNote: z.string().optional(),
  actualizedAt: z.string().optional(),
  updatedAt: z.string().min(1),
});

export const monthlyMarketPricesSchema = z
  .array(monthlyMarketPriceSchema)
  .superRefine((records, context) => {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      if (seen.has(record.month))
        context.addIssue({
          code: 'custom',
          path: [index, 'month'],
          message: `${record.month} ayı yalnız bir kez eklenebilir.`,
        });
      seen.add(record.month);
    });
  });

export const appSettingsSchema = z.object({
  id: z.literal('app'),
  theme: z.enum(['light', 'dark', 'system']),
  holidays: z.array(z.iso.date()),
  lateFee: z.object({
    monthlyRate: nonNegative,
    dayBasis: z.literal(360),
    useInvoiceVatRate: z.literal(true),
    compound: z.literal(false),
    includeWeekendsAndHolidays: z.literal(true),
  }),
  policyVersion: z.string().min(1),
  monthlyMarketPrices: monthlyMarketPricesSchema,
  tariffVersions: z
    .array(
      z.object({
        id: z.string().min(1),
        customerType: z.string().min(1),
        validFrom: z.iso.date(),
        validTo: z.iso.date().optional(),
        kdvRate: rate,
        btvRate: rate,
        distributionUnitTlMwh: nonNegative,
        sourceLabel: z.string().min(1),
        versionLabel: z.string().min(1),
        active: z.boolean(),
        updatedAt: z.string().min(1),
      }),
    )
    .optional(),
  lastBackupAt: z.string().optional(),
});

export const gesSettingsSchema = z
  .object({
    mode: z.enum(['simple_self_consumption', 'advanced_metering']),
    selfConsumptionRate: rate,
    totalProductionMwh: nonNegative.optional(),
    simultaneousSelfConsumptionMwh: nonNegative.optional(),
    gridImportMwh: nonNegative.optional(),
    gridExportMwh: nonNegative.optional(),
    excessAfterNettingMwh: nonNegative.optional(),
    excessPurchasePrice: nonNegative.optional(),
    priceType: z.enum(['regulated', 'ptf', 'ptf_yekdem', 'manual']).optional(),
    nettingMethod: z.enum(['monthly', 'hourly', 'manual']).optional(),
    excessProductionTaxMode: z.enum(['manual', 'no_tax_in_demo']).optional(),
    manualTaxAmountTl: nonNegative.optional(),
    settlementMode: z.enum(['cash_outflow', 'invoice_offset']).optional(),
    excessPurchasePaymentOffsetDays: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.mode === 'advanced_metering' &&
      (value.simultaneousSelfConsumptionMwh ?? 0) > (value.totalProductionMwh ?? 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['simultaneousSelfConsumptionMwh'],
        message: 'Eş zamanlı öz tüketim toplam GES üretimini aşamaz.',
      });
    }
  });

export const paymentPlanRowSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  enabled: z.boolean(),
  name: z.string().min(1),
  applicationScope: z.enum([
    'each_period',
    'first_period',
    'last_period',
    'selected_periods',
    'contract_once',
  ]),
  selectedPeriods: z.array(z.number().int().positive()),
  amountType: z.enum([
    'period_invoice_percent',
    'period_fixed_tl',
    'period_remaining_balance',
    'contract_total_percent',
    'contract_fixed_tl',
  ]),
  amountValue: nonNegative,
  dateReference: z.enum([
    'usage_start',
    'usage_end',
    'period_start',
    'period_end',
    'invoice_date',
    'fixed_day',
    'manual_date',
  ]),
  dayOffset: z.number().int(),
  fixedDay: z.number().int().min(1).max(31),
  fixedDayMonthOffset: z.number().int(),
  manualDate: z.string().optional(),
  paymentChannel: z.enum([
    'cash',
    'eft',
    'bank_transfer',
    'automatic_payment',
    'credit_card_single',
    'credit_card_installment',
    'dbs',
    'other',
  ]),
  installmentCount: z.number().int().min(1).max(36),
  installmentIntervalDays: z.number().int().nonnegative(),
  merchantSettlementMode: z.enum(['upfront_net', 'installment_settlement']),
  bankSettlementDelayDays: z.number().int().nonnegative(),
  commissionRate: rate,
  commissionBearer: z.enum(['epsas', 'customer']),
  note: z.string().optional(),
});

export const paymentPlanSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1),
    templateId: z.string().min(1),
    mode: z.enum(['template', 'custom']),
    rows: z.array(paymentPlanRowSchema),
    reconciliation: z.object({
      enabled: z.boolean(),
      reference: z.enum(['invoice_date', 'period_end', 'usage_end']),
      offsetDays: z.number().int(),
      overpaymentAction: z.enum(['carry_forward', 'refund_after_days', 'refund_at_contract_end']),
      refundOffsetDays: z.number().int().nonnegative(),
      underpaymentAction: z.enum(['collect_after_days', 'carry_to_next_invoice', 'leave_open']),
      collectionOffsetDays: z.number().int().nonnegative(),
      collectionChannel: z.enum([
        'cash',
        'eft',
        'bank_transfer',
        'automatic_payment',
        'credit_card_single',
        'credit_card_installment',
        'dbs',
        'other',
      ]),
      collectionCommissionRate: rate,
      collectionCommissionBearer: z.enum(['epsas', 'customer']),
    }),
  })
  .refine(
    (plan) => plan.rows.some((rowItem) => rowItem.enabled),
    'Ödeme planında en az bir aktif satır olmalıdır.',
  );

export const offerStateSchema = z
  .object({
    customerId: z.string(),
    title: z.string().min(1),
    usageStart: z.iso.date(),
    usageEnd: z.iso.date(),
    monthlyConsumption: nonNegative,
    monthlyConsumptionUnit: z.enum(['MWh', 'kWh']),
    customerType: z.string().min(1),
    kdvRate: rate,
    btvRate: rate,
    distributionUnitTlMwh: nonNegative,
    hasDistribution: z.boolean(),
    contractPowerTl: nonNegative,
    ptfTlMwh: nonNegative,
    yekdemTlMwh: nonNegative,
    offerRate: z.number().finite().optional(),
    imbalanceRate: rate,
    piuRate: rate,
    creditRate: nonNegative,
    valorRate: nonNegative,
    yekdemDueOffset: z.number().int(),
    distributionDueOffset: z.number().int(),
    kdvDueOffset: z.number().int(),
    btvDueOffset: z.number().int(),
    ges: gesSettingsSchema,
    paymentPlan: paymentPlanSchema,
    tariffOverrides: z
      .array(
        z.object({
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          kdvRate: rate,
          btvRate: rate,
          distributionUnitTlMwh: nonNegative,
          reason: z.string(),
        }),
      )
      .optional(),
    tariffSourceMode: z.enum(['catalog', 'explicit_override', 'legacy_numeric']).optional(),
  })
  .refine((state) => state.usageEnd >= state.usageStart, {
    path: ['usageEnd'],
    message: 'Teklif bitişi başlangıçtan önce olamaz.',
  });

export const actualPaymentSchema = z.object({
  id: z.string().min(1),
  invoiceId: z.string().optional(),
  receivableInstallmentId: z.string().optional(),
  date: z.iso.date(),
  amount: nonNegative,
  channel: z.enum([
    'cash',
    'eft',
    'bank_transfer',
    'automatic_payment',
    'credit_card_single',
    'credit_card_installment',
    'dbs',
    'other',
  ]),
  note: z.string().optional(),
});
