import { useState } from 'react';
import { Download, FileJson, FileText, Printer } from 'lucide-react';
import { useAppStore } from '../../app/store/useAppStore';
import {
  buildCustomerOfferReport,
  customerOfferReportRows,
} from '../../domain/reporting/customerOfferReport';
import {
  buildInternalAnalysisReport,
  internalAnalysisReportRows,
} from '../../domain/reporting/internalAnalysisReport';
import { downloadText, toCsv } from '../../services/export/download';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDate, formatMoney } from '../../components/ui/format';
import { APP_VERSION } from '../../config/release';

type SupportedReportType = 'customer_offer' | 'internal_analysis';

const reportOptions: Array<{ value: string; label: string; supported: boolean }> = [
  { value: 'customer_offer', label: 'Müşteri Teklif Raporu', supported: true },
  { value: 'internal_analysis', label: 'İç Finansal Analiz Raporu', supported: true },
  { value: 'cost', label: 'Maliyet Analizi — Demo sürümünde hazırlanmadı', supported: false },
  { value: 'cash', label: 'Nakit Akışı — Demo sürümünde hazırlanmadı', supported: false },
  { value: 'comparison', label: 'Karşılaştırma — Demo sürümünde hazırlanmadı', supported: false },
  { value: 'late_fee', label: 'Gecikme Analizi — Demo sürümünde hazırlanmadı', supported: false },
];

