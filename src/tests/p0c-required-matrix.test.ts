import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFER_STATE, DEFAULT_SETTINGS } from '../config/defaults';
import { createPaymentPlan } from '../config/paymentPlans';
import { DEFAULT_TARIFF_VERSIONS } from '../config/tariffs';
import { buildDailyCashflow } from '../domain/financing/financing';
import { calculateGesPeriod } from '../domain/ges/ges';
import { calculateLateFee } from '../domain/late-fee/lateFee';
import { resolveForecastMarketPrices } from '../domain/market-prices/marketPrices';
import { calculateActualPaymentFinancials } from '../domain/payment-plan/actualPaymentFinancials';
import { calculateOffer } from '../domain/profitability/calculation';
import { applyPlannedReconciliation } from '../domain/reconciliation/reconciliation';
import { buildCustomerOfferReport, customerOfferReportRows } from '../domain/reporting/customerOfferReport';
import { buildInternalAnalysisReport, internalAnalysisReportRows } from '../domain/reporting/internalAnalysisReport';
import { resolveTariffForPeriod } from '../domain/tariff/tariff';
import { prepareRestore, BACKUP_SCHEMA_VERSION, type BackupCollections } from '../services/storage/DataPortabilityService';
import type { BillingPeriod, Customer, PlannedOffer, PlannedPayment, RealizationScenario, TariffVersion } from '../types';

const billing = (index = 1, grossInvoice = 100): BillingPeriod =>
  ({
    id: `period-${index}`,
    index,
    start: `2026-0${index}-01`,
    end: `2026-0${index}-28`,
    invoiceDate: `2026-0${index}-28`,
    days: 28,
    monthFactor: 1,
    share: 1,
    grossInvoice,
  }) as BillingPeriod;

const planned = (periodId: string, amount: number): PlannedPayment => ({
  id: `pay-${periodId}`,
  periodId,
  planRowId: 'row',
  planRowName: 'Plan',
  transactionDate: '2026-01-28',
  settlementDate: '2026-01-28',
  paymentChannel: 'eft',
  commissionRate: 0,
  commissionBearer: 'epsas',
  principalAmount: amount,
  epsasChannelCost: 0,
  customerChannelFee: 0,
  netCashIn: amount,
  installmentNo: 1,
  installmentCount: 1,
});

const reconciliation = (patch = {}) => ({ ...createPaymentPlan().reconciliation, ...patch });

