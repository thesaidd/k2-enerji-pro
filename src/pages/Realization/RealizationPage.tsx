import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CalendarDays,
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
  newActualRefundId,
} from '../../domain/realization/realization';
import { paymentCalendarUrl } from '../../domain/payment-calendar/paymentCalendar';
import { marketPriceSourceLabel } from '../../domain/market-prices/marketPrices';
import {
  calculateActualPaymentFinancials,
  resolveActualPaymentCommissionDefaults,
} from '../../domain/payment-plan/actualPaymentFinancials';
import { EmptyState } from '../../components/ui/EmptyState';
import { MetricCard } from '../../components/ui/MetricCard';
import { NumberField } from '../../components/ui/NumberField';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDate, formatMoney, formatNumber } from '../../components/ui/format';
import type {
  ActualCustomerRefund,
  ActualPayment,
  PaymentChannel,
  RealizationScenario,
} from '../../types';

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
  const settings = useAppStore((state) => state.settings);
  const [customerId, setCustomerId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [name, setName] = useState('Gerçekleşen Durum');
  const customerOffers = offers.filter((offer) => offer.customerId === customerId);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const offer = offers.find((item) => item.id === offerId);
    if (!offer) return;
    const scenario = createRealizationScenario(
      offer,
      name,
      settings.monthlyMarketPrices,
      settings.holidays,
    );
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
  const notify = useAppStore((state) => state.notify);
  const settings = useAppStore((state) => state.settings);
  const monthlyRate = settings.lateFee.monthlyRate;
  const [scenario, setScenario] = useState<RealizationScenario>(() =>
    structuredClone(initialScenario),
  );
  const [asOfDateDraft, setAsOfDateDraft] = useState(initialScenario.asOfDate);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [bulkRate, setBulkRate] = useState(0);
  const [payment, setPayment] = useState<Omit<ActualPayment, 'id'>>({
    date: initialScenario.asOfDate,
    amount: 0,
    channel: 'eft',
    commissionRate: 0,
    commissionBearer: 'epsas',
    note: '',
  });
  const [refund, setRefund] = useState<Omit<ActualCustomerRefund, 'id'>>({
    date: initialScenario.asOfDate,
    amount: 0,
    note: '',
  });
  const result = useMemo(
    () =>
      calculateRealization(scenario, monthlyRate, settings.monthlyMarketPrices, settings.holidays),
    [scenario, monthlyRate, settings.holidays, settings.monthlyMarketPrices],
  );
  const updateScenario = (patch: Partial<RealizationScenario>) =>
    setScenario({ ...scenario, ...patch, resultSnapshot: result });
  const paymentDefaults = resolveActualPaymentCommissionDefaults(
    payment.receivableInstallmentId,
    result.receivableLedger.installments,
    scenario.sourceOfferSnapshot.resultSnapshot.plannedPayments,
  );
  const paymentPreview = calculateActualPaymentFinancials(
    { ...payment, id: 'payment_preview' },
    paymentDefaults,
  );
  const addPayment = (event: FormEvent) => {
    event.preventDefault();
    if (payment.amount <= 0 || !payment.date || payment.date > scenario.asOfDate) return;
    updateScenario({
      actualPayments: [...scenario.actualPayments, { ...payment, id: newActualPaymentId() }],
    });
    setPayment({ ...payment, amount: 0, note: '' });
  };
  const addRefund = (event: FormEvent) => {
    event.preventDefault();
    if (refund.amount <= 0 || !refund.date || refund.date > scenario.asOfDate) return;
    if (refund.amount > result.receivableLedger.customerAdvance + 1e-6) {
      notify({
        tone: 'error',
        title: 'İade müşteri avansını aşamaz',
        detail: `Kullanılabilir avans ${formatMoney(result.receivableLedger.customerAdvance)}`,
      });
      return;
    }
    updateScenario({
      actualRefunds: [
        ...(scenario.actualRefunds ?? []),
        { ...refund, id: newActualRefundId() },
      ],
    });
    setRefund({ ...refund, amount: 0, note: '' });
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
  const updateMarketOverride = (
    periodId: string,
    key: 'ptfUnitPrice' | 'yekdemUnitPrice',
    value: number | undefined,
  ) => {
    const current = scenario.periodOverrides.find((override) => override.periodId === periodId);
    updateScenario({
      periodOverrides: [
        ...scenario.periodOverrides.filter((override) => override.periodId !== periodId),
        { ...current, periodId, [key]: value },
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
          <div className="page-actions">
            <Link
              className="button secondary"
              to={paymentCalendarUrl('realization_scenario', scenario.id)}
            >
              <CalendarDays size={16} /> Ödeme / Kullanım Takvimini Aç
            </Link>
            <button
              className="button primary"
              onClick={() => void saveScenario({ ...scenario, resultSnapshot: result })}
            >
              <Save size={16} /> Senaryoyu kaydet
            </button>
          </div>
        }
      />
      <div className="notice warning">
        <strong>Bu ekran kaynak teklifi değiştirmez.</strong> Yaptığınız değişiklikler yalnızca
        gerçekleşme / what-if senaryosunu etkiler.
      </div>
      {result.marketPriceWarnings?.map((warning) => (
        <div className="notice warning" key={warning}>
          {warning}
        </div>
      ))}
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
      <section className="metric-grid four">
        <MetricCard
          label="Gerçek kanal maliyeti"
          value={formatMoney(result.actualPaymentChannelCost)}
        />
        <MetricCard
          label="Gerçek GES ihtiyaç fazlası alımı"
          value={formatMoney(result.actualExcessProductionPurchase)}
        />
        <MetricCard
          label="Gerçek kredi / valör"
          value={formatMoney(result.actualCreditCost)}
          detail={`Valör ${formatMoney(result.actualValorIncome)}`}
        />
        <MetricCard
          label="Açık finansman bakiyesi"
          value={formatMoney(result.openFinancingBalance)}
          detail={`Bitiş ${result.financingEndDate}`}
          tone={result.openFinancingBalance > 0 ? 'negative' : 'neutral'}
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
              value={asOfDateDraft}
              onChange={(event) => {
                const nextAsOfDate = event.target.value;
                setAsOfDateDraft(nextAsOfDate);
                if (/^\d{4}-\d{2}-\d{2}$/.test(nextAsOfDate)) {
                  updateScenario({ asOfDate: nextAsOfDate });
                }
              }}
              onBlur={() => {
                if (!asOfDateDraft) setAsOfDateDraft(scenario.asOfDate);
              }}
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
          <NumberField
            label="Senaryo Yıllık Kredi Faizi"
            unit="%"
            min={0}
            step="0.01"
            value={scenario.financingOverrides?.creditRate ?? scenario.sourceOfferSnapshot.stateSnapshot.creditRate}
            onValue={(creditRate) =>
              updateScenario({
                financingOverrides: { ...scenario.financingOverrides, creditRate },
              })
            }
          />
          <NumberField
            label="Senaryo Yıllık Valör Faizi"
            unit="%"
            min={0}
            step="0.01"
            value={scenario.financingOverrides?.valorRate ?? scenario.sourceOfferSnapshot.stateSnapshot.valorRate}
            onValue={(valorRate) =>
              updateScenario({
                financingOverrides: { ...scenario.financingOverrides, valorRate },
              })
            }
          />
          <div className="field align-end">
            <button
              type="button"
              className="button ghost"
              onClick={() => updateScenario({ financingOverrides: undefined })}
            >
              Kaynak teklif değerine dön
            </button>
          </div>
        </div>
        <div className="notice info">
          Kredi yalnız negatif, valör yalnız pozitif faiz bazında 365 gün esasıyla
          günlük bileşir. Finansman ortak sözleşme bakiyesinden dönem brüt fatura payıyla
          dağıtılır; değişiklik kaynak teklifi etkilemez.
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
            <span className="eyebrow">MÜŞTERİ AVANSI</span>
            <h2>Gerçek müşteri iadesi</h2>
          </div>
          <strong>{formatMoney(result.receivableLedger.customerAdvance)} kullanılabilir</strong>
        </div>
        <div className="notice info">
          İade kâr değildir; müşteri avansını azaltır ve finansman nakit bakiyesine çıkış olarak
          girer. Planlanan iade talimatı gerçekleşmiş iade sayılmaz.
        </div>
        <form className="form-grid four" onSubmit={addRefund}>
          <label className="field">
            <span>Gerçek iade tarihi</span>
            <input
              type="date"
              value={refund.date}
              max={scenario.asOfDate}
              onChange={(event) => setRefund({ ...refund, date: event.target.value })}
            />
          </label>
          <NumberField
            label="İade tutarı"
            unit="TL"
            min={0}
            max={result.receivableLedger.customerAdvance}
            step="0.01"
            value={refund.amount}
            onValue={(amount) => setRefund({ ...refund, amount })}
          />
          <label className="field">
            <span>Not</span>
            <input
              value={refund.note ?? ''}
              onChange={(event) => setRefund({ ...refund, note: event.target.value })}
            />
          </label>
          <button className="button primary align-end" disabled={result.receivableLedger.customerAdvance <= 0}>
            <Plus size={16} /> İade ekle
          </button>
        </form>
        {(scenario.actualRefunds ?? []).length > 0 && (
          <div className="payment-chips">
            {(scenario.actualRefunds ?? []).map((item) => (
              <div className="payment-chip" key={item.id}>
                <CalendarClock size={16} />
                <div>
                  <strong>{formatMoney(item.amount)}</strong>
                  <small>{formatDate(item.date)} · Gerçek müşteri iadesi</small>
                </div>
                <button
                  className="icon-button danger"
                  aria-label="İadeyi sil"
                  onClick={() =>
                    updateScenario({
                      actualRefunds: (scenario.actualRefunds ?? []).filter(
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
            <span className="eyebrow">KISMİ VE ÇOKLU TAHSİLAT</span>
            <h2>Gerçek tahsilat ekle</h2>
          </div>
          <CirclePlus size={20} />
        </div>
        <form className="form-grid four" onSubmit={addPayment}>
          <label className="field">
            <span>Fatura / dönem</span>
            <select
              value={
                payment.receivableInstallmentId
                  ? `installment:${payment.receivableInstallmentId}`
                  : payment.invoiceId
                    ? `invoice:${payment.invoiceId}`
                    : ''
              }
              onChange={(event) => {
                const [kind, id] = event.target.value.split(':');
                if (kind === 'installment') {
                  const installment = result.receivableLedger.installments.find(
                    (item) => item.id === id,
                  );
                  const defaults = resolveActualPaymentCommissionDefaults(
                    installment?.id,
                    result.receivableLedger.installments,
                    scenario.sourceOfferSnapshot.resultSnapshot.plannedPayments,
                  );
                  setPayment({
                    ...payment,
                    invoiceId: installment?.invoiceId,
                    receivableInstallmentId: installment?.id,
                    channel: defaults.paymentChannel ?? payment.channel,
                    commissionRate: defaults.commissionRate,
                    commissionBearer: defaults.commissionBearer,
                  });
                } else
                  setPayment({
                    ...payment,
                    invoiceId: kind === 'invoice' ? id : undefined,
                    receivableInstallmentId: undefined,
                    commissionRate: 0,
                    commissionBearer: 'epsas',
                  });
              }}
            >
              <option value="">Genel · en eski açık fatura</option>
              <optgroup label="Fatura / dönem">
                {scenario.sourceOfferSnapshot.resultSnapshot.periods.map((period) => (
                  <option key={period.id} value={`invoice:${period.id}`}>
                    {period.index}. dönem · {formatDate(period.invoiceDate)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Alacak / vade dilimi">
                {result.receivableLedger.installments.map((installment) => (
                  <option key={installment.id} value={`installment:${installment.id}`}>
                    {installment.periodIndex}. dönem · {formatMoney(installment.principalAmount)} ·{' '}
                    {formatDate(installment.dueDate)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="field">
            <span>Gerçek ödeme tarihi</span>
            <input
              type="date"
              value={payment.date}
              max={scenario.asOfDate}
              onChange={(event) => setPayment({ ...payment, date: event.target.value })}
            />
            <small>İleri tarihli tahsilatlar bu senaryo sonucuna dahil edilmez.</small>
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
          <NumberField
            label="Komisyon oranı"
            unit="%"
            min={0}
            max={100}
            step="0.01"
            value={payment.commissionRate ?? paymentDefaults.commissionRate}
            onValue={(commissionRate) => setPayment({ ...payment, commissionRate })}
          />
          <label className="field">
            <span>Komisyonu ödeyen</span>
            <select
              value={payment.commissionBearer ?? paymentDefaults.commissionBearer}
              onChange={(event) =>
                setPayment({
                  ...payment,
                  commissionBearer: event.target.value as 'epsas' | 'customer',
                })
              }
            >
              <option value="epsas">EPSAŞ</option>
              <option value="customer">Müşteri</option>
            </select>
            <small>
              {paymentDefaults.sourcePlannedPaymentId
                ? 'Seçilen vade diliminin planlı satırından varsayılan getirildi.'
                : 'Eşleşen vade yok: varsayılan %0 ve EPSAŞ.'}
            </small>
          </label>
          <div className="field financial-preview">
            <span>Tahmini EPSAŞ kanal maliyeti</span>
            <strong>{formatMoney(paymentPreview.epsasChannelCost)}</strong>
          </div>
          <div className="field financial-preview">
            <span>EPSAŞ net nakit girişi</span>
            <strong>{formatMoney(paymentPreview.netCashIn)}</strong>
          </div>
          <button className="button primary align-end">
            <Plus size={16} /> Tahsilat ekle
          </button>
        </form>
        {scenario.actualPayments.length > 0 && (
          <div className="payment-chips">
            {scenario.actualPayments.map((item) => {
              const financials = result.actualPaymentFinancials.find(
                (candidate) => candidate.paymentId === item.id,
              );
              return (
              <div className="payment-chip" key={item.id}>
                <CalendarClock size={16} />
                <div>
                  <strong>{formatMoney(item.amount)}</strong>
                  <small>
                    {formatDate(item.date)} ·{' '}
                    {item.receivableInstallmentId
                      ? 'Vade dilimine atanmış'
                      : item.invoiceId
                        ? `${item.invoiceId.replace('period_', '')}. dönem`
                        : 'Genel'}
                  </small>
                  <small>
                    {PAYMENT_CHANNEL_LABELS[item.channel]} · EPSAŞ komisyonu{' '}
                    {formatMoney(financials?.epsasChannelCost ?? 0)} · Müşteri kanal ücreti{' '}
                    {formatMoney(financials?.customerChannelFee ?? 0)} · Net nakit{' '}
                    {formatMoney(financials?.netCashIn ?? item.amount)}
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
              );
            })}
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
                <th>PTF / YEKDEM</th>
                <th>Dönem</th>
                <th>Planlanan fatura / vade</th>
                <th>Gerçek tahsilat</th>
                <th>Açık ana para</th>
                <th>Gecikme</th>
                <th>Gecikme bedeli + KDV</th>
                <th>Gerçek kredi / valör</th>
                <th>Gerçek kanal / GES</th>
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
                    <strong>
                      {formatNumber(period.ptfUnitPrice ?? 0, 3)} /{' '}
                      {formatNumber(period.yekdemUnitPrice ?? 0, 3)} TL/MWh
                    </strong>
                    <small>
                      {marketPriceSourceLabel(period.ptfPriceSource, 'realization')} /{' '}
                      {marketPriceSourceLabel(period.yekdemPriceSource, 'realization')}
                    </small>
                    <input
                      aria-label={`${period.periodId} manuel PTF`}
                      type="number"
                      step="0.001"
                      placeholder="Manuel PTF"
                      value={
                        scenario.periodOverrides.find(
                          (override) => override.periodId === period.periodId,
                        )?.ptfUnitPrice ?? ''
                      }
                      onChange={(event) =>
                        updateMarketOverride(
                          period.periodId,
                          'ptfUnitPrice',
                          event.target.value === '' ? undefined : Number(event.target.value),
                        )
                      }
                    />
                    <input
                      aria-label={`${period.periodId} manuel YEKDEM`}
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="Manuel YEKDEM"
                      value={
                        scenario.periodOverrides.find(
                          (override) => override.periodId === period.periodId,
                        )?.yekdemUnitPrice ?? ''
                      }
                      onChange={(event) =>
                        updateMarketOverride(
                          period.periodId,
                          'yekdemUnitPrice',
                          event.target.value === '' ? undefined : Number(event.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>{period.periodId.replace('period_', '')}. dönem</strong>
                  </td>
                  <td>
                    <strong>{formatMoney(period.invoiceSummary.totalPayable)}</strong>
                    <small>Enerji faturası {formatMoney(period.plannedInvoice)}</small>
                    {period.receivableInstallments.map((installment) => (
                      <small key={installment.id}>
                        Vade {formatDate(installment.dueDate)} ·{' '}
                        {formatMoney(installment.principalAmount)} · açık{' '}
                        {formatMoney(installment.outstandingPrincipal)}
                      </small>
                    ))}
                    {period.invoiceSummary.carryoverLines.map((line) => (
                      <small key={line.id}>
                        {line.label}: {formatMoney(line.amount)}
                      </small>
                    ))}
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
                  <td>
                    {formatMoney(period.actualPaymentChannelCost)}
                    <small>GES {formatMoney(period.actualExcessProductionPurchase)}</small>
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
      {result.finalLateFeeDocuments.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NİHAİ BELGE</span>
              <h2>Nihai Gecikme Bedeli Faturası</h2>
            </div>
            <StatusBadge tone="warning">{`${result.finalLateFeeDocuments.length} belge`}</StatusBadge>
          </div>
          <div className="table-wrap wide-table">
            <table>
              <thead>
                <tr>
                  <th>Kaynak</th>
                  <th>Hesaplama dönemi</th>
                  <th>Açık ana para</th>
                  <th>Gecikme bedeli</th>
                  <th>Kaynak KDV</th>
                  <th>Gecikme KDV’si</th>
                  <th>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {result.finalLateFeeDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <strong>{document.sourceInvoiceId}</strong>
                      <small>{document.sourceReceivableInstallmentId}</small>
                    </td>
                    <td>
                      {formatDate(document.calculationStartDate)} –{' '}
                      {formatDate(document.calculationEndDate)}
                      <small>Belge {formatDate(document.issueDate)}</small>
                    </td>
                    <td>{formatMoney(document.openPrincipal)}</td>
                    <td>{formatMoney(document.lateFee)}</td>
                    <td>%{formatNumber(document.sourceVatRate * 100)}</td>
                    <td>{formatMoney(document.lateFeeVat)}</td>
                    <td>
                      <strong>{formatMoney(document.totalAmount)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