export function ReportsPage() {
  const offers = useAppStore((state) => state.offers).filter((offer) => offer.status === 'final');
  const scenarios = useAppStore((state) => state.scenarios);
  const customers = useAppStore((state) => state.customers);
  const notify = useAppStore((state) => state.notify);
  const [reportType, setReportType] = useState<SupportedReportType>('customer_offer');
  const [offerId, setOfferId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const offer = offers.find((item) => item.id === offerId);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const customer = customers.find((item) => item.id === offer?.customerId);
  const report = !offer
    ? undefined
    : reportType === 'customer_offer'
      ? buildCustomerOfferReport(offer, customer)
      : buildInternalAnalysisReport(offer, customer, scenario);
  const rows = report
    ? reportType === 'customer_offer'
      ? customerOfferReportRows(report as ReturnType<typeof buildCustomerOfferReport>)
      : internalAnalysisReportRows(report as ReturnType<typeof buildInternalAnalysisReport>)
    : [];
  const fileStem = reportType === 'customer_offer' ? 'musteri-teklif' : 'ic-finansal-analiz';
  const exportCsv = () => {
    if (!report) return;
    downloadText(toCsv(rows), `k2-${fileStem}.csv`, 'text/csv;charset=utf-8');
    notify({ tone: 'success', title: 'Rapor oluşturuldu', detail: `${fileStem} · CSV` });
  };
  const exportJson = () => {
    if (!report) return;
    downloadText(JSON.stringify(report, null, 2), `k2-${fileStem}.json`, 'application/json');
    notify({ tone: 'success', title: 'Rapor oluşturuldu', detail: `${fileStem} · JSON` });
  };

  return (
    <div className={`print-surface ${reportType === 'customer_offer' ? 'customer-report' : 'internal-report'}`}>
      <PageHeader
        eyebrow="AYRI VE DENETLENEBİLİR ÇIKTILAR"
        title="Raporlar"
        description="Müşteriye gönderilebilir teklif ile şirket içi finansal analiz farklı domain view modellerinden üretilir."
        actions={report ? (
          <div className="page-actions no-print">
            <button className="button secondary" onClick={() => window.print()}><Printer size={16} /> PDF / Yazdır</button>
            <button className="button secondary" onClick={exportCsv}><Download size={16} /> CSV</button>
            <button className="button secondary" onClick={exportJson}><FileJson size={16} /> JSON</button>
          </div>
        ) : undefined}
      />
      <section className="panel report-builder no-print">
        <div className="form-grid three">
          <label className="field">
            <span>Rapor türü</span>
            <select value={reportType} onChange={(event) => setReportType(event.target.value as SupportedReportType)}>
              {reportOptions.map((option) => <option key={option.value} value={option.value} disabled={!option.supported}>{option.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Kaynak teklif</span>
            <select value={offerId} onChange={(event) => { setOfferId(event.target.value); setScenarioId(''); }}>
              <option value="">Teklif seçin</option>
              {offers.map((item) => <option key={item.id} value={item.id}>{customers.find((candidate) => candidate.id === item.customerId)?.name} · {item.title} · v{item.version}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Gerçekleşme senaryosu</span>
            <select value={scenarioId} disabled={!offerId || reportType === 'customer_offer'} onChange={(event) => setScenarioId(event.target.value)}>
              <option value="">İsteğe bağlı</option>
              {scenarios.filter((item) => item.sourceOfferId === offerId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </section>
      {!report ? (
        <EmptyState icon={FileText} title="Rapor kaynağı seçin" description="Desteklenen rapor türünü ve nihai teklifi seçin." />
      ) : reportType === 'customer_offer' ? (
        <CustomerReport report={report as ReturnType<typeof buildCustomerOfferReport>} />
      ) : (
        <InternalReport report={report as ReturnType<typeof buildInternalAnalysisReport>} />
      )}
    </div>
  );
}

function CustomerReport({ report }: { report: ReturnType<typeof buildCustomerOfferReport> }) {
  return (
    <article className="report-paper">
      <header><div className="report-brand">K2 <span>ENERJİPRO {APP_VERSION} · DEMO</span></div><strong>{report.classification}</strong></header>
      <section className="report-meta">
        <div><span>Müşteri</span><strong>{report.customer.name}</strong></div>
        <div><span>Teklif</span><strong>{report.offer.title} · v{report.offer.version}</strong></div>
        <div><span>Kullanım</span><strong>{formatDate(report.usage.start)} – {formatDate(report.usage.end)}</strong></div>
        <div><span>Müşteri tipi</span><strong>{report.usage.customerType}</strong></div>
        <div><span>Snapshot</span><strong>{new Date(report.offer.snapshotAt).toLocaleString('tr-TR')}</strong></div>
        <div><span>Politika</span><strong>{report.offer.policyVersion}</strong></div>
      </section>
      <div className="notice info">{report.offer.validityNote}</div>
      <section className="report-summary">
        <div><span>Toplam tüketim</span><strong>{report.totals.consumptionMwh.toFixed(3)} MWh</strong></div>
        <div><span>Toplam fatura</span><strong>{formatMoney(report.totals.grossInvoice)}</strong></div>
        <div><span>GES öz tüketim</span><strong>{report.totals.gesSelfConsumptionMwh.toFixed(3)} MWh</strong></div>
        <div><span>GES tasarrufu</span><strong>{formatMoney(report.totals.gesSelfConsumptionSavings)}</strong></div>
      </section>
      <h2>Dönem faturaları</h2>
      <table><thead><tr><th>Dönem</th><th>Aktif enerji</th><th>Dağıtım</th><th>BTV</th><th>KDV</th><th>Güç</th><th>Toplam</th><th>Tarife / piyasa kaynağı</th></tr></thead><tbody>
        {report.periods.map((period) => <tr key={period.period}><td>{period.period}</td><td>{formatMoney(period.activeEnergyAmount)}</td><td>{formatMoney(period.distributionAmount)}</td><td>{formatMoney(period.btvAmount)}</td><td>{formatMoney(period.kdvAmount)}</td><td>{formatMoney(period.contractPowerAmount)}</td><td>{formatMoney(period.grossInvoice)}</td><td>{period.tariffSource}<br /><small>Piyasa: {period.marketSnapshotMonth ?? 'snapshot yok'}</small></td></tr>)}
      </tbody></table>
      <h2>Ödeme planı</h2>
      <table><thead><tr><th>Tarih</th><th>Anapara</th><th>Müşteri kanal ücreti</th><th>Kanal</th><th>Taksit</th></tr></thead><tbody>
        {report.paymentPlan.map((payment, index) => <tr key={`${payment.date}-${index}`}><td>{formatDate(payment.date)}</td><td>{formatMoney(payment.principalAmount)}</td><td>{formatMoney(payment.customerChannelFee)}</td><td>{payment.channel}</td><td>{payment.installment}</td></tr>)}
      </tbody></table>
      <footer>{report.demoNotice}</footer>
    </article>
  );
}

function InternalReport({ report }: { report: ReturnType<typeof buildInternalAnalysisReport> }) {
  return (
    <article className="report-paper">
      <header><div className="report-brand">K2 <span>ENERJİPRO {APP_VERSION}</span></div><strong>{report.classification}</strong></header>
      <section className="report-meta">
        <div><span>Müşteri</span><strong>{report.customer.name}</strong></div>
        <div><span>Teklif</span><strong>{report.offer.title} · v{report.offer.version}</strong></div>
        <div><span>Politika</span><strong>{report.offer.policyVersion}</strong></div>
        <div><span>Hesaplama</span><strong>{new Date(report.offer.calculatedAt).toLocaleString('tr-TR')}</strong></div>
      </section>
      <section className="report-summary">
        <div><span>Net kâr</span><strong>{formatMoney(report.financials.netProfit)}</strong></div>
        <div><span>Kredi / valör</span><strong>{formatMoney(report.financials.creditCost)} / {formatMoney(report.financials.valorIncome)}</strong></div>
        <div><span>Açık finansman</span><strong>{formatMoney(report.financials.openFinancingBalance)}</strong></div>
        <div><span>Açık alacak / avans</span><strong>{formatMoney(report.financials.openReceivable)} / {formatMoney(report.financials.customerAdvance)}</strong></div>
        <div><span>Teklif marjı</span><strong>{formatMoney(report.financials.offerMargin)}</strong></div>
        <div><span>Dengesizlik / PİÜ</span><strong>{formatMoney(report.financials.imbalance)} / {formatMoney(report.financials.piu)}</strong></div>
        <div><span>Kanal / GES</span><strong>{formatMoney(report.financials.paymentChannelCost)} / {formatMoney(report.financials.excessProductionPurchase)}</strong></div>
        <div><span>Birim kâr / başabaş</span><strong>{report.financials.profitPerMwh.toFixed(2)} TL/MWh · %{report.financials.breakevenOfferRate.toFixed(2)}</strong></div>
      </section>
      <h2>Piyasa fiyat snapshot’ı</h2>
      <table><thead><tr><th>Ay</th><th>PTF</th><th>Kaynak</th><th>YEKDEM</th><th>Kaynak</th></tr></thead><tbody>
        {report.offer.marketPriceSnapshot.map((item) => <tr key={item.month}><td>{item.month}</td><td>{item.ptfUnitPrice.toFixed(3)}</td><td>{item.ptfPriceSource}</td><td>{item.yekdemUnitPrice.toFixed(3)}</td><td>{item.yekdemPriceSource}</td></tr>)}
      </tbody></table>
      <h2>Tarife snapshot’ı ve manuel override</h2>
      <table><thead><tr><th>Dönem</th><th>Tarife / versiyon</th><th>Geçerlilik</th><th>KDV / BTV / dağıtım</th><th>Override nedeni</th></tr></thead><tbody>
        {report.offer.tariffSnapshots.map((item, index) => <tr key={`${item?.tariffId ?? 'legacy'}-${index}`}><td>{index + 1}</td><td>{item ? `${item.sourceLabel} · ${item.versionLabel}` : 'Legacy snapshot'}</td><td>{item ? `${item.validFrom ?? '—'} – ${item.validTo ?? 'açık'}` : 'Metadata yok'}</td><td>{item ? `%${item.kdvRate} / %${item.btvRate} / ${item.distributionUnitTlMwh.toFixed(3)}` : 'Kayıtlı sayısal snapshot'}</td><td>{item?.overrideReason ?? '—'}</td></tr>)}
      </tbody></table>
      <h2>Mutabakat talimatları</h2>
      <table><thead><tr><th>Tür</th><th>Dönem</th><th>Tutar</th><th>Not</th></tr></thead><tbody>
        {report.reconciliationInstructions.map((item) => <tr key={item.id}><td>{item.type}</td><td>{item.periodId}</td><td>{formatMoney(item.amount)}</td><td>{item.note}</td></tr>)}
      </tbody></table>
      <h2>Profit ledger</h2>
      <table><thead><tr><th>Ay</th><th>Bileşen</th><th>Yön</th><th>Tutar</th></tr></thead><tbody>
        {report.profitLedger.map((item) => <tr key={item.id}><td>{item.economicMonth}</td><td>{item.component}</td><td>{item.direction}</td><td>{formatMoney(item.amount)}</td></tr>)}
      </tbody></table>
      <h2>Aylık tahakkuk ve nakit</h2>
      <table><thead><tr><th>Ay</th><th>Tahakkuk kârı</th><th>Nakit girişi</th><th>Nakit çıkışı</th><th>Nakit sonucu</th><th>Mutabakat farkı</th></tr></thead><tbody>
        {report.monthlyProfit.map((item) => <tr key={item.month}><td>{item.month}</td><td>{formatMoney(item.accrualProfit)}</td><td>{formatMoney(item.cashInflows)}</td><td>{formatMoney(item.cashOutflows)}</td><td>{formatMoney(item.cashResult)}</td><td>{formatMoney(item.reconciliationDifference)}</td></tr>)}
      </tbody></table>
      <h2>Gecikme ve uyarılar</h2>
      <section className="report-summary">
        <div><span>Gecikme bedeli</span><strong>{formatMoney(report.lateFee?.amount ?? 0)}</strong></div>
        <div><span>Gecikme KDV’si</span><strong>{formatMoney(report.lateFee?.vat ?? 0)}</strong></div>
        <div><span>Belge</span><strong>{report.lateFee?.documents.length ?? 0}</strong></div>
        <div><span>Uyarı</span><strong>{report.warnings.length}</strong></div>
      </section>
      {report.warnings.map((warning) => <div className="notice warning" key={warning}>{warning}</div>)}
      <footer>{report.classification} · Manuel override nedenleri ve risk notları yalnız bu çıktıda yer alır.</footer>
    </article>
  );
}
