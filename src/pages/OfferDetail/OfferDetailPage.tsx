import {
  ArrowLeft,
  CalendarDays,
  Copy,
  Download,
  FileJson,
  GitBranch,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../app/store/useAppStore';
import { createRealizationScenario } from '../../domain/realization/realization';
import { paymentCalendarUrl } from '../../domain/payment-calendar/paymentCalendar';
import { marketPriceSourceLabel } from '../../domain/market-prices/marketPrices';
import { downloadText, toCsv, toIcs } from '../../services/export/download';
import { EmptyState } from '../../components/ui/EmptyState';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../../components/ui/format';

export function OfferDetailPage() {
  const { offerId } = useParams();
  const navigate = useNavigate();
  const offer = useAppStore((state) => state.offers.find((item) => item.id === offerId));
  const customer = useAppStore((state) =>
    state.customers.find((item) => item.id === offer?.customerId),
  );
  const duplicateOffer = useAppStore((state) => state.duplicateOffer);
  const saveScenario = useAppStore((state) => state.saveScenario);
  const settings = useAppStore((state) => state.settings);
  if (!offer)
    return (
      <EmptyState
        icon={TrendingUp}
        title="Teklif bulunamadı"
        description="Kayıt bu tarayıcıda bulunmuyor."
        action={
          <Link className="button secondary" to="/offers">
            Tekliflere dön
          </Link>
        }
      />
    );
  const result = offer.resultSnapshot;
  const exportCsv = () =>
    downloadText(
      toCsv([
        ['K2 EnerjiPro 3.0 Teklif Raporu'],
        ['Müşteri', customer?.name],
        ['Teklif', offer.title],
        ['Versiyon', offer.version],
        ['Politika', result.policyVersion],
        ['Hesaplama zamanı', result.calculatedAt],
        [],
        ['Dönem', 'Tüketim MWh', 'Aktif enerji', 'BTV', 'Dağıtım', 'KDV', 'Brüt fatura'],
        ...result.periods.map((period) => [
          period.start.slice(0, 7),
          period.gridConsumptionMwh,
          period.activeEnergySalesAmount,
          period.btvAmount,
          period.distributionAmount,
          period.kdvAmount,
          period.grossInvoice,
        ]),
      ]),
      `k2-${offer.title}.csv`,
      'text/csv;charset=utf-8',
    );
  const createScenario = async () => {
    const scenario = createRealizationScenario(
      offer,
      'Gerçekleşen Durum',
      settings.monthlyMarketPrices,
      settings.holidays,
    );
    await saveScenario(scenario);
    navigate(`/realization/${scenario.id}`);
  };
  return (
    <div className="print-surface">
      <Link to="/offers" className="back-link no-print">
        <ArrowLeft size={16} /> Planlanan teklifler
      </Link>
      <PageHeader
        eyebrow={`${customer?.name ?? 'Müşteri'} · v${offer.version}`}
        title={offer.title}
        description={`Kaynak snapshot · ${new Date(offer.createdAt).toLocaleString('tr-TR')} · ${result.policyVersion}`}
        actions={
          <div className="page-actions no-print">
            <button
              className="button ghost"
              onClick={() => {
                duplicateOffer(offer.id);
                navigate('/cost-calculation');
              }}
            >
              <Copy size={16} /> Kopyala
            </button>
            <button className="button secondary" onClick={() => void createScenario()}>
              <GitBranch size={16} /> Gerçekleşme oluştur
            </button>
            <Link className="button secondary" to={paymentCalendarUrl('planned_offer', offer.id)}>
              <CalendarDays size={16} /> Ödeme / Kullanım Takvimini Aç
            </Link>
          </div>
        }
      />
      <div className="offer-status-row">
        <StatusBadge tone="positive">Nihai teklif</StatusBadge>
        <span>Bu kayıt immutable snapshot’tır. Düzenleme yeni versiyon oluşturur.</span>
      </div>
      {result.warnings.map((warning) => (
        <div className="notice warning" key={warning}>
          {warning}
        </div>
      ))}
      <section className="metric-grid four">
        <MetricCard
          label="Brüt müşteri faturası"
          value={formatMoney(result.totals.grossInvoice)}
          detail={`${formatNumber(result.totals.gridConsumptionMwh)} MWh şebeke tüketimi`}
          tone="accent"
        />
        <MetricCard
          label="EPSAŞ net kârı"
          value={formatMoney(result.totals.netProfit)}
          detail={formatPercent(result.totals.netProfitRate, true)}
          tone={result.totals.netProfit >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Finansman etkisi"
          value={formatMoney(result.totals.creditCost - result.totals.valorIncome)}
          detail={`Kredi ${formatMoney(result.totals.creditCost)} · Valör ${formatMoney(result.totals.valorIncome)}`}
        />
        <MetricCard
          label="GES öz tüketim tasarrufu"
          value={formatMoney(result.totals.gesSelfConsumptionSavings)}
          detail={`${formatNumber(result.totals.gesSelfConsumptionMwh)} MWh satın alınmayan enerji`}
          tone="positive"
        />
      </section>
      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">FATURA KIRILIMI</span>
              <h2>Dönemler</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dönem</th>
                  <th>Şebeke</th>
                  <th>PTF / kaynak</th>
                  <th>YEKDEM / kaynak</th>
                  <th>Aktif enerji</th>
                  <th>BTV</th>
                  <th>Dağıtım</th>
                  <th>KDV</th>
                  <th>Brüt</th>
                </tr>
              </thead>
              <tbody>
                {result.periods.map((period) => (
                  <tr key={period.id}>
                    <td>
                      <strong>{period.index}. dönem</strong>
                      <small>
                        {formatDate(period.start)} – {formatDate(period.end)}
                      </small>
                    </td>
                    <td>{formatNumber(period.gridConsumptionMwh)} MWh</td>
                    <td>
                      {formatNumber(period.ptfUnitPrice ?? offer.stateSnapshot.ptfTlMwh, 3)} TL/MWh
                      <small>{marketPriceSourceLabel(period.ptfPriceSource)}</small>
                    </td>
                    <td>
                      {formatNumber(period.yekdemUnitPrice ?? offer.stateSnapshot.yekdemTlMwh, 3)}{' '}
                      TL/MWh
                      <small>{marketPriceSourceLabel(period.yekdemPriceSource)}</small>
                    </td>
                    <td>{formatMoney(period.activeEnergySalesAmount)}</td>
                    <td>{formatMoney(period.btvAmount)}</td>
                    <td>{formatMoney(period.distributionAmount)}</td>
                    <td>{formatMoney(period.kdvAmount)}</td>
                    <td>
                      <strong>{formatMoney(period.grossInvoice)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <aside className="panel formula-panel">
          <span className="eyebrow">HESAP İZİ</span>
          <h2>Kullanılan politika</h2>
          <dl>
            <div>
              <dt>Aktif enerji tabanı</dt>
              <dd>PTF + YEKDEM</dd>
            </div>
            <div>
              <dt>BTV matrahı</dt>
              <dd>Aktif enerji satış bedeli</dd>
            </div>
            <div>
              <dt>KDV matrahı</dt>
              <dd>Aktif enerji + dağıtım + güç + BTV</dd>
            </div>
            <div>
              <dt>Finansman gün bazı</dt>
              <dd>365 gün</dd>
            </div>
            <div>
              <dt>GES modu</dt>
              <dd>
                {offer.stateSnapshot.ges.mode === 'simple_self_consumption'
                  ? 'Basit öz tüketim'
                  : 'Gelişmiş ölçüm'}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PİYASA VERİSİ SNAPSHOT’I</span>
            <h2>Kaydedildiği tarihte kullanılan piyasa verileri</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ay</th>
                <th>PTF</th>
                <th>PTF kaynağı</th>
                <th>YEKDEM</th>
                <th>YEKDEM kaynağı</th>
              </tr>
            </thead>
            <tbody>
              {(result.marketPriceSnapshot ?? []).map((price) => (
                <tr key={price.month}>
                  <td>{price.month}</td>
                  <td>{formatNumber(price.ptfUnitPrice, 3)} TL/MWh</td>
                  <td>{marketPriceSourceLabel(price.ptfPriceSource)}</td>
                  <td>{formatNumber(price.yekdemUnitPrice, 3)} TL/MWh</td>
                  <td>{marketPriceSourceLabel(price.yekdemPriceSource)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel no-print">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DIŞA AKTAR</span>
            <h2>Rapor ve veri</h2>
          </div>
        </div>
        <div className="export-actions">
          <button className="button secondary" onClick={() => window.print()}>
            <Printer size={16} /> PDF / Yazdır
          </button>
          <button className="button secondary" onClick={exportCsv}>
            <Download size={16} /> CSV
          </button>
          <button
            className="button secondary"
            onClick={() =>
              downloadText(
                JSON.stringify(offer, null, 2),
                `k2-${offer.title}.json`,
                'application/json',
              )
            }
          >
            <FileJson size={16} /> JSON
          </button>
          <button
            className="button secondary"
            onClick={() =>
              downloadText(
                toIcs(
                  result.cashEvents.map((event) => ({
                    date: event.date,
                    title: event.label,
                    description: `${event.direction === 'in' ? 'Giriş' : 'Çıkış'} · ${formatMoney(event.amount)}`,
                  })),
                ),
                `k2-${offer.title}.ics`,
                'text/calendar',
              )
            }
          >
            <CalendarDays size={16} /> Takvim
          </button>
        </div>
      </section>
    </div>
  );
}
