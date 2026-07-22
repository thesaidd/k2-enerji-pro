import { describe, expect, it } from 'vitest';
import { createPaymentPlan } from '../config/paymentPlans';
import { buildReceivableInstallments } from '../domain/receivables/ledger';
import { resolveActualPaymentCommissionDefaults } from '../domain/payment-plan/actualPaymentFinancials';
import { calculateOffer } from '../domain/profitability/calculation';
import { cashflowNetEffect, sumProfitLedger } from '../domain/profitability/profitLedger';
import { calculateRealization } from '../domain/realization/realization';
import { oneMwhState } from './helpers';
import type {
  ActualPayment,
  MonthlyMarketPrice,
  OfferState,
  PlannedOffer,
  RealizationScenario,
} from '../types';

const offerFor = (patch: Partial<OfferState> = {}, prices?: MonthlyMarketPrice[]): PlannedOffer => {
  const result = calculateOffer(
    oneMwhState({
      usageStart: '2026-07-01',
      usageEnd: '2026-07-31',
      monthlyConsumption: 31,
      offerRate: 10,
      ...patch,
    }),
    [],
    prices,
  );
  return {
    id: 'offer_p0b',
    recordType: 'planned_offer',
    customerId: 'customer_p0b',
    version: 1,
    title: 'P0-B teklif',
    status: 'final',
    stateSnapshot: result.state,
    paymentPlanSnapshot: result.state.paymentPlan,
    resultSnapshot: result,
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  };
};

const scenarioFor = (
  offer: PlannedOffer,
  patch: Partial<Omit<RealizationScenario, 'resultSnapshot'>> = {},
): Omit<RealizationScenario, 'resultSnapshot'> => ({
  id: 'scenario_p0b',
  sourceCustomerId: offer.customerId,
  sourceOfferId: offer.id,
  sourceOfferVersion: offer.version,
  sourceOfferSnapshot: structuredClone(offer),
  name: 'P0-B gerçekleşme',
  asOfDate: '2026-08-31',
  periodOverrides: [],
  actualPayments: [],
  createdAt: '2026-07-01',
  updatedAt: '2026-07-01',
  ...patch,
});

const assignedPayment = (
  offer: PlannedOffer,
  patch: Partial<ActualPayment> = {},
): ActualPayment => {
  const installment = buildReceivableInstallments(
    offer.resultSnapshot.periods,
    offer.resultSnapshot.plannedPayments,
  )[0]!;
  return {
    id: 'actual_payment_1',
    invoiceId: installment.invoiceId,
    receivableInstallmentId: installment.id,
    date: installment.dueDate,
    amount: installment.principalAmount,
    channel: 'credit_card_single',
    commissionRate: 2,
    commissionBearer: 'epsas',
    ...patch,
  };
};

