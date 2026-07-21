import { describe, expect, it } from 'vitest';
import { TARIFFS, applyTariffDefaults } from '../config/tariffs';
import { PAYMENT_PLAN_TEMPLATES, createPaymentPlan } from '../config/paymentPlans';
import { calculateOffer } from '../domain/profitability/calculation';
import type { PaymentPlanRow } from '../types';
import { oneMwhState } from './helpers';

const templates = PAYMENT_PLAN_TEMPLATES.filter((template) => template.id !== 'custom');
const customPlanCases: Array<[string, Array<Partial<PaymentPlanRow>>]> = [
  ['tek satır', [{ amountType: 'period_remaining_balance', dayOffset: 10 }]],
  [
    'yüzde + kalan',
    [
      { amountType: 'period_invoice_percent', amountValue: 50 },
      { amountType: 'period_remaining_balance' },
    ],
  ],
  ['sabit TL', [{ amountType: 'period_fixed_tl', amountValue: 1000 }]],
  [
    'seçili dönem',
    [
      {
        applicationScope: 'selected_periods',
        selectedPeriods: [1],
        amountType: 'period_remaining_balance',
      },
    ],
  ],
  [
    'sözleşmede bir kez',
    [{ applicationScope: 'contract_once', amountType: 'contract_total_percent', amountValue: 100 }],
  ],
  [
    'manuel tarih',
    [
      {
        dateReference: 'manual_date',
        manualDate: '2026-06-20',
        amountType: 'period_remaining_balance',
      },
    ],
  ],
  [
    'negatif offsetli avans',
    [
      {
        dateReference: 'period_start',
        dayOffset: -10,
        amountType: 'period_invoice_percent',
        amountValue: 100,
      },
    ],
  ],
];

describe('12 müşteri tipi matrisi', () => {
  it('12 demo tarifeyi içerir', () => expect(TARIFFS).toHaveLength(12));
  it.each(TARIFFS)('$label varsayılanlarını uygular', (tariff) => {
    const defaults = applyTariffDefaults(tariff.key);
    expect(defaults.kdvRate).toBe(tariff.kdvDefault);
    expect(defaults.btvRate).toBe(tariff.btvDefault);
    expect(defaults.distributionUnitTlMwh).toBe(tariff.distributionTlMwh);
    expect(applyTariffDefaults(tariff.key, false).distributionUnitTlMwh).toBe(0);
  });
});

describe('12 tarife × 8 ödeme planı', () => {
  it.each(TARIFFS.flatMap((tariff) => templates.map((template) => [tariff, template] as const)))(
    '$0.label × $1.name',
    (tariff, template) => {
      const defaults = applyTariffDefaults(tariff.key);
      const result = calculateOffer(
        oneMwhState({
          ...defaults,
          paymentPlan: createPaymentPlan(template.id),
          creditRate: 0,
          valorRate: 0,
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.plannedPayments.length).toBeGreaterThan(0);
      expect(result.totals.btvAmount).toBeGreaterThanOrEqual(0);
      expect(result.totals.kdvAmount).toBeGreaterThanOrEqual(0);
    },
  );
});

describe('özel ödeme planları', () => {
  it.each(customPlanCases)('%s çalışır', (_name, patches) => {
    const plan = createPaymentPlan('standard_deferred');
    plan.mode = 'custom';
    plan.rows = patches.map((patch, index) => ({
      ...plan.rows[0]!,
      ...patch,
      id: `row_${index}`,
      order: index + 1,
    }));
    const result = calculateOffer(oneMwhState({ paymentPlan: plan }));
    expect(result.valid).toBe(true);
  });
});
