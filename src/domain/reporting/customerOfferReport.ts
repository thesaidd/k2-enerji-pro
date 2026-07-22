import type { Customer, PlannedOffer } from '../../types';

export interface CustomerOfferReportModel {
  reportType: 'customer_offer';
  classification: 'DEMO — RESMÎ FATURA DEĞİLDİR';
  demoNotice: string;
  customer: { name: string };
  offer: {
    title: string;
    version: number;
    snapshotAt: string;
    policyVersion: string;
    validityNote: string;
  };
  usage: { start: string; end: string; customerType: string };
  totals: {
    consumptionMwh: number;
    grossInvoice: number;
    gesSelfConsumptionMwh: number;
    gesSelfConsumptionSavings: number;
  };
  periods: Array<{
    period: number;
    start: string;
    end: string;
    consumptionMwh: number;
    activeEnergyUnitPrice: number;
    activeEnergyAmount: number;
    distributionAmount: number;
    contractPowerAmount: number;
    btvAmount: number;
    kdvAmount: number;
    grossInvoice: number;
    tariffSource: string;
    marketSnapshotMonth?: string;
  }>;
  paymentPlan: Array<{
    date: string;
    principalAmount: number;
    customerChannelFee: number;
    channel: string;
    installment: string;
  }>;
}

export const buildCustomerOfferReport = (
  offer: PlannedOffer,
  customer?: Customer,
): CustomerOfferReportModel => {
  const result = offer.resultSnapshot;
  return {
    reportType: 'customer_offer',
    classification: 'DEMO — RESMÎ FATURA DEĞİLDİR',
    demoNotice:
      'K2 EnerjiPro Demo çıktısıdır. Yerel tarayıcı verisi kullanır; resmî fatura veya muhasebe belgesi değildir.',
    customer: { name: customer?.name ?? 'Müşteri' },
    offer: {
      title: offer.title,
      version: offer.version,
      snapshotAt: result.calculatedAt,
      policyVersion: result.policyVersion,
      validityNote: 'Demo teklifidir; nihai sözleşme, resmî fatura veya muhasebe belgesi değildir.',
    },
    usage: {
      start: offer.stateSnapshot.usageStart,
      end: offer.stateSnapshot.usageEnd,
      customerType: offer.stateSnapshot.customerType,
    },
    totals: {
      consumptionMwh: result.totals.gridConsumptionMwh,
      grossInvoice: result.totals.grossInvoice,
      gesSelfConsumptionMwh: result.totals.gesSelfConsumptionMwh,
      gesSelfConsumptionSavings: result.totals.gesSelfConsumptionSavings,
    },
    periods: result.periods.map((period) => ({
      period: period.index,
      start: period.start,
      end: period.end,
      consumptionMwh: period.gridConsumptionMwh,
      activeEnergyUnitPrice: period.activeEnergyUnitPrice,
      activeEnergyAmount: period.activeEnergySalesAmount,
      distributionAmount: period.distributionAmount,
      contractPowerAmount: period.contractPowerAmount,
      btvAmount: period.btvAmount,
      kdvAmount: period.kdvAmount,
      grossInvoice: period.grossInvoice,
      tariffSource: period.tariffSnapshot
        ? `${period.tariffSnapshot.sourceLabel} · ${period.tariffSnapshot.versionLabel}`
        : 'Legacy snapshot — tarife kaynak metadata’sı bulunmuyor',
      marketSnapshotMonth: period.marketPriceMonth,
    })),
    paymentPlan: result.plannedPayments.map((payment) => ({
      date: payment.transactionDate,
      principalAmount: payment.principalAmount,
      customerChannelFee: payment.customerChannelFee,
      channel: payment.paymentChannel,
      installment: `${payment.installmentNo}/${payment.installmentCount}`,
    })),
  };
};

export const customerOfferReportRows = (report: CustomerOfferReportModel): unknown[][] => [
  ['K2 EnerjiPro Demo — Müşteri Teklif Raporu'],
  [report.classification],
  ['Müşteri', report.customer.name],
  ['Teklif', report.offer.title],
  ['Versiyon', report.offer.version],
  ['Snapshot tarihi', report.offer.snapshotAt],
  ['Hesaplama politikası', report.offer.policyVersion],
  ['Teklif geçerlilik notu', report.offer.validityNote],
  ['Kullanım', `${report.usage.start} / ${report.usage.end}`],
  ['Müşteri tipi', report.usage.customerType],
  ['Toplam fatura', report.totals.grossInvoice],
  [],
  ['Dönem', 'Tüketim MWh', 'Aktif enerji', 'Dağıtım', 'BTV', 'KDV', 'Sözleşme gücü', 'Toplam', 'Tarife / piyasa kaynağı'],
  ...report.periods.map((period) => [
    period.period,
    period.consumptionMwh,
    period.activeEnergyAmount,
    period.distributionAmount,
    period.btvAmount,
    period.kdvAmount,
    period.contractPowerAmount,
    period.grossInvoice,
    `${period.tariffSource} · piyasa ${period.marketSnapshotMonth ?? 'snapshot yok'}`,
  ]),
  [],
  ['Tahsilat tarihi', 'Anapara', 'Müşteri kanal ücreti', 'Kanal', 'Taksit'],
  ...report.paymentPlan.map((payment) => [
    payment.date,
    payment.principalAmount,
    payment.customerChannelFee,
    payment.channel,
    payment.installment,
  ]),
  [],
  [report.demoNotice],
];
