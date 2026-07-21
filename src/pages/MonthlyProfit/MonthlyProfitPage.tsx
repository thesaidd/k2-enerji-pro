import { useState } from 'react';
import { BarChart3, Info } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppStore } from '../../app/store/useAppStore';
import { EmptyState } from '../../components/ui/EmptyState';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatMoney, formatNumber } from '../../components/ui/format';

export function MonthlyProfitPage() {
  const allOffers = useAppStore((state) => state.offers);
  const offers = allOffers.filter((offer) => offer.status === 'final');
  const scenarios = useAppStore((state) => state.scenarios);
  const customers = useAppStore((state) => state.customers);
  const [offerId, setOfferId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const offer = offers.find((item) => item.id === offerId);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const planned = offer?.resultSnapshot.monthlyProfit ?? [];
  const actual = scenario?.resultSnapshot.monthlyProfit ?? [];
  const rows = [...new Set([...planned.map((row) => row.month), ...actual.map((row) => row.month)])]
    .sort()
    .map((month) => ({
      month,
      planned: planned.find((row) => row.month === month),
      actual: actual.find((row) => row.month === month),
    }));
  const selectedCustomer = offer
    ? customers.find((customer) => customer.id === offer.customerId)
    : undefined;
  return (
    <div>
      <PageHeader
        eyebrow="İKİ AYRI MERCEK"
        title="Aylık kâr"
        description="Ekonomik dönemin kârlılığını ve paranın hareket ettiği ayı birbirine karıştırmadan izleyin."
      />
      <div className="panel filter-panel">
        <div className="form-grid two">
          <label className="field">
            <span>Planlanan teklif</span>
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
                  {item.title}
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
              <option value="">Yalnız planlanan</option>
              {scenarios
                .filter((item) => item.sourceOfferId === offerId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <small>Planlanan ile yan yana karşılaştırmak için isteğe bağlı.</small>
          </label>
        </div>
      </div>
      {!offer ? (
        <EmptyState
          icon={BarChart3}
          title="Aylık sonuç için teklif seçin"
          description="Tahakkuk bazlı kâr ve nakit bazlı sonucu ay ay görmek için kayıtlı bir nihai teklif seçin."
        />
      ) : (
        <>
          <div className="concept-grid">
            <article className="concept-card accrual">
              <Info size={20} />
              <span className="eyebrow">TAHAKKUK BAZLI</span>
              <h2>Bu tüketim ayı ticari olarak ne kadar kârlıydı?</h2>
              <p>
                Geliri ve maliyeti elektriğin kullanıldığı ekonomik döneme yazar. KDV, BTV ve
                gecikme KDV’si kâr değildir.
              </p>
            </article>
            <article className="concept-card cash">
              <Info size={20} />
              <span className="eyebrow">NAKİT BAZLI</span>
              <h2>Bu ay kasaya net ne kadar para girdi veya çıktı?</h2>
              <p>
                Paranın gerçekten hareket ettiği aya bakar. Kârlılık değil, aylık net nakit
                değişimidir.
              </p>
            </article>
          </div>
          <section className="metric-grid four">
            <MetricCard
              label="Planlanan tahakkuk kârı"
              value={formatMoney(planned.reduce((sum, row) => sum + row.accrualProfit, 0))}
              detail={selectedCustomer?.name}
            />
            <MetricCard
              label="Planlanan net nakit"
              value={formatMoney(planned.reduce((sum, row) => sum + row.cashResult, 0))}
            />
            <MetricCard
              label="Gerçekleşen tahakkuk kârı"
              value={
                scenario
                  ? formatMoney(actual.reduce((sum, row) => sum + row.accrualProfit, 0))
                  : '—'
              }
              tone={scenario ? 'positive' : 'neutral'}
            />
            <MetricCard
              label="Gerçekleşen net nakit"
              value={
                scenario ? formatMoney(actual.reduce((sum, row) => sum + row.cashResult, 0)) : '—'
              }
            />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">AYLIK TREND</span>
                <h2>Tahakkuk kârı ve net nakit</h2>
              </div>
            </div>
            <div className="chart-container large">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={rows.map((row) => ({
                    month: row.month,
                    planKar: row.planned?.accrualProfit ?? 0,
                    planNakit: row.planned?.cashResult ?? 0,
                    gercekKar: row.actual?.accrualProfit,
                    gercekNakit: row.actual?.cashResult,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}K`} />
                  <Tooltip
                    formatter={(value) => (value == null ? '—' : formatMoney(Number(value)))}
                  />
                  <Legend />
                  <Bar
                    dataKey="planKar"
                    name="Planlanan tahakkuk kârı"
                    fill="#1f7667"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    dataKey="planNakit"
                    name="Planlanan nakit sonucu"
                    stroke="#305b75"
                    strokeWidth={2}
                  />
                  <Bar
                    dataKey="gercekKar"
                    name="Gerçekleşen tahakkuk kârı"
                    fill="#e09b35"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    dataKey="gercekNakit"
                    name="Gerçekleşen nakit sonucu"
                    stroke="#d45b50"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DETAY TABLOSU</span>
                <h2>Aylık sonuçlar</h2>
              </div>
            </div>
            <div className="table-wrap wide-table">
              <table>
                <thead>
                  <tr>
                    <th>Ay</th>
                    <th>Tüketim</th>
                    <th>Aktif enerji geliri</th>
                    <th>Teklif marjı</th>
                    <th>Dengesizlik</th>
                    <th>PİÜ</th>
                    <th>Kanal maliyeti</th>
                    <th>Kredi</th>
                    <th>Valör</th>
                    <th>Gecikme geliri</th>
                    <th>Tahakkuk kârı</th>
                    <th>Nakit girişi</th>
                    <th>Nakit çıkışı</th>
                    <th>Nakit sonucu</th>
                  </tr>
                </thead>
                <tbody>
                  {planned.map((row) => (
                    <tr key={row.month}>
                      <td>
                        <strong>{row.month}</strong>
                      </td>
                      <td>{formatNumber(row.consumptionMwh)} MWh</td>
                      <td>{formatMoney(row.activeEnergySalesRevenue)}</td>
                      <td>{formatMoney(row.offerMargin)}</td>
                      <td>{formatMoney(row.imbalance)}</td>
                      <td>{formatMoney(row.piu)}</td>
                      <td>{formatMoney(row.channelCost)}</td>
                      <td>{formatMoney(row.creditInterest)}</td>
                      <td>{formatMoney(row.valorIncome)}</td>
                      <td>{formatMoney(row.lateFeeIncome)}</td>
                      <td className={row.accrualProfit >= 0 ? 'positive-text' : 'negative-text'}>
                        <strong>{formatMoney(row.accrualProfit)}</strong>
                      </td>
                      <td>{formatMoney(row.cashInflows)}</td>
                      <td>{formatMoney(row.cashOutflows)}</td>
                      <td className={row.cashResult >= 0 ? 'positive-text' : 'negative-text'}>
                        <strong>{formatMoney(row.cashResult)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