describe('gerçekleşme finansman ufku ve override', () => {
  it('asOfDate sonrasındaki olayı cashflow dışında tutup ufku asOfDate gününde bitirir', () => {
    const offer = offerFor();
    const result = calculateRealization(
      scenarioFor(offer, {
        asOfDate: '2026-08-15',
        actualPayments: [
          assignedPayment(offer, { id: 'future', date: '2026-08-20' }),
        ],
      }),
    );
    expect(result.actualCashEvents?.some((event) => event.id === 'future')).toBe(false);
    expect(result.actualCashflow.at(-1)?.date).toBe('2026-08-15');
    expect(result.financingEndDate).toBe('2026-08-15');
  });

  it('override yoksa kaynak teklif kredi ve valör oranlarını kullanır', () => {
    const offer = offerFor({ creditRate: 31, valorRate: 17 });
    const result = calculateRealization(scenarioFor(offer));
    expect(result.effectiveCreditRate).toBe(31);
    expect(result.effectiveValorRate).toBe(17);
  });

  it('senaryo kredi oranı değişince actualCreditCost değişir', () => {
    const offer = offerFor({ creditRate: 5, valorRate: 0 });
    const base = calculateRealization(scenarioFor(offer));
    const overridden = calculateRealization(
      scenarioFor(offer, { financingOverrides: { creditRate: 50 } }),
    );
    expect(overridden.actualCreditCost).toBeGreaterThan(base.actualCreditCost);
  });

  it('senaryo valör oranı değişince actualValorIncome değişir', () => {
    const offer = offerFor({ creditRate: 0, valorRate: 0 });
    const advance = assignedPayment(offer, {
      date: '2026-07-01',
      amount: offer.resultSnapshot.totals.grossInvoice * 5,
      commissionRate: 0,
    });
    const baseScenario = scenarioFor(offer, { actualPayments: [advance] });
    const base = calculateRealization(baseScenario);
    const overridden = calculateRealization({
      ...baseScenario,
      financingOverrides: { valorRate: 40 },
    });
    expect(overridden.actualValorIncome).toBeGreaterThan(base.actualValorIncome);
  });

  it('finansman override kaynak teklif snapshotını değiştirmez', () => {
    const offer = offerFor();
    const before = JSON.stringify(offer);
    calculateRealization(
      scenarioFor(offer, { financingOverrides: { creditRate: 99, valorRate: 88 } }),
    );
    expect(JSON.stringify(offer)).toBe(before);
  });

  it('financingOverrides alanı olmayan eski senaryoyu güvenle hesaplar', () => {
    const offer = offerFor();
    const legacy = scenarioFor(offer);
    expect(calculateRealization(legacy).effectiveCreditRate).toBe(offer.stateSnapshot.creditRate);
  });

  it('planlanan son nakit olayında negatif bakiye kalırsa açık finansmanı snapshot ve uyarıda korur', () => {
    const plan = createPaymentPlan('standard_deferred');
    plan.rows[0]!.amountType = 'period_fixed_tl';
    plan.rows[0]!.amountValue = 1;
    plan.reconciliation.underpaymentAction = 'leave_open';
    const result = offerFor({ paymentPlan: plan }).resultSnapshot;
    expect(result.openFinancingBalance).toBeGreaterThan(0);
    expect(result.endingCashBalance).toBeLessThan(0);
    expect(result.warnings.join(' ')).toContain('açık finansman bakiyesi');
  });
});