const offerFixture = () => {
  const customer: Customer = { id: 'c', name: 'Müşteri', createdAt: '2026-01-01', updatedAt: '2026-01-01', isArchived: false };
  const result = calculateOffer({ ...structuredClone(DEFAULT_OFFER_STATE), customerId: 'c', usageStart: '2026-07-01', usageEnd: '2026-07-31', offerRate: 5 });
  const offer: PlannedOffer = { id: 'o', recordType: 'planned_offer', customerId: 'c', version: 1, title: 'Teklif', status: 'final', stateSnapshot: result.state, paymentPlanSnapshot: result.state.paymentPlan, resultSnapshot: result, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  return { customer, offer };
};

const backupFixture = (): BackupCollections => {
  const { customer, offer } = offerFixture();
  return { customers: [customer], costDrafts: [], plannedOffers: [offer], realizationScenarios: [], settings: [structuredClone(DEFAULT_SETTINGS)] };
};

describe('P0-C mutabakat zorunlu ek senaryoları', () => {
  it('refund_at_contract_end kalan avansı yalnız bir kez iade eder', () => {
    const result = applyPlannedReconciliation([billing()], [planned('period-1', 150)], reconciliation({ overpaymentAction: 'refund_at_contract_end' }), '2026-01-01', '2026-01-28');
    expect(result.cashEvents.filter((event) => event.type === 'customer_refund')).toHaveLength(1);
    expect(result.cashEvents[0]?.amount).toBe(50);
  });
  it('iade tarihi özel tatilse ilk iş gününe taşır', () => {
    const result = applyPlannedReconciliation([billing()], [planned('period-1', 150)], reconciliation({ overpaymentAction: 'refund_after_days', refundOffsetDays: 1 }), '2026-01-01', '2026-01-28', ['2026-01-29', '2026-01-30']);
    expect(result.cashEvents[0]?.date).toBe('2026-02-02');
  });
  it('müşteri komisyonu EPSAŞ kanal maliyeti oluşturmaz', () => {
    const result = applyPlannedReconciliation([billing()], [planned('period-1', 40)], reconciliation({ underpaymentAction: 'collect_after_days', collectionCommissionRate: 5, collectionCommissionBearer: 'customer' }), '2026-01-01', '2026-01-28');
    const supplement = result.payments.find((payment) => payment.planRowId === 'reconciliation')!;
    expect(supplement.epsasChannelCost).toBe(0);
    expect(supplement.customerChannelFee).toBe(3);
  });
  it('tamamlayıcı tahsilat planlanan kaynaklı talimat üretir', () => {
    const result = applyPlannedReconciliation([billing()], [], reconciliation(), '2026-01-01', '2026-01-28');
    expect(result.instructions[0]).toMatchObject({ type: 'supplemental_collection', source: 'planned' });
  });
  it('mutabakat kapalı uyarısı sessiz borç kapatmaz', () => {
    const result = applyPlannedReconciliation([billing()], [], reconciliation({ enabled: false }), '2026-01-01', '2026-01-28');
    expect(result.endingReceivable).toBe(100);
    expect(result.warnings.join(' ')).toContain('mutabakat kapalı');
  });
  it('fazla ödeme taşıma talimatı anapara kadar oluşur', () => {
    const result = applyPlannedReconciliation([billing()], [planned('period-1', 130)], reconciliation({ overpaymentAction: 'carry_forward' }), '2026-01-01', '2026-01-28');
    expect(result.instructions[0]).toMatchObject({ type: 'carry_advance_forward', amount: 30 });
  });
  it('planlanan müşteri iadesi dış yönlü nakit olayıdır', () => {
    const result = applyPlannedReconciliation([billing()], [planned('period-1', 130)], reconciliation({ overpaymentAction: 'refund_after_days' }), '2026-01-01', '2026-01-28');
    expect(result.cashEvents[0]).toMatchObject({ direction: 'out', type: 'customer_refund' });
  });
  it('son dönem carry_to_next_invoice açık alacak ve uyarı bırakır', () => {
    const result = applyPlannedReconciliation([billing()], [], reconciliation({ underpaymentAction: 'carry_to_next_invoice' }), '2026-01-01', '2026-01-28');
    expect(result.endingReceivable).toBe(100);
    expect(result.warnings.join(' ')).toContain('Son dönemde');
  });
  it('komisyonsuz iade planlanan net kâr bileşenlerine girmez', () => {
    const exactPlan = createPaymentPlan('standard_deferred');
    const overPlan = structuredClone(exactPlan);
    overPlan.rows[0]!.amountType = 'period_invoice_percent';
    overPlan.rows[0]!.amountValue = 120;
    overPlan.reconciliation.overpaymentAction = 'refund_after_days';
    const base = { ...structuredClone(DEFAULT_OFFER_STATE), usageStart: '2026-07-01', usageEnd: '2026-07-31', offerRate: 5, creditRate: 0, valorRate: 0 };
    expect(calculateOffer({ ...base, paymentPlan: overPlan }).totals.netProfit).toBeCloseTo(calculateOffer({ ...base, paymentPlan: exactPlan }).totals.netProfit, 8);
  });
});

describe('P0-C GES zorunlu ek senaryoları', () => {
  const advanced = { mode: 'advanced_metering' as const, selfConsumptionRate: 0, totalProductionMwh: 100, simultaneousSelfConsumptionMwh: 20, gridImportMwh: 80, gridExportMwh: 30, excessAfterNettingMwh: 10, priceType: 'manual' as const, excessPurchasePrice: 500, nettingMethod: 'manual' as const, settlementMode: 'cash_outflow' as const, excessProductionTaxMode: 'no_tax_in_demo' as const, excessPurchasePaymentOffsetDays: 10 };
  it('simple self-consumption ihtiyaç fazlası ve nakit tutarı üretmez', () => expect(calculateGesPeriod(100, 1, { mode: 'simple_self_consumption', selfConsumptionRate: 20 }, 1000, 100)).toMatchObject({ selfConsumptionMwh: 20, gridConsumptionMwh: 80, excessPurchaseAmount: 0 }));
  it('manual mahsuplaşma kullanıcının nihai miktarını kullanır', () => expect(calculateGesPeriod(100, 1, advanced, 1000, 100).excessProductionMwh).toBe(10));
  it('monthly mahsuplaşma açık nihai fazla miktarını kullanır', () => expect(calculateGesPeriod(100, 1, { ...advanced, nettingMethod: 'monthly' }, 1000, 100).excessProductionMwh).toBe(10));
  it('manuel sabit vergi/maliyet tutarını alıma ekler', () => expect(calculateGesPeriod(100, 1, { ...advanced, excessProductionTaxMode: 'manual', manualTaxAmountTl: 25 }, 1000, 100).excessPurchaseAmount).toBe(5025));
  it('legacy GES ödeme offseti yoksa on gün kullanır', () => {
    const result = calculateOffer({ ...structuredClone(DEFAULT_OFFER_STATE), usageStart: '2026-07-01', usageEnd: '2026-07-31', offerRate: 5, ges: { ...advanced, excessPurchasePaymentOffsetDays: undefined } });
    expect(result.cashEvents.find((event) => event.type === 'excess_production_purchase')?.date).toBe('2026-08-10');
  });
  it('GES alım maliyeti profit ledgerda tek kez yer alır', () => {
    const result = calculateOffer({ ...structuredClone(DEFAULT_OFFER_STATE), usageStart: '2026-07-01', usageEnd: '2026-07-31', offerRate: 5, ges: advanced });
    expect(result.profitLedger.filter((entry) => entry.component === 'excess_production_purchase')).toHaveLength(1);
  });
});

describe('P0-C tarife zorunlu ek senaryoları', () => {
  const base = DEFAULT_TARIFF_VERSIONS.find((item) => item.customerType === DEFAULT_OFFER_STATE.customerType)!;
  it('aynı dönemi kapsayan iki tarife kaydını reddeder', () => expect(resolveTariffForPeriod(base.customerType, '2026-07-01', '2026-07-31', [base, { ...base, id: 'other' }]).error).toContain('birden fazla'));
  it('dağıtımsız modelde katalog bedelini faturaya eklemez', () => expect(calculateOffer({ ...structuredClone(DEFAULT_OFFER_STATE), usageStart: '2026-07-01', usageEnd: '2026-07-31', hasDistribution: false, offerRate: 5 }).totals.distributionAmount).toBe(0));
  it('legacy sayısal tarife değerlerini metadata uyarısıyla korur', () => {
    const result = calculateOffer({ ...structuredClone(DEFAULT_OFFER_STATE), usageStart: '2026-07-01', usageEnd: '2026-07-31', distributionUnitTlMwh: 123, tariffSourceMode: 'legacy_numeric', offerRate: 5 });
    expect(result.periods[0]?.tariffSnapshot).toMatchObject({ distributionUnitTlMwh: 123, sourceMode: 'legacy_numeric', manualOverride: true });
  });
  it('manuel override kaynak katalog nesnesini değiştirmez', () => {
    const versions: TariffVersion[] = [structuredClone(base)];
    resolveTariffForPeriod(base.customerType, '2026-07-01', '2026-07-31', versions, [{ month: '2026-07', kdvRate: 1, btvRate: 2, distributionUnitTlMwh: 3, reason: 'Test' }]);
    expect(versions[0]).toEqual(base);
  });
});

describe('P0-C raporlama zorunlu ek senaryoları', () => {
  it('müşteri raporu müşteri adını ve kullanım tarihlerini taşır', () => { const { customer, offer } = offerFixture(); expect(buildCustomerOfferReport(offer, customer)).toMatchObject({ customer: { name: 'Müşteri' }, usage: { start: '2026-07-01', end: '2026-07-31' } }); });
  it('müşteri raporu ödeme tarihlerini snapshot planından alır', () => { const { customer, offer } = offerFixture(); expect(buildCustomerOfferReport(offer, customer).paymentPlan[0]?.date).toBe(offer.resultSnapshot.plannedPayments[0]?.transactionDate); });
  it('müşteri CSV satırlarında şirket içi sınıflandırma bulunmaz', () => { const { customer, offer } = offerFixture(); expect(JSON.stringify(customerOfferReportRows(buildCustomerOfferReport(offer, customer)))).not.toContain('ŞİRKET İÇİ'); });
  it('müşteri raporu manuel override iç nedenini taşımaz', () => { const { customer, offer } = offerFixture(); offer.resultSnapshot.periods[0]!.tariffSnapshot!.overrideReason = 'Gizli neden'; expect(JSON.stringify(buildCustomerOfferReport(offer, customer))).not.toContain('Gizli neden'); });
  it('iç rapor policy ve aylık tahakkuk snapshotını taşır', () => { const { customer, offer } = offerFixture(); const report = buildInternalAnalysisReport(offer, customer); expect(report.offer.policyVersion).toBe(offer.resultSnapshot.policyVersion); expect(report.monthlyProfit).toEqual(offer.resultSnapshot.monthlyProfit); });
  it('iç rapor satırlarında net kâr ve açık finansman bulunur', () => { const { customer, offer } = offerFixture(); const rows = JSON.stringify(internalAnalysisReportRows(buildInternalAnalysisReport(offer, customer))); expect(rows).toContain('Net kâr'); expect(rows).toContain('Açık finansman bakiyesi'); });
});

describe('P0-C backup zorunlu ek senaryoları', () => {
  const envelope = (payload: BackupCollections) => ({ format: 'K2-ENERJIPRO', schemaVersion: BACKUP_SCHEMA_VERSION, appVersion: '3.0.0', exportedAt: '2026-01-01T00:00:00.000Z', payload });
  it('desteklenmeyen schema sürümünü reddeder', () => expect(() => prepareRestore({ ...envelope(backupFixture()), schemaVersion: 999 })).toThrow(/şema sürümü/i));
  it('geçersiz ISO tarihi reddeder', () => { const data = backupFixture(); data.plannedOffers[0]!.stateSnapshot.usageStart = 'bugün'; expect(() => prepareRestore(envelope(data))).toThrow(/ISO tarih/i); });
  it('yinelenen teklif idlerini reddeder', () => { const data = backupFixture(); data.plannedOffers.push(structuredClone(data.plannedOffers[0]!)); expect(() => prepareRestore(envelope(data))).toThrow(/yinelenen id/i); });
  it('eksik scenario kaynak teklifini reddeder', () => { const data = backupFixture(); const { offer } = offerFixture(); data.realizationScenarios.push({ id: 's', sourceCustomerId: 'c', sourceOfferId: 'missing', sourceOfferVersion: 1, sourceOfferSnapshot: offer, name: 's', asOfDate: '2026-07-31', periodOverrides: [], actualPayments: [], resultSnapshot: {} as RealizationScenario['resultSnapshot'], createdAt: 'x', updatedAt: 'x' }); expect(() => prepareRestore(envelope(data))).toThrow(/kaynak teklif bulunamadı/i); });
  it('negatif müşteri tahsilatını reddeder', () => { const data = backupFixture(); data.plannedOffers[0]!.resultSnapshot.plannedPayments[0]!.principalAmount = -1; expect(() => prepareRestore(envelope(data))).toThrow(/negatif olamaz/i); });
  it('legacy zarf için migration ve warning özeti üretir', () => { const preview = prepareRestore({ version: 'K2-ENERJIPRO-3.0', exportedAt: '', ...backupFixture() }); expect(preview.migrationRecords).toBe(1); expect(preview.warnings.length).toBeGreaterThan(0); });
  it('legacy scenario actualRefunds alanını boş diziye normalize eder', () => { const data = backupFixture(); const { offer } = offerFixture(); data.realizationScenarios.push({ id: 's', sourceCustomerId: 'c', sourceOfferId: 'o', sourceOfferVersion: 1, sourceOfferSnapshot: offer, name: 's', asOfDate: '2026-07-31', periodOverrides: [], actualPayments: [], resultSnapshot: {} as RealizationScenario['resultSnapshot'], createdAt: 'x', updatedAt: 'x' }); const preview = prepareRestore(envelope(data)); expect(preview.payload.realizationScenarios[0]?.actualRefunds).toEqual([]); });
});

describe('P0-C korunmuş regresyon invariantları', () => {
  it('gecikme oranı %5,55, 360 gün ve basit faizle çalışır', () => expect(calculateLateFee(1000, 30, 5.55)).toBeCloseTo(55.5, 8));
  it('negatif bakiyede yalnız kredi faizi üretir', () => { const rows = buildDailyCashflow([{ id: 'x', date: '2026-01-01', type: 'ptf', direction: 'out', amount: 100, label: 'x' }], 36.5, 20); expect(rows[0]?.creditInterest).toBeCloseTo(0.1, 8); expect(rows[0]?.valorInterest).toBe(0); });
  it('pozitif bakiyede yalnız valör faizi üretir', () => { const rows = buildDailyCashflow([{ id: 'x', date: '2026-01-01', type: 'customer_payment', direction: 'in', amount: 100, label: 'x' }, { id: 'y', date: '2026-01-02', type: 'customer_payment', direction: 'in', amount: 0, label: 'y' }], 36.5, 36.5); expect(rows[1]?.creditInterest).toBe(0); expect(rows[1]?.valorInterest).toBeCloseTo(0.1, 8); });
  it('EPSAŞ komisyonunu net nakitten bir kez düşer', () => expect(calculateActualPaymentFinancials({ id: 'p', date: '2026-01-01', amount: 100, channel: 'eft', commissionRate: 2, commissionBearer: 'epsas' }).netCashIn).toBe(98));
  it('aylık piyasa eksikliğini açık hata yapar', () => expect(resolveForecastMarketPrices(['2026-07'], [], 0, 0).errors.length).toBeGreaterThan(0));
  it('geçersiz finansman tarihi domain motorunda reddedilir', () => expect(() => buildDailyCashflow([], 1, 1, { calculationStartDate: '', calculationEndDate: '2026-01-01' })).toThrow(/Geçersiz finansman tarihi/));
  it('kaynak teklif snapshotı yeni hesaplamada mutate edilmez', () => { const { offer } = offerFixture(); const before = JSON.stringify(offer); calculateOffer({ ...offer.stateSnapshot, offerRate: 9 }); expect(JSON.stringify(offer)).toBe(before); });
  it('fatura BTV ve KDV matrah sırasını korur', () => { const result = calculateOffer({ ...structuredClone(DEFAULT_OFFER_STATE), usageStart: '2026-07-01', usageEnd: '2026-07-31', offerRate: 10, creditRate: 0, valorRate: 0 }); const period = result.periods[0]!; expect(period.btvBase).toBe(period.activeEnergySalesAmount); expect(period.kdvBase).toBeCloseTo(period.activeEnergySalesAmount + period.distributionAmount + period.contractPowerAmount + period.btvAmount, 8); });
});
