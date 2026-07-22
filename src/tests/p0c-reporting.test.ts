import { describe, expect, it } from 'vitest';
import { calculateOffer } from '../domain/profitability/calculation';
import {
  buildCustomerOfferReport,
  customerOfferReportRows,
} from '../domain/reporting/customerOfferReport';
import {
  buildInternalAnalysisReport,
  internalAnalysisReportRows,
} from '../domain/reporting/internalAnalysisReport';
import { oneMwhState } from './helpers';
import type { Customer, PlannedOffer } from '../types';

const fixture = () => {
  const result = calculateOffer(
    oneMwhState({
      offerRate: 7,
      tariffOverrides: [
        {
          month: '2026-07',
          kdvRate: 20,
          btvRate: 1,
          distributionUnitTlMwh: 500,
          reason: 'İç onay kodu GİZLİ-42',
        },
      ],
    }),
  );
  const customer: Customer = {
    id: 'customer',
    name: 'Rapor Müşterisi',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isArchived: false,
  };
  const offer: PlannedOffer = {
    id: 'offer',
    recordType: 'planned_offer',
    customerId: customer.id,
    version: 1,
    title: 'Rapor Teklifi',
    status: 'final',
    stateSnapshot: result.state,
    paymentPlanSnapshot: result.state.paymentPlan,
    resultSnapshot: result,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return { customer, offer };
};

describe('P0-C ayrı rapor view modelleri', () => {
  it('müşteri ekran/JSON/CSV modelinden iç finansal alanları dışlar', () => {
    const { customer, offer } = fixture();
    const report = buildCustomerOfferReport(offer, customer);
    const serialized = JSON.stringify({ report, rows: customerOfferReportRows(report) }).toLocaleLowerCase('tr-TR');
    for (const forbidden of [
      'netprofit',
      'net kâr',
      'creditcost',
      'kredi maliyeti',
      'valorincome',
      'profitledger',
      'gizli-42',
    ])
      expect(serialized).not.toContain(forbidden);
    expect(serialized).toContain('demo — resmî fatura değildir'.toLocaleLowerCase('tr-TR'));
  });

  it('iç raporda net kâr, finansman, ledger ve override nedeni bulunur', () => {
    const { customer, offer } = fixture();
    const report = buildInternalAnalysisReport(offer, customer);
    expect(report.classification).toBe('ŞİRKET İÇİ / GİZLİ');
    expect(report.financials.netProfit).toBe(offer.resultSnapshot.totals.netProfit);
    expect(report.financials.creditCost).toBe(offer.resultSnapshot.totals.creditCost);
    expect(report.profitLedger).toEqual(offer.resultSnapshot.profitLedger);
    expect(JSON.stringify(report)).toContain('İç onay kodu GİZLİ-42');
  });

  it('müşteri satırlarında güvenli snapshot kaynağını, iç satırlarda denetim ayrıntılarını gösterir', () => {
    const { customer, offer } = fixture();
    const customerRows = JSON.stringify(
      customerOfferReportRows(buildCustomerOfferReport(offer, customer)),
    );
    const internalRows = JSON.stringify(
      internalAnalysisReportRows(buildInternalAnalysisReport(offer, customer)),
    );

    expect(customerRows).toContain('Tarife / piyasa kaynağı');
    expect(customerRows).toContain('2026 demo referans tarife tablosu');
    expect(customerRows).not.toContain('İç onay kodu GİZLİ-42');
    expect(internalRows).toContain('İç onay kodu GİZLİ-42');
    expect(internalRows).toContain('Aylık tahakkuk ve nakit');
    expect(internalRows).toContain('Profit ledger');
    expect(internalRows).toContain('Tarife snapshot');
  });

  it('raporları kayıtlı snapshot değerlerinden üretir ve yeniden hesaplamaz', () => {
    const { customer, offer } = fixture();
    const storedInvoice = offer.resultSnapshot.totals.grossInvoice;
    offer.stateSnapshot.ptfTlMwh = 999_999;
    expect(buildCustomerOfferReport(offer, customer).totals.grossInvoice).toBe(storedInvoice);
  });
});
