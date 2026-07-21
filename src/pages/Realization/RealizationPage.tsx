import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CheckSquare2,
  CirclePlus,
  GitBranch,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../app/store/useAppStore';
import { PAYMENT_CHANNEL_LABELS } from '../../config/paymentPlans';
import {
  calculateRealization,
  createRealizationScenario,
  newActualPaymentId,
} from '../../domain/realization/realization';
import { EmptyState } from '../../components/ui/EmptyState';
import { MetricCard } from '../../components/ui/MetricCard';
import { NumberField } from '../../components/ui/NumberField';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDate, formatMoney, formatNumber } from '../../components/ui/format';
import type { ActualPayment, PaymentChannel, RealizationScenario } from '../../types';

export function RealizationPage() {
  const { scenarioId } = useParams();
  const ready = useAppStore((state) => state.ready);
  const saved = useAppStore((state) =>
    state.scenarios.find((scenario) => scenario.id === scenarioId),
  );
  if (!scenarioId) return <ScenarioList />;
  if (!ready)
    return (
      <EmptyState
        icon={GitBranch}
        title="Senaryo yükleniyor"
        description="Yerel kayıtlar hazırlanıyor."
      />
    );
  return saved ? (
    <ScenarioDetail key={`${saved.id}-${saved.updatedAt}`} initialScenario={saved} />
  ) : (
    <EmptyState
      icon={GitBranch}
      title="Senaryo bulunamadı"
      description="Kayıt bu tarayıcıda bulunmuyor."
      action={
        <Link to="/realization" className="button secondary">
          Senaryolara dön
        </Link>
      }
    />
  );
}

