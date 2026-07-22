import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BanknoteArrowDown,
  CircleDollarSign,
  DatabaseBackup,
  FilePlus2,
  Gauge,
  Sparkles,
  TrendingUp,
  Users,
  UserPlus,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppStore } from '../../app/store/useAppStore';
import { EmptyState } from '../../components/ui/EmptyState';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatMoney, formatPercent } from '../../components/ui/format';

export function DashboardPage() {
  const customers = useAppStore((state) => state.customers).filter(
    (customer) => !customer.isArchived,
  );
  const offers = useAppStore((state) => state.offers).filter((offer) => offer.status === 'final');
  const scenarios = useAppStore((state) => state.scenarios);
  const totalInvoice = offers.reduce(
    (sum, offer) => sum + offer.resultSnapshot.totals.grossInvoice,
    0,
  );
  const totalProfit = offers.reduce((sum, offer) => sum + offer.resultSnapshot.totals.netProfit, 0);
  const creditRisk = offers.reduce((sum, offer) => sum + offer.resultSnapshot.totals.creditCost, 0);
  const cashSeries = offers
    .flatMap((offer) => offer.resultSnapshot.monthlyProfit)
    .reduce<Record<string, { month: string; giris: number; cikis: number; net: number }>>(
      (acc, row) => {
        const current = acc[row.month] ?? { month: row.month, giris: 0, cikis: 0, net: 0 };
        current.giris += row.cashInflows;
        current.cikis += row.cashOutflows;
        current.net += row.cashResult;
        acc[row.month] = current;
        return acc;
      },
      {},
    );
  const chartData = Object.values(cashSeries).sort((a, b) => a.month.localeCompare(b.month));
  return (
    <div>
      <PageHeader
        eyebrow="PORTFÖY NABZI"
        title="Bugünkü ticari resim"
        description="Maliyet, tahsilat ve kârlılığı aynı finansal hikâyede izleyin."
        actions={
          <Link className="button primary" to="/cost-calculation">
            <FilePlus2 size={17} /> Yeni çalışma
          </Link>
        }
      />
      {customers.length === 0 && offers.length === 0 && (
        <section className="panel empty-start-panel">
          <span className="eyebrow">BOŞ BAŞLANGIÇ</span>
          <h2>İlk adımı seçin</h2>
          <p>Kendi kaydınızı oluşturun, kontrollü demo verisini yükleyin veya güvenli bir yedeği önizleyin.</p>
          <div className="export-actions">
            <Link className="button primary" to="/customers"><UserPlus size={16} /> Yeni müşteri oluştur</Link>
            <Link className="button secondary" to="/settings#demo-data"><Sparkles size={16} /> Demo verisi yükle</Link>
            <Link className="button ghost" to="/settings#backup"><DatabaseBackup size={16} /> Yedekten geri yükle</Link>
          </div>
        </section>
      )}
      <section className="metric-grid four">
        <MetricCard
          icon={Users}
          label="Aktif müşteri"
          value={String(customers.length)}
          detail={`${offers.length} nihai teklif`}
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Planlanan fatura"
          value={formatMoney(totalInvoice)}
          detail="Vergiler dahil portföy"
          tone="accent"
        />
        <MetricCard
          icon={TrendingUp}
          label="EPSAŞ net kârı"
          value={formatMoney(totalProfit)}
          detail={formatPercent(totalInvoice ? totalProfit / totalInvoice : 0, true)}
          tone={totalProfit >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          icon={BanknoteArrowDown}
          label="Kredi maliyeti"
          value={formatMoney(creditRisk)}
          detail={`${scenarios.length} gerçekleşme senaryosu`}
          tone={creditRisk > 0 ? 'negative' : 'neutral'}
        />
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NAKİT RİTMİ</span>
              <h2>Aylık giriş ve çıkış</h2>
            </div>
            {chartData.length > 0 && (
              <Link to="/charts" className="text-link">
                Tüm grafikleri aç <ArrowRight size={15} />
              </Link>
            )}
          </div>
          {chartData.length === 0 ? (
            <EmptyState
              icon={Gauge}
              title="Henüz nakit akışı yok"
              description="İlk maliyet çalışmanızı nihai teklife dönüştürdüğünüzde portföy grafiği burada oluşur."
              action={
                <Link to="/cost-calculation" className="button secondary">
                  Maliyet çalışmasına başla
                </Link>
              }
            />
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="cashIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1b9c74" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1b9c74" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}M`} />
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  <Area
                    type="monotone"
                    dataKey="giris"
                    name="Nakit girişi"
                    stroke="#1b9c74"
                    fill="url(#cashIn)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="cikis"
                    name="Nakit çıkışı"
                    stroke="#db5a4f"
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
        <aside className="panel action-panel">
          <span className="spark-icon">
            <Sparkles size={20} />
          </span>
          <span className="eyebrow">ÖNERİLEN SONRAKİ ADIM</span>
          <h2>Maliyet önce, teklif sonra.</h2>
          <p>
            Önce ödeme planı ve finansman maliyetini görün. Teklif oranını yalnızca başabaş noktası
            ortaya çıktıktan sonra girin.
          </p>
          <ol>
            <li>Tüketimi tanımlayın</li>
            <li>Ödeme planını kurun</li>
            <li>Başabaş oranını görün</li>
          </ol>
          <Link to="/cost-calculation" className="button primary wide">
            Beş adımlı akışı aç <ArrowRight size={16} />
          </Link>
        </aside>
      </section>
      {offers.length > 0 && (
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">SON KAYITLAR</span>
              <h2>Planlanan teklifler</h2>
            </div>
            <Link to="/offers" className="text-link">
              Tümünü gör <ArrowRight size={15} />
            </Link>
          </div>
          <div className="compact-list">
            {offers.slice(0, 4).map((offer) => {
              const customer = customers.find((item) => item.id === offer.customerId);
              return (
                <Link to={`/offers/${offer.id}`} key={offer.id} className="compact-row">
                  <div>
                    <strong>{offer.title}</strong>
                    <small>
                      {customer?.name ?? 'Müşteri'} · v{offer.version}
                    </small>
                  </div>
                  <div
                    className={
                      offer.resultSnapshot.totals.netProfit >= 0 ? 'positive-text' : 'negative-text'
                    }
                  >
                    <strong>{formatMoney(offer.resultSnapshot.totals.netProfit)}</strong>
                    <small>{formatPercent(offer.resultSnapshot.totals.netProfitRate, true)}</small>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