describe('gerçek tahsilat kanal maliyeti', () => {
  it('vade diliminden planlı komisyon oranını ve ödeyen tarafını varsayılan getirir', () => {
    const plan = createPaymentPlan('standard_deferred');
    plan.rows[0]!.commissionRate = 2.75;
    plan.rows[0]!.commissionBearer = 'customer';
    plan.rows[0]!.paymentChannel = 'credit_card_single';
    const offer = offerFor({ paymentPlan: plan });
    const installments = buildReceivableInstallments(
      offer.resultSnapshot.periods,
      offer.resultSnapshot.plannedPayments,
    );
    expect(
      resolveActualPaymentCommissionDefaults(
        installments[0]!.id,
        installments,
        offer.resultSnapshot.plannedPayments,
      ),
    ).toMatchObject({
      commissionRate: 2.75,
      commissionBearer: 'customer',
      paymentChannel: 'credit_card_single',
    });
  });
  it('EPSAŞ komisyonunda brüt anaparayı kapatır, net nakdi ve kârı komisyon kadar azaltır', () => {
    const offer = offerFor({ creditRate: 0, valorRate: 0 });
    const payment = assignedPayment(offer);
    const withoutCommission = calculateRealization(
      scenarioFor(offer, {
        asOfDate: payment.date,
        actualPayments: [{ ...payment, commissionRate: 0 }],
      }),
    );
    const result = calculateRealization(
      scenarioFor(offer, { asOfDate: payment.date, actualPayments: [payment] }),
    );
    const commission = payment.amount * 0.02;
    expect(result.endingOpenReceivable).toBeCloseTo(0, 8);
    expect(result.actualPaymentFinancials[0]?.netCashIn).toBeCloseTo(payment.amount - commission, 8);
    expect(result.actualPaymentChannelCost).toBeCloseTo(commission, 8);
    expect(result.actualProfit).toBeCloseTo(withoutCommission.actualProfit - commission, 8);
  });

  it('müşteri komisyonunda EPSAŞ maliyetini ve kârı azaltmaz, kanal ücretini ayrı tutar', () => {
    const offer = offerFor({ creditRate: 0, valorRate: 0 });
    const payment = assignedPayment(offer, { commissionBearer: 'customer' });
    const base = calculateRealization(
      scenarioFor(offer, { asOfDate: payment.date, actualPayments: [{ ...payment, commissionRate: 0 }] }),
    );
    const result = calculateRealization(
      scenarioFor(offer, { asOfDate: payment.date, actualPayments: [payment] }),
    );
    expect(result.actualPaymentChannelCost).toBe(0);
    expect(result.actualPaymentFinancials[0]?.customerChannelFee).toBeCloseTo(
      payment.amount * 0.02,
      8,
    );
    expect(result.actualPaymentFinancials[0]?.netCashIn).toBeCloseTo(payment.amount, 8);
    expect(result.actualProfit).toBeCloseTo(base.actualProfit, 8);
  });

  it('kısmi tahsilat kanal maliyetini brüt kısmi tutardan hesaplar', () => {
    const offer = offerFor();
    const payment = assignedPayment(offer, { amount: 12_345, commissionRate: 1.75 });
    const result = calculateRealization(
      scenarioFor(offer, { asOfDate: payment.date, actualPayments: [payment] }),
    );
    expect(result.actualPaymentChannelCost).toBeCloseTo(12_345 * 0.0175, 10);
  });

  it('tek tahsilatın kanal maliyetini birden fazla faturaya ledger tahsis oranıyla dağıtır', () => {
    const offer = offerFor({
      usageEnd: '2026-08-31',
      monthlyConsumption: 31,
    });
    const amount = offer.resultSnapshot.totals.grossInvoice;
    const result = calculateRealization(
      scenarioFor(offer, {
        asOfDate: '2026-10-31',
        actualPayments: [
          {
            id: 'multi_invoice',
            date: '2026-10-01',
            amount,
            channel: 'credit_card_single',
            commissionRate: 3,
            commissionBearer: 'epsas',
          },
        ],
      }),
    );
    expect(result.receivableLedger.allocations.length).toBeGreaterThan(1);
    expect(result.periods.every((period) => period.actualPaymentChannelCost > 0)).toBe(true);
    expect(
      result.periods.reduce((total, period) => total + period.actualPaymentChannelCost, 0),
    ).toBeCloseTo(amount * 0.03, 8);
  });

  it('avans kalan tahsilatın kanal maliyetini sözleşme toplamından kaybetmez', () => {
    const offer = offerFor();
    const payment: ActualPayment = {
      id: 'advance',
      date: '2026-06-01',
      amount: 10_000,
      channel: 'credit_card_single',
      commissionRate: 4,
      commissionBearer: 'epsas',
    };
    const result = calculateRealization(
      scenarioFor(offer, { asOfDate: '2026-08-31', actualPayments: [payment] }),
    );
    expect(result.receivableLedger.customerAdvance).toBe(10_000);
    expect(sumProfitLedger(result.profitLedger.filter((entry) => entry.component === 'payment_channel_cost')))
      .toBeCloseTo(-400, 8);
    expect(result.periods.reduce((total, period) => total + period.actualPaymentChannelCost, 0))
      .toBeCloseTo(400, 8);
  });

  it('net nakitte düşülen kanal maliyetini günlük bakiyeden ikinci kez düşmez', () => {
    const offer = offerFor({ creditRate: 0, valorRate: 0 });
    const payment = assignedPayment(offer);
    const result = calculateRealization(
      scenarioFor(offer, { asOfDate: payment.date, actualPayments: [payment] }),
    );
    const day = result.actualCashflow.find((row) => row.date === payment.date)!;
    expect(day.customerInflows).toBeCloseTo(result.actualPaymentFinancials[0]!.netCashIn, 8);
    expect(day.closingBalance).toBeCloseTo(
      day.balanceAfterOutflows - day.creditInterest + day.valorInterest + day.customerInflows,
      8,
    );
  });
});