function ScenarioList() {
  const navigate = useNavigate();
  const allCustomers = useAppStore((state) => state.customers);
  const allOffers = useAppStore((state) => state.offers);
  const customers = allCustomers.filter((customer) => !customer.isArchived);
  const offers = allOffers.filter((offer) => offer.status === 'final');
  const scenarios = useAppStore((state) => state.scenarios);
  const saveScenario = useAppStore((state) => state.saveScenario);
  const [customerId, setCustomerId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [name, setName] = useState('Gerçekleşen Durum');
  const customerOffers = offers.filter((offer) => offer.customerId === customerId);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const offer = offers.find((item) => item.id === offerId);
    if (!offer) return;
    const scenario = createRealizationScenario(offer, name);
    await saveScenario(scenario);
    navigate(`/realization/${scenario.id}`);
  };
  return (
    <div>
      <PageHeader
        eyebrow="WHAT-IF LABORATUVARI"
        title="Gerçekleşme simülasyonu"
        description="Planlanan teklif snapshot’ına dokunmadan gerçek tahsilat ve finansman sapmalarını modelleyin."
      />
      <form className="panel scenario-create" onSubmit={(event) => void create(event)}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">YENİ SENARYO</span>
            <h2>Kaynak teklifi seçin</h2>
          </div>
          <GitBranch size={20} />
        </div>
        <div className="form-grid three">
          <label className="field">
            <span>Müşteri</span>
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setOfferId('');
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
          <label className="field">
            <span>Planlanan teklif</span>
            <select
              value={offerId}
              onChange={(event) => setOfferId(event.target.value)}
              disabled={!customerId}
            >
              <option value="">Teklif seçin</option>
              {customerOffers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.title} · v{offer.version}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Senaryo adı</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button className="button primary" disabled={!offerId}>
            <Plus size={16} /> Gerçekleşme senaryosu oluştur
          </button>
        </div>
      </form>
      {scenarios.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Henüz gerçekleşme senaryosu yok"
          description="Bir müşteriye ait planlanan teklifi seçerek gerçek ödeme veya what-if senaryosu başlatın."
        />
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">KAYITLI SENARYOLAR</span>
              <h2>Planlanan ↔ gerçekleşen</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Senaryo</th>
                  <th>Müşteri</th>
                  <th>Kaynak teklif</th>
                  <th>Planlanan kâr</th>
                  <th>Gerçekleşen kâr</th>
                  <th>Sapma</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => {
                  const customer = customers.find((item) => item.id === scenario.sourceCustomerId);
                  return (
                    <tr
                      key={scenario.id}
                      onClick={() => navigate(`/realization/${scenario.id}`)}
                      className="clickable-row"
                    >
                      <td>
                        <strong>{scenario.name}</strong>
                        <small>{formatDate(scenario.asOfDate)}</small>
                      </td>
                      <td>{customer?.name ?? '—'}</td>
                      <td>
                        {scenario.sourceOfferSnapshot.title} · v{scenario.sourceOfferVersion}
                      </td>
                      <td>{formatMoney(scenario.resultSnapshot.plannedProfit)}</td>
                      <td>{formatMoney(scenario.resultSnapshot.actualProfit)}</td>
                      <td
                        className={
                          scenario.resultSnapshot.variance >= 0 ? 'positive-text' : 'negative-text'
                        }
                      >
                        {formatMoney(scenario.resultSnapshot.variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ScenarioDetail({ initialScenario }: { initialScenario: RealizationScenario }) {
  const saveScenario = useAppStore((state) => state.saveScenario);
  const monthlyRate = useAppStore((state) => state.settings.lateFee.monthlyRate);
  const [scenario, setScenario] = useState<RealizationScenario>(() =>
    structuredClone(initialScenario),
  );
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [bulkRate, setBulkRate] = useState(0);
  const [payment, setPayment] = useState<Omit<ActualPayment, 'id'>>({
    date: initialScenario.asOfDate,
    amount: 0,
    channel: 'eft',
    note: '',
  });
  const result = useMemo(
    () => calculateRealization(scenario, monthlyRate),
    [scenario, monthlyRate],
  );
  const updateScenario = (patch: Partial<RealizationScenario>) =>
    setScenario({ ...scenario, ...patch, resultSnapshot: result });
  const addPayment = (event: FormEvent) => {
    event.preventDefault();
    if (payment.amount <= 0) return;
    updateScenario({
      actualPayments: [...scenario.actualPayments, { ...payment, id: newActualPaymentId() }],
    });
    setPayment({ ...payment, amount: 0, note: '' });
  };
  const applyRate = (scope: 'selected' | 'all') => {
    const ids =
      scope === 'all'
        ? scenario.sourceOfferSnapshot.resultSnapshot.periods.map((period) => period.id)
        : selectedPeriods;
    const other = scenario.periodOverrides.filter((override) => !ids.includes(override.periodId));
    updateScenario({
      periodOverrides: [
        ...other,
        ...ids.map((periodId) => ({
          ...scenario.periodOverrides.find((override) => override.periodId === periodId),
          periodId,
          scenarioOfferRate: bulkRate,
        })),
      ],
    });
  };
  return (
    <div>
      <Link to="/realization" className="back-link">
        <ArrowLeft size={16} /> Gerçekleşme senaryoları
      </Link>
      <PageHeader
        eyebrow={`${scenario.sourceOfferSnapshot.title} · v${scenario.sourceOfferVersion}`}
        title={scenario.name}
        description={`Hesaplama tarihi ${formatDate(scenario.asOfDate)} · Şirket aylık gecikme oranı %${formatNumber(monthlyRate, 2)}`}
        actions={
          <button
            className="button primary"
            onClick={() => void saveScenario({ ...scenario, resultSnapshot: result })}
          >
            <Save size={16} /> Senaryoyu kaydet
          </button>
        }
      />
      <div className="notice warning">
        <strong>Bu ekran kaynak teklifi değiştirmez.</strong> Yaptığınız değişiklikler yalnızca
        gerçekleşme / what-if senaryosunu etkiler.
      </div>
      <section className="metric-grid four">
        <MetricCard label="Planlanan net kâr" value={formatMoney(result.plannedProfit)} />
        <MetricCard
          label="Gerçekleşen net kâr"
          value={formatMoney(result.actualProfit)}
          tone={result.actualProfit >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Kâr sapması"
          value={formatMoney(result.variance)}
          tone={result.variance >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Açık ana para"
          value={formatMoney(result.endingOpenReceivable)}
          detail={`Gecikme bedeli ${formatMoney(result.totalLateFee)} · KDV ${formatMoney(result.totalLateFeeVat)}`}
          tone={result.endingOpenReceivable > 0 ? 'negative' : 'neutral'}
        />
      </section>
      <section className="panel scenario-controls">
        <div className="form-grid three">
          <label className="field">
            <span>Senaryo adı</span>
            <input
              value={scenario.name}
              onChange={(event) => updateScenario({ name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Hesaplama tarihi</span>
            <input
              type="date"
              value={scenario.asOfDate}
              onChange={(event) => updateScenario({ asOfDate: event.target.value })}
            />
            <small>Gecikme bu tarihe kadar hesaplanır.</small>
          </label>
          <NumberField
            label="Senaryo Teklif Oranı"
            unit="%"
            step="0.01"
            value={bulkRate}
            onValue={setBulkRate}
          />
        </div>
        <div className="bulk-actions">
          <button
            className="button ghost"
            disabled={selectedPeriods.length === 0}
            onClick={() => applyRate('selected')}
          >
            <CheckSquare2 size={16} /> Seçili aylara uygula
          </button>
          <button className="button ghost" onClick={() => applyRate('all')}>
            Tüm aylara uygula
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">KISMİ VE ÇOKLU TAHSİLAT</span>
            <h2>Gerçek tahsilat ekle</h2>
          </div>
          <CirclePlus size={20} />
        </div>
        <form className="form-grid five" onSubmit={addPayment}>
          <label className="field">
            <span>Fatura / dönem</span>
            <select
              value={payment.invoiceId ?? ''}
              onChange={(event) =>
                setPayment({ ...payment, invoiceId: event.target.value || undefined })
              }
            >
              <option value="">Genel · en eski açık fatura</option>
              {scenario.sourceOfferSnapshot.resultSnapshot.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.index}. dönem · {formatDate(period.invoiceDate)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Gerçek ödeme tarihi</span>
            <input
              type="date"
              value={payment.date}
              onChange={(event) => setPayment({ ...payment, date: event.target.value })}
            />
          </label>
          <NumberField
            label="Tahsilat tutarı"
            unit="TL"
            min={0}
            step="0.01"
            value={payment.amount}
            onValue={(amount) => setPayment({ ...payment, amount })}
          />
          <label className="field">
            <span>Kanal</span>
            <select
              value={payment.channel}
              onChange={(event) =>
                setPayment({ ...payment, channel: event.target.value as PaymentChannel })
              }
            >
              {Object.entries(PAYMENT_CHANNEL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary align-end">
            <Plus size={16} /> Tahsilat ekle
          </button>
        </form>
        {scenario.actualPayments.length > 0 && (
          <div className="payment-chips">
            {scenario.actualPayments.map((item) => (
              <div className="payment-chip" key={item.id}>
                <CalendarClock size={16} />
                <div>
                  <strong>{formatMoney(item.amount)}</strong>
                  <small>
                    {formatDate(item.date)} ·{' '}
                    {item.invoiceId ? `${item.invoiceId.replace('period_', '')}. dönem` : 'Genel'}
                  </small>
                </div>
                <button
                  className="icon-button danger"
                  aria-label="Tahsilatı sil"
                  onClick={() =>
                    updateScenario({
                      actualPayments: scenario.actualPayments.filter(
                        (candidate) => candidate.id !== item.id,
                      ),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DÖNEM BAZINDA</span>
            <h2>Planlanan ve gerçekleşen</h2>
          </div>
          <StatusBadge tone="info">{`${result.periods.length} dönem`}</StatusBadge>
        </div>
        <div className="table-wrap wide-table">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Tüm dönemleri seç"
                    checked={
                      selectedPeriods.length === result.periods.length && result.periods.length > 0
                    }
                    onChange={(event) =>
                      setSelectedPeriods(
                        event.target.checked ? result.periods.map((period) => period.periodId) : [],
                      )
                    }
                  />
                </th>
                <th>Dönem</th>
                <th>Planlanan fatura / vade</th>
                <th>Gerçek tahsilat</th>
                <th>Açık ana para</th>
                <th>Gecikme</th>
                <th>Gecikme bedeli + KDV</th>
                <th>Gerçek kredi / valör</th>
                <th>Senaryo oranı</th>
                <th>Kâr sapması</th>
              </tr>
            </thead>
            <tbody>
              {result.periods.map((period) => (
                <tr key={period.periodId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedPeriods.includes(period.periodId)}
                      onChange={(event) =>
                        setSelectedPeriods(
                          event.target.checked
                            ? [...selectedPeriods, period.periodId]
                            : selectedPeriods.filter((id) => id !== period.periodId),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>{period.periodId.replace('period_', '')}. dönem</strong>
                  </td>
                  <td>
                    {formatMoney(period.plannedInvoice)}
                    <small>{formatDate(period.plannedDueDate)}</small>
                  </td>
                  <td>
                    {formatMoney(period.actualPayments.reduce((sum, item) => sum + item.amount, 0))}
                    <small>{period.actualPayments.length} tahsilat</small>
                  </td>
                  <td className={period.outstandingPrincipal > 0 ? 'negative-text' : ''}>
                    {formatMoney(period.outstandingPrincipal)}
                  </td>
                  <td>{period.delayDays} gün</td>
                  <td>
                    {formatMoney(period.lateFee)}
                    <small>KDV {formatMoney(period.lateFeeVat)}</small>
                  </td>
                  <td>
                    {formatMoney(period.actualCreditCost)}
                    <small>Valör {formatMoney(period.actualValorIncome)}</small>
                  </td>
                  <td>%{formatNumber(period.scenarioOfferRate)}</td>
                  <td className={period.variance >= 0 ? 'positive-text' : 'negative-text'}>
                    {formatMoney(period.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
