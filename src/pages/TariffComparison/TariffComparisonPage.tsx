import { useMemo, useState } from 'react';
import { Scale, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppStore } from '../../app/store/useAppStore';
import {
  compareTariff,
  defaultComparisonSettings,
  type ComparisonModel,
  type ComparisonSettings,
} from '../../domain/comparison/tariffComparison';
import { EmptyState } from '../../components/ui/EmptyState';
import { NumberField } from '../../components/ui/NumberField';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatMoney, formatPercent } from '../../components/ui/format';

const models: Array<[ComparisonModel, string]> = [
  ['skt_kbk', 'SKT / KBK'],
  ['national_fixed', 'Sabit ulusal tarife'],
  ['national_tiered', 'Kademeli ulusal tarife'],
  ['manual_active', 'Manuel aktif enerji'],
  ['fixed_discount_tl_mwh', 'TL/MWh sabit indirim'],
  ['usd_mwh', 'USD/MWh sabit fiyat'],
];

export function TariffComparisonPage() {
  const allCustomers = useAppStore((state) => state.customers);
  const allOffers = useAppStore((state) => state.offers);
  const customers = allCustomers.filter((customer) => !customer.isArchived);
  const offers = allOffers.filter((offer) => offer.status === 'final');
  const [customerId, setCustomerId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const baseOffer = offers.find((offer) => selected.includes(offer.id));
  const [settings, setSettings] = useState<ComparisonSettings | null>(null);
  const currentSettings =
    settings ?? (baseOffer ? defaultComparisonSettings(baseOffer.stateSnapshot) : null);
  const update = (patch: Partial<ComparisonSettings>) =>
    currentSettings && setSettings({ ...currentSettings, ...patch });
  const results = useMemo(
    () =>
      currentSettings
        ? offers
            .filter((offer) => selected.includes(offer.id))
            .map((offer) => ({
              offer,
              result: compareTariff(offer.stateSnapshot, offer.resultSnapshot, currentSettings),
            }))
        : [],
    [offers, selected, currentSettings],
  );
  const customerOffers = offers.filter((offer) => offer.customerId === customerId);
  return (
    <div>
      <PageHeader
        eyebrow="İKİ TARAF İÇİN KARAR"
        title="Tarife karşılaştırması"
        description="Müşteri tasarrufunu ve EPSAŞ net kârını aynı kararda, fakat ayrı metrikler olarak değerlendirin."
      />
      <section className="panel comparison-filter">
        <div className="form-grid three">
          <label className="field">
            <span>Müşteri</span>
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setSelected([]);
                setSettings(null);
              }}
            >
              <option value="">Önce müşteri seçin</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field span-2">
            <span>Karşılaştırılacak teklifler</span>
            <div className="checkbox-list">
              {customerOffers.map((offer) => (
                <label key={offer.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(offer.id)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelected((current) => {
                        const next = checked
                          ? [...new Set([...current, offer.id])]
                          : current.filter((id) => id !== offer.id);
                        if (next.length === 0) setSettings(null);
                        return next;
                      });
                    }}
                  />
                  <span>
                    {offer.title} · v{offer.version}
                  </span>
                </label>
              ))}
            </div>
            <small>Bütün teklifler otomatik seçilmez.</small>
          </div>
        </div>
      </section>
      {!baseOffer || !currentSettings ? (
        <EmptyState
          icon={Scale}
          title="Karşılaştırma için teklif seçin"
          description="Önce müşteriyi, sonra checkbox ile karşılaştırmak istediğiniz teklifleri seçin."
        />
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">REFERANS MODEL</span>
                <h2>Tarife varsayımları</h2>
              </div>
            </div>
            <div className="form-grid four">
              <label className="field">
                <span>Model</span>
                <select
                  value={currentSettings.model}
                  onChange={(event) => update({ model: event.target.value as ComparisonModel })}
                >
                  {models.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Referans aktif enerji"
                unit="TL/MWh"
                min={0}
                step="0.001"
                value={currentSettings.referenceActivePriceTlMwh}
                onValue={(value) => update({ referenceActivePriceTlMwh: value })}
              />
              {currentSettings.model === 'skt_kbk' && (
                <NumberField
                  label="SKT / KBK katsayısı"
                  unit="x"
                  min={0}
                  step="0.0001"
                  value={currentSettings.sktMultiplier}
                  onValue={(value) => update({ sktMultiplier: value })}
                />
              )}{' '}
              {currentSettings.model === 'fixed_discount_tl_mwh' && (
                <NumberField
                  label="Sabit indirim"
                  unit="TL/MWh"
                  min={0}
                  value={currentSettings.fixedDiscountTlMwh}
                  onValue={(value) => update({ fixedDiscountTlMwh: value })}
                />
              )}{' '}
              {currentSettings.model === 'usd_mwh' && (
                <>
                  <NumberField
                    label="USD sabit fiyat"
                    unit="USD/MWh"
                    min={0}
                    value={currentSettings.usdPriceMwh}
                    onValue={(value) => update({ usdPriceMwh: value })}
                  />
                  <NumberField
                    label="USD/TL kuru"
                    unit="TL"
                    min={0}
                    value={currentSettings.usdTry}
                    onValue={(value) => update({ usdTry: value })}
                  />
                </>
              )}{' '}
              {currentSettings.model === 'national_tiered' && (
                <>
                  <NumberField
                    label="Düşük kademe"
                    unit="TL/MWh"
                    min={0}
                    value={currentSettings.lowTierPriceTlMwh}
                    onValue={(value) => update({ lowTierPriceTlMwh: value })}
                  />
                  <NumberField
                    label="Yüksek kademe"
                    unit="TL/MWh"
                    min={0}
                    value={currentSettings.highTierPriceTlMwh}
                    onValue={(value) => update({ highTierPriceTlMwh: value })}
                  />
                  <NumberField
                    label="Kademe eşiği"
                    unit="MWh"
                    min={0}
                    value={currentSettings.tierThresholdMwh}
                    onValue={(value) => update({ tierThresholdMwh: value })}
                  />
                </>
              )}
            </div>
          </section>
          <section className="decision-grid">
            {results.map(({ offer, result }) => {
              const balanced = result.customerSavings >= 0 && result.epsasProfit >= 0;
              return (
                <article
                  className={`decision-card ${balanced ? 'balanced' : result.epsasProfit < 0 ? 'risk' : 'caution'}`}
                  key={offer.id}
                >
                  <div className="decision-head">
                    <div>
                      <span className="eyebrow">
                        {offer.title} · v{offer.version}
                      </span>
                      <h2>{result.decision}</h2>
                    </div>
                    <StatusBadge
                      tone={balanced ? 'positive' : result.epsasProfit < 0 ? 'negative' : 'warning'}
                    >
                      {balanced ? 'Dengeli' : 'İncele'}
                    </StatusBadge>
                  </div>
                  <div className="decision-metrics">
                    <div>
                      <span>İkili anlaşma faturası</span>
                      <strong>{formatMoney(result.bilateralInvoice)}</strong>
                    </div>
                    <div>
                      <span>Referans fatura</span>
                      <strong>{formatMoney(result.referenceInvoice)}</strong>
                    </div>
                    <div>
                      <span>Müşteri tasarrufu</span>
                      <strong
                        className={result.customerSavings >= 0 ? 'positive-text' : 'negative-text'}
                      >
                        {formatMoney(result.customerSavings)}{' '}
                        <small>{formatPercent(result.customerSavingsRate, true)}</small>
                      </strong>
                    </div>
                    <div>
                      <span>EPSAŞ net kârı</span>
                      <strong
                        className={result.epsasProfit >= 0 ? 'positive-text' : 'negative-text'}
                      >
                        {formatMoney(result.epsasProfit)}
                      </strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">KARAR GRAFİĞİ</span>
                <h2>Müşteri avantajı ve EPSAŞ kârı</h2>
              </div>
              <Sparkles size={20} />
            </div>
            <div className="chart-container large">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={results.map(({ offer, result }) => ({
                    teklif: offer.title,
                    'Müşteri tasarrufu': result.customerSavings,
                    'EPSAŞ net kârı': result.epsasProfit,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="teklif" />
                  <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}K`} />
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  <Legend />
                  <Bar dataKey="Müşteri tasarrufu" fill="#315d76" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="EPSAŞ net kârı" fill="#1b9273" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
