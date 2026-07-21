import { useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import {
  Area,
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
import { sensitivitySeries } from '../../domain/profitability/calculation';
import { downloadText, toCsv } from '../../services/export/download';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatMoney } from '../../components/ui/format';

type ChartKind = 'cashflow' | 'plan-actual' | 'profit' | 'offers' | 'sensitivity';
const chartKinds: Array<[ChartKind, string]> = [
  ['cashflow', 'Nakit akışı'],
  ['plan-actual', 'Planlanan–gerçekleşen'],
  ['profit', 'Aylık kâr'],
  ['offers', 'Teklif karşılaştırma'],
  ['sensitivity', 'Teklif duyarlılığı'],
];

export function ChartsPage() {
  const allCustomers = useAppStore((state) => state.customers);
  const allOffers = useAppStore((state) => state.offers);
  const customers = allCustomers.filter((customer) => !customer.isArchived);
  const offers = allOffers.filter((offer) => offer.status === 'final');
  const scenarios = useAppStore((state) => state.scenarios);
  const holidays = useAppStore((state) => state.settings.holidays);
  const [kind, setKind] = useState<ChartKind>('cashflow');
  const [customerId, setCustomerId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [scenarioId, setScenarioId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const customerOffers = offers.filter((offer) => offer.customerId === customerId);
  const chosen = offers.filter((offer) => selected.includes(offer.id));
  const data = (() => {
    if (kind === 'sensitivity' && chosen[0])
      return sensitivitySeries(chosen[0].stateSnapshot, holidays, -5, 20, 1).map((row) => ({
        label: row.offerRate,
        'Net kâr': row.netProfit,
        'Müşteri faturası': row.customerInvoice,
        'Müşteri avantajı': row.customerAdvantage,
      }));
    if (kind === 'offers')
      return chosen.map((offer) => ({
        label: `${offer.title} v${offer.version}`,
        'Müşteri faturası': offer.resultSnapshot.totals.grossInvoice,
        'EPSAŞ net kârı': offer.resultSnapshot.totals.netProfit,
        'Finansman maliyeti':
          offer.resultSnapshot.totals.creditCost - offer.resultSnapshot.totals.valorIncome,
        'Müşteri avantajı': offer.resultSnapshot.totals.customerAdvantage,
      }));
    if (kind === 'profit') {
      const map = new Map<string, Record<string, string | number>>();
      chosen.forEach((offer) =>
        offer.resultSnapshot.monthlyProfit.forEach((row) => {
          const item = map.get(row.month) ?? { label: row.month };
          item[`${offer.title} · Tahakkuk`] = row.accrualProfit;
          item[`${offer.title} · Nakit`] = row.cashResult;
          map.set(row.month, item);
        }),
      );
      return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
    }
    if (kind === 'plan-actual') {
      const scenario = scenarios.find((item) => item.id === scenarioId);
      if (!scenario) return [];
      const plannedByDate = new Map(
        scenario.sourceOfferSnapshot.resultSnapshot.plannedCashflow.map((row) => [row.date, row]),
      );
      const actualByDate = new Map(
        scenario.resultSnapshot.actualCashflow.map((row) => [row.date, row]),
      );
      return [...new Set([...plannedByDate.keys(), ...actualByDate.keys()])].sort().map((date) => ({
        label: date,
        'Planlanan tahsilat': plannedByDate.get(date)?.customerInflows ?? 0,
        'Gerçek tahsilat': actualByDate.get(date)?.customerInflows ?? 0,
        'Planlanan bakiye': plannedByDate.get(date)?.closingBalance ?? 0,
        'Gerçek bakiye': actualByDate.get(date)?.closingBalance ?? 0,
      }));
    }
    const map = new Map<string, Record<string, string | number>>();
    chosen.forEach((offer) =>
      offer.resultSnapshot.plannedCashflow.forEach((row) => {
        if ((from && row.date < from) || (to && row.date > to)) return;
        const item = map.get(row.date) ?? {
          label: row.date,
          'Nakit girişleri': 0,
          'Nakit çıkışları': 0,
          'Kümülatif net nakit': 0,
        };
        item['Nakit girişleri'] = Number(item['Nakit girişleri']) + row.customerInflows;
        item['Nakit çıkışları'] = Number(item['Nakit çıkışları']) + row.supplierOutflows;
        item['Kümülatif net nakit'] = Number(item['Kümülatif net nakit']) + row.closingBalance;
        map.set(row.date, item);
      }),
    );
    return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  })();
  const series = data.length ? Object.keys(data[0]!).filter((key) => key !== 'label') : [];
  const colors = ['#1b9273', '#d45b50', '#315d76', '#e09b35', '#7d62a8', '#4f8fba'];
  return (
    <div>
      <PageHeader
        eyebrow="GÖRSEL ANALİZ"
        title="Grafikler"
        description="Tarih aralığı, müşteri ve kendi seçtiğiniz teklifler üzerinden nakit ve kârlılık eğilimlerini inceleyin."
        actions={
          data.length > 0 ? (
            <button
              className="button secondary"
              onClick={() =>
                downloadText(
                  toCsv([
                    ['Tarih / teklif', ...series],
                    ...data.map((row) => {
                      const record = row as Record<string, string | number | undefined>;
                      return [record.label, ...series.map((key) => record[key])];
                    }),
                  ]),
                  `k2-${kind}.csv`,
                  'text/csv;charset=utf-8',
                )
              }
            >
              <Download size={16} /> CSV
            </button>
          ) : undefined
        }
      />
      <div className="chart-tabs">
        {chartKinds.map(([value, label]) => (
          <button
            key={value}
            className={kind === value ? 'active' : ''}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="panel chart-filter">
        <div className="form-grid four">
          <label className="field">
            <span>Müşteri</span>
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setSelected([]);
                setScenarioId('');
              }}
            >
              <option value="">Müşteri seçin</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          {kind === 'plan-actual' ? (
            <label className="field span-2">
              <span>Gerçekleşme senaryosu</span>
              <select
                value={scenarioId}
                onChange={(event) => setScenarioId(event.target.value)}
                disabled={!customerId}
              >
                <option value="">Senaryo seçin</option>
                {scenarios
                  .filter((scenario) => scenario.sourceCustomerId === customerId)
                  .map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <div className="field span-2">
              <span>Karşılaştırılacak teklifler</span>
              <div className="checkbox-list">
                {customerOffers.length === 0 ? (
                  <small>Bu müşteriye ait nihai teklif yok.</small>
                ) : (
                  customerOffers.map((offer) => (
                    <label key={offer.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(offer.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected((current) =>
                            checked
                              ? [...new Set([...current, offer.id])]
                              : current.filter((id) => id !== offer.id),
                          );
                        }}
                      />
                      <span>
                        {offer.title} · v{offer.version}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <small>Teklifler otomatik seçilmez; karşılaştırmayı siz belirleyin.</small>
            </div>
          )}
          {kind === 'cashflow' && (
            <>
              <label className="field">
                <span>Başlangıç tarihi</span>
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="field">
                <span>Bitiş tarihi</span>
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
            </>
          )}
        </div>
      </section>
      {data.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Grafik için seçim yapın"
          description={
            kind === 'plan-actual'
              ? 'Müşteri ve gerçekleşme senaryosu seçin.'
              : 'Önce müşteriyi, ardından karşılaştırmak istediğiniz en az bir teklifi işaretleyin.'
          }
        />
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{chartKinds.find(([value]) => value === kind)?.[1]}</span>
              <h2>
                {kind === 'sensitivity'
                  ? 'Oran değiştikçe ticari sonuç'
                  : 'Seçili kayıtların zaman içindeki görünümü'}
              </h2>
            </div>
          </div>
          <div className="chart-container xl">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}K`} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend />
                {series.map((key, index) =>
                  kind === 'offers' ? (
                    <Bar
                      key={key}
                      dataKey={key}
                      fill={colors[index % colors.length]}
                      radius={[4, 4, 0, 0]}
                    />
                  ) : key.includes('giriş') || key.includes('Tahakkuk') ? (
                    <Area
                      key={key}
                      dataKey={key}
                      stroke={colors[index % colors.length]}
                      fill={colors[index % colors.length]}
                      fillOpacity={0.14}
                    />
                  ) : (
                    <Line
                      key={key}
                      dataKey={key}
                      stroke={colors[index % colors.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ),
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