const marketPrices: MonthlyMarketPrice[] = [
  {
    month: '2026-07',
    forecastPtfTlMwh: 100,
    actualPtfTlMwh: 200,
    forecastYekdemTlMwh: 20,
    actualYekdemTlMwh: 30,
    updatedAt: '2026-07-01',
  },
];

const advancedGesState = (priceType: 'ptf' | 'ptf_yekdem'): Partial<OfferState> => ({
  creditRate: 0,
  valorRate: 0,
  ges: {
    mode: 'advanced_metering',
    selfConsumptionRate: 0,
    simultaneousSelfConsumptionMwh: 0,
    gridImportMwh: 31,
    gridExportMwh: 10,
    excessAfterNettingMwh: 10,
    priceType,
    excessProductionTaxMode: 'manual',
    settlementMode: 'cash_outflow',
  },
});

describe('gerçekleşen GES ihtiyaç fazlası', () => {
  it('PTF fiyat tipinde actual PTF ile gerçek GES alımını değiştirir', () => {
    const offer = offerFor(advancedGesState('ptf'), marketPrices);
    const result = calculateRealization(scenarioFor(offer), 5.55, marketPrices);
    expect(offer.resultSnapshot.totals.excessProductionPurchase).toBeCloseTo(1000, 8);
    expect(result.actualExcessProductionPurchase).toBeCloseTo(2000, 8);
    expect(
      result.actualCashEvents?.find((event) => event.type === 'excess_production_purchase'),
    ).toMatchObject({ amount: 2000, periodId: offer.resultSnapshot.periods[0]!.id });
  });

  it('PTF+YEKDEM fiyat tipinde iki actual fiyatı da GES alımına yansıtır', () => {
    const offer = offerFor(advancedGesState('ptf_yekdem'), marketPrices);
    const result = calculateRealization(scenarioFor(offer), 5.55, marketPrices);
    expect(result.actualExcessProductionPurchase).toBeCloseTo(10 * (200 + 30), 8);
  });

  it('gerçekleşen net kârdan actual GES ihtiyaç fazlası alımını düşer', () => {
    const offer = offerFor(advancedGesState('ptf'), marketPrices);
    const result = calculateRealization(scenarioFor(offer), 5.55, marketPrices);
    const withoutGesCost = result.profitLedger
      .filter((entry) => entry.component !== 'excess_production_purchase');
    expect(result.actualProfit).toBeCloseTo(
      sumProfitLedger(withoutGesCost) - result.actualExcessProductionPurchase,
      8,
    );
  });

  it('planlanan ve gerçekleşen GES alım tutarlarını ayrı snapshotlarda tutar', () => {
    const offer = offerFor(advancedGesState('ptf'), marketPrices);
    const before = offer.resultSnapshot.totals.excessProductionPurchase;
    const result = calculateRealization(scenarioFor(offer), 5.55, marketPrices);
    expect(result.actualExcessProductionPurchase).not.toBe(before);
    expect(offer.resultSnapshot.totals.excessProductionPurchase).toBe(before);
  });
});

