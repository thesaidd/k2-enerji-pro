import { useState } from 'react';
import { Download, FileJson, FileText, Printer } from 'lucide-react';
import { useAppStore } from '../../app/store/useAppStore';
import { downloadText, toCsv } from '../../services/export/download';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDate, formatMoney } from '../../components/ui/format';

const reportTypes = [
  'Maliyet Analizi',
  'Müşteri Teklif Raporu',
  'İç Kârlılık Raporu',
  'Planlanan Nakit Akışı',
  'Gerçekleşen Nakit Akışı',
  'Planlanan–Gerçekleşen Karşılaştırması',
  'Aylık Kâr Raporu',
  'Gecikme Analizi',
  'Müşteri Teklif Karşılaştırması',
  'Tarife ve Tasarruf Karşılaştırması',
];

export function ReportsPage() {
  const allOffers = useAppStore((state) => state.offers);
  const offers = allOffers.filter((offer) => offer.status === 'final');
  const scenarios = useAppStore((state) => state.scenarios);
  const customers = useAppStore((state) => state.customers);
  const notify = useAppStore((state) => state.notify);
  const [reportType, setReportType] = useState(reportTypes[0]!);
  const [offerId, setOfferId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const offer = offers.find((item) => item.id === offerId);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const rows =
    offer?.resultSnapshot.periods.map((period) => [
      period.index,
      `${period.start} / ${period.end}`,
      period.gridConsumptionMwh,
      period.activeEnergySalesAmount,
      period.btvAmount,
      period.kdvAmount,
      period.grossInvoice,
      period.offerMargin,
    ]) ?? [];
  const exportCsv = () => {
    if (!offer) return;
    downloadText(
      toCsv([
        ['Rapor türü', reportType],
        ['Politika', offer.resultSnapshot.policyVersion],
        ['Kaynak teklif versiyonu', offer.version],
        ['Hesaplama zamanı', offer.resultSnapshot.calculatedAt],
        [],
        [
          'Dönem',
          'Tarih',
          'Şebeke MWh',
          'Aktif enerji',
          'BTV',
          'KDV',
          'Brüt fatura',
          'Teklif marjı',
        ],
        ...rows,
      ]),
      `k2-${reportType}.csv`,
      'text/csv;charset=utf-8',
    );
    notify({ tone: 'success', title: 'Rapor oluşturuldu', detail: `${reportType} · CSV` });
  };
  return (
    <div className="print-surface">
      <PageHeader
        eyebrow="İZLENEBİLİR ÇIKTILAR"
        title="Raporlar"
        description="Formülleri, parametreleri, politika sürümünü ve kaynak teklif versiyonunu raporla birlikte saklayın."
        actions={
          offer ? (
            <div className="page-actions no-print">
              <button
                className="button secondary"
                onClick={() => {
                  window.print();
                  notify({
                    tone: 'success',
                    title: 'Rapor oluşturuldu',
                    detail: `${reportType} · Yazdırma görünümü`,
                  });
                }}
              >
                <Printer size={16} /> PDF / Yazdır
              </button>
              <button className="button secondary" onClick={exportCsv}>
                <Download size={16} /> CSV
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  downloadText(
                    JSON.stringify({ reportType, offer, scenario }, null, 2),
                    `k2-${reportType}.json`,
                    'application/json',
                  )
                }
              >
                <FileJson size={16} /> JSON
              </button>
            </div>
          ) : undefined
        }
      />
      <section className="panel report-builder no-print">
        <div className="form-grid three">
          <label className="field">
            <span>Rapor türü</span>
            <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
              {reportTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Kaynak teklif</span>
            <select
              value={offerId}
              onChange={(event) => {
                setOfferId(event.target.value);
                setScenarioId('');
              }}
            >
              <option value="">Teklif seçin</option>
              {offers.map((item) => (
                <option key={item.id} value={item.id}>
                  {customers.find((customer) => customer.id === item.customerId)?.name} ·{' '}
                  {item.title} · v{item.version}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Gerçekleşme senaryosu</span>
            <select
              value={scenarioId}
              onChange={(event) => setScenarioId(event.target.value)}
              disabled={!offerId}
            >
              <option value="">İsteğe bağlı</option>
              {scenarios
                .filter((item) => item.sourceOfferId === offerId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>
      {!offer ? (
        <EmptyState
          icon={FileText}
          title="Rapor kaynağı seçin"
          description="Rapor türünü ve kayıtlı nihai teklifi seçtiğinizde doğrulanabilir rapor önizlemesi burada oluşur."
        />
      ) : (
        <article className="report-paper">
          <header>
            <div className="report-brand">
              K2 <span>ENERJİPRO 3.0</span>
            </div>
            <div>
              <span>RAPOR</span>
              <strong>{reportType}</strong>
            </div>
          </header>
          <section className="report-meta">
            <div>
              <span>Müşteri</span>
              <strong>
                {customers.find((customer) => customer.id === offer.customerId)?.name}
              </strong>
            </div>
            <div>
              <span>Kaynak teklif</span>
              <strong>
                {offer.title} · v{offer.version}
              </strong>
            </div>
            <div>
              <span>Hesaplama zamanı</span>
              <strong>{new Date(offer.resultSnapshot.calculatedAt).toLocaleString('tr-TR')}</strong>
            </div>
            <div>
              <span>Politika sürümü</span>
              <strong>{offer.resultSnapshot.policyVersion}</strong>
            </div>
          </section>
          <section className="report-summary">
            <div>
              <span>Brüt fatura</span>
              <strong>{formatMoney(offer.resultSnapshot.totals.grossInvoice)}</strong>
            </div>
            <div>
              <span>EPSAŞ net kârı</span>
              <strong>
                {formatMoney(
                  scenario?.resultSnapshot.actualProfit ?? offer.resultSnapshot.totals.netProfit,
                )}
              </strong>
            </div>
            <div>
              <span>Kredi / valör farkı</span>
              <strong>
                {formatMoney(
                  offer.resultSnapshot.totals.creditCost - offer.resultSnapshot.totals.valorIncome,
                )}
              </strong>
            </div>
            <div>
              <span>GES tasarrufu</span>
              <strong>{formatMoney(offer.resultSnapshot.totals.gesSelfConsumptionSavings)}</strong>
            </div>
          </section>
          <h2>Dönem sonuçları</h2>
          <table>
            <thead>
              <tr>
                <th>Dönem</th>
                <th>Kullanım</th>
                <th>Şebeke</th>
                <th>Aktif enerji</th>
                <th>BTV</th>
                <th>KDV</th>
                <th>Brüt fatura</th>
              </tr>
            </thead>
            <tbody>
              {offer.resultSnapshot.periods.map((period) => (
                <tr key={period.id}>
                  <td>{period.index}</td>
                  <td>
                    {formatDate(period.start)} – {formatDate(period.end)}
                  </td>
                  <td>{period.gridConsumptionMwh.toFixed(3)} MWh</td>
                  <td>{formatMoney(period.activeEnergySalesAmount)}</td>
                  <td>{formatMoney(period.btvAmount)}</td>
                  <td>{formatMoney(period.kdvAmount)}</td>
                  <td>{formatMoney(period.grossInvoice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {scenario && (
            <>
              <h2>Gerçekleşme ve gecikme özeti</h2>
              <section className="report-summary">
                <div>
                  <span>Actual payment kayıtları</span>
                  <strong>{scenario.actualPayments.length}</strong>
                </div>
                <div>
                  <span>Gecikme bedeli</span>
                  <strong>{formatMoney(scenario.resultSnapshot.totalLateFee)}</strong>
                </div>
                <div>
                  <span>Planlanan kâr</span>
                  <strong>{formatMoney(scenario.resultSnapshot.plannedProfit)}</strong>
                </div>
                <div>
                  <span>Gerçekleşen kâr / sapma</span>
                  <strong>
                    {formatMoney(scenario.resultSnapshot.actualProfit)} /{' '}
                    {formatMoney(scenario.resultSnapshot.variance)}
                  </strong>
                </div>
              </section>
            </>
          )}
          <footer>
            Bu rapor ara yuvarlama yapılmadan saklanan hesap sonuçlarından oluşturulmuştur. Gecikme
            KDV’si, KDV ve BTV kâr sayılmaz.
          </footer>
        </article>
      )}
    </div>
  );
}