describe('ortak profit ledger ve aylık mutabakat', () => {
  it('planlanan aylık tahakkuk toplamını ana net kâra eşitler', () => {
    const result = offerFor().resultSnapshot;
    expect(result.monthlyProfit.reduce((total, row) => total + row.accrualProfit, 0)).toBeCloseTo(
      result.totals.netProfit,
      8,
    );
  });

  it('planlanan aylık nakit toplamını günlük cashflow net etkisiyle mutabık tutar', () => {
    const result = offerFor().resultSnapshot;
    expect(result.monthlyProfit.reduce((total, row) => total + row.cashResult, 0)).toBeCloseTo(
      cashflowNetEffect(result.plannedCashflow),
      8,
    );
  });

  it('gerçekleşen aylık tahakkuk toplamını actualProfit ile mutabık tutar', () => {
    const offer = offerFor();
    const result = calculateRealization(scenarioFor(offer));
    expect(result.monthlyProfit.reduce((total, row) => total + row.accrualProfit, 0)).toBeCloseTo(
      result.actualProfit,
      8,
    );
  });

  it('dönemsel actualNetProfit toplamını actualProfit ile mutabık tutar', () => {
    const offer = offerFor({ usageEnd: '2026-08-31' });
    const result = calculateRealization(scenarioFor(offer));
    expect(result.periods.reduce((total, period) => total + period.actualNetProfit, 0)).toBeCloseTo(
      result.actualProfit,
      8,
    );
  });

  it('GES ihtiyaç fazlası maliyetini üretim/tüketim ekonomik ayına yazar', () => {
    const offer = offerFor(advancedGesState('ptf'), marketPrices);
    const result = calculateRealization(scenarioFor(offer), 5.55, marketPrices);
    expect(result.monthlyProfit.find((row) => row.month === '2026-07')?.excessProductionPurchase)
      .toBeCloseTo(result.actualExcessProductionPurchase, 8);
  });

  it('gecikme bedelini asOfDate ayına değil kaynak faturanın tüketim ayına yazar', () => {
    const offer = offerFor();
    const result = calculateRealization(scenarioFor(offer, { asOfDate: '2026-09-30' }));
    expect(result.totalLateFee).toBeGreaterThan(0);
    expect(result.monthlyProfit.find((row) => row.month === '2026-07')?.lateFeeIncome)
      .toBeCloseTo(result.totalLateFee, 8);
    expect(result.monthlyProfit.find((row) => row.month === '2026-09')?.lateFeeIncome ?? 0).toBe(0);
  });

  it('gecikme KDV tutarını profit ledger ve actualProfit dışında tutar', () => {
    const offer = offerFor();
    const result = calculateRealization(scenarioFor(offer, { asOfDate: '2026-09-30' }));
    expect(result.totalLateFeeVat).toBeGreaterThan(0);
    expect(result.profitLedger.some((entry) => entry.sourceId?.includes('vat'))).toBe(false);
    expect(sumProfitLedger(result.profitLedger)).toBeCloseTo(result.actualProfit, 8);
  });

  it('gerçek kanal maliyetini tahsilat ayına değil kaynak dönem ayına yazar', () => {
    const offer = offerFor();
    const payment = assignedPayment(offer, { date: '2026-08-20' });
    const result = calculateRealization(
      scenarioFor(offer, { asOfDate: '2026-08-31', actualPayments: [payment] }),
    );
    expect(result.monthlyProfit.find((row) => row.month === '2026-07')?.channelCost)
      .toBeCloseTo(result.actualPaymentChannelCost, 8);
  });

  it('kredi ve valör dönem tahsislerini sözleşme toplamlarıyla eşitler', () => {
    const offer = offerFor({ usageEnd: '2026-08-31' });
    const result = calculateRealization(scenarioFor(offer));
    expect(result.periods.reduce((total, period) => total + period.actualCreditCost, 0)).toBeCloseTo(
      result.actualCashflow.reduce((total, day) => total + day.creditInterest, 0),
      8,
    );
    expect(result.periods.reduce((total, period) => total + period.actualValorIncome, 0)).toBeCloseTo(
      result.actualCashflow.reduce((total, day) => total + day.valorInterest, 0),
      8,
    );
  });

  it('aylık nakit sonucu toplamını günlük cashflow net etkisiyle mutabık tutar', () => {
    const offer = offerFor();
    const payment = assignedPayment(offer);
    const result = calculateRealization(
      scenarioFor(offer, { actualPayments: [payment] }),
    );
    expect(result.monthlyProfit.reduce((total, row) => total + row.cashResult, 0)).toBeCloseTo(
      cashflowNetEffect(result.actualCashflow),
      8,
    );
  });

  it('kanal maliyetini net nakit ve cash outflow katmanlarında iki kez saymaz', () => {
    const offer = offerFor({ creditRate: 0, valorRate: 0 });
    const payment = assignedPayment(offer);
    const result = calculateRealization(
      scenarioFor(offer, { asOfDate: payment.date, actualPayments: [payment] }),
    );
    expect(result.monthlyProfit.reduce((total, row) => total + row.cashOutflows, 0)).toBeCloseTo(
      result.actualCashflow.reduce(
        (total, day) => total + day.supplierOutflows + day.refunds + day.creditInterest,
        0,
      ),
      8,
    );
  });
});
