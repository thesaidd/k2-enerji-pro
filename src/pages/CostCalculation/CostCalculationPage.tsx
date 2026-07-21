import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDollarSign,
  Landmark,
  Save,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store/useAppStore';
import { applyTariffDefaults, TARIFFS } from '../../config/tariffs';
import { calculateOffer, sensitivitySeries } from '../../domain/profitability/calculation';
import { listContractMonths } from '../../domain/market-prices/marketPrices';
import { PaymentPlanEditor } from '../../components/payment-plan/PaymentPlanEditor';
import { SensitivityChart } from '../../components/charts/SensitivityChart';
import { MetricCard } from '../../components/ui/MetricCard';
import { NumberField } from '../../components/ui/NumberField';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatMoney, formatNumber, formatPercent } from '../../components/ui/format';
import type { OfferState } from '../../types';

const steps = [
  { number: 1, label: 'Tüketim', hint: 'Teknik bilgiler' },
  { number: 2, label: 'Maliyet', hint: 'Tarife ve finansman' },
  { number: 3, label: 'Ödeme planı', hint: 'Paranın zamanı' },
  { number: 4, label: 'Başabaş', hint: 'Maliyet sonucu' },
  { number: 5, label: 'Teklif', hint: 'Canlı simülasyon' },
];

export function CostCalculationPage() {
  const navigate = useNavigate();
  const draft = useAppStore((state) => state.draft);
  const setDraft = useAppStore((state) => state.setDraft);
  const allCustomers = useAppStore((state) => state.customers);
  const customers = allCustomers.filter((customer) => !customer.isArchived);
  const settings = useAppStore((state) => state.settings);
  const saveStatus = useAppStore((state) => state.saveStatus);
  const saveCostDraft = useAppStore((state) => state.saveCostDraft);
  const savePlannedOffer = useAppStore((state) => state.savePlannedOffer);
  const notify = useAppStore((state) => state.notify);
  const [step, setStep] = useState(1);
  const effectiveState = useMemo(
    () => ({ ...draft, offerRate: step < 5 ? 0 : draft.offerRate }),
    [draft, step],
  );
  const result = useMemo(
    () => calculateOffer(effectiveState, settings.holidays, settings.monthlyMarketPrices),
    [effectiveState, settings.holidays, settings.monthlyMarketPrices],
  );
  const sensitivity = useMemo(
    () =>
      step === 5
        ? sensitivitySeries(draft, settings.holidays, -5, 20, 1, settings.monthlyMarketPrices)
        : [],
    [draft, settings.holidays, settings.monthlyMarketPrices, step],
  );
  const marketMonths = useMemo(
    () => listContractMonths(draft.usageStart, draft.usageEnd),
    [draft.usageEnd, draft.usageStart],
  );
  const onlyMarketPricesMissing = result.errors[0] === 'Aşağıdaki dönemlerin piyasa tahmini eksik:';
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (saveStatus === 'dirty') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus]);
  const update = <K extends keyof OfferState>(key: K, value: OfferState[K]) =>
    setDraft({ [key]: value } as Pick<OfferState, K>);
  const applyTariff = (key: string) => setDraft(applyTariffDefaults(key, draft.hasDistribution));
  const goNext = () => {
    if (step === 1 && (!draft.usageStart || !draft.usageEnd || draft.monthlyConsumption < 0)) {
      notify({ tone: 'error', title: 'Tüketim bilgilerini kontrol edin' });
      return;
    }
    if (step === 3 && !result.valid && !onlyMarketPricesMissing) {
      notify({
        tone: 'error',
        title: 'Ödeme planı geçerli değil',
        detail: result.errors.join(' '),
      });
      return;
    }
    setStep(Math.min(5, step + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const saveFinal = async () => {
    try {
      const offer = await savePlannedOffer();
      navigate(`/offers/${offer.id}`);
    } catch (error) {
      notify({
        tone: 'error',
        title: 'Teklif kaydedilemedi',
        detail: error instanceof Error ? error.message : 'Güvenli kayıt hatası',
      });
    }
  };
  return (
    <div>
      <PageHeader
        eyebrow="5 ADIMLI TİCARİ AKIŞ"
        title="Maliyet hesaplama"
        description="Teklif oranından önce gerçek tedarik ve finansman maliyetini görün."
      />
      <ol className="stepper" aria-label="Maliyet hesaplama adımları">
        {steps.map((item) => (
          <li
            key={item.number}
            className={step === item.number ? 'active' : step > item.number ? 'complete' : ''}
          >
            <button onClick={() => setStep(item.number)}>
              <span>{step > item.number ? <Check size={15} /> : item.number}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </div>
            </button>
          </li>
        ))}
      </ol>
      <div className="wizard-surface">
        {step === 1 && (
          <section>
            <div className="section-intro">
              <span className="section-number">01</span>
              <div>
                <h2>Tüketim ve teknik bilgiler</h2>
                <p>Sözleşme dönemini ve müşterinin şebekeden alacağı enerjiyi tanımlayın.</p>
              </div>
            </div>
            <div className="form-grid three">
              <label className="field">
                <span>Müşteri</span>
                <select
                  value={draft.customerId}
                  onChange={(event) => update('customerId', event.target.value)}
                >
                  <option value="">Müşteri seçilmedi</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                <small>Maliyet taslağı müşteri olmadan, nihai teklif müşteriyle kaydedilir.</small>
              </label>
              <label className="field span-2">
                <span>Çalışma başlığı</span>
                <input
                  value={draft.title}
                  onChange={(event) => update('title', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Kullanım başlangıcı</span>
                <input
                  type="date"
                  value={draft.usageStart}
                  onChange={(event) => update('usageStart', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Kullanım bitişi</span>
                <input
                  type="date"
                  value={draft.usageEnd}
                  onChange={(event) => update('usageEnd', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Tüketim birimi</span>
                <select
                  value={draft.monthlyConsumptionUnit}
                  onChange={(event) =>
                    update(
                      'monthlyConsumptionUnit',
                      event.target.value as OfferState['monthlyConsumptionUnit'],
                    )
                  }
                >
                  <option>MWh</option>
                  <option>kWh</option>
                </select>
              </label>
              <NumberField
                label="Aylık tüketim"
                unit={draft.monthlyConsumptionUnit}
                min={0}
                step="0.001"
                value={draft.monthlyConsumption}
                onValue={(value) => update('monthlyConsumption', value)}
                hint="Kısmi aylar gerçek gün sayısına göre oranlanır."
              />
            </div>
            <div className="subsection">
              <div className="subsection-head">
                <div>
                  <span className="eyebrow">GES MODELİ</span>
                  <h3>Öz tüketim, bir alacak değildir.</h3>
                  <p>Şebekeden satın alınmayan enerjinin ekonomik değerini ayrı izliyoruz.</p>
                </div>
                <div className="segmented">
                  <button
                    className={draft.ges.mode === 'simple_self_consumption' ? 'active' : ''}
                    onClick={() => update('ges', { ...draft.ges, mode: 'simple_self_consumption' })}
                  >
                    Basit öz tüketim
                  </button>
                  <button
                    className={draft.ges.mode === 'advanced_metering' ? 'active' : ''}
                    onClick={() => update('ges', { ...draft.ges, mode: 'advanced_metering' })}
                  >
                    Gelişmiş ölçüm
                  </button>
                </div>
              </div>
              {draft.ges.mode === 'simple_self_consumption' ? (
                <div className="form-grid three">
                  <NumberField
                    label="GES Öz Tüketim Oranı"
                    unit="%"
                    min={0}
                    max={100}
                    step="0.01"
                    value={draft.ges.selfConsumptionRate}
                    onValue={(value) => update('ges', { ...draft.ges, selfConsumptionRate: value })}
                  />
                  <div className="formula-callout">
                    <Zap size={18} />
                    <div>
                      <strong>Net şebeke tüketimi</strong>
                      <span>Brüt tüketim − GES öz tüketimi</span>
                    </div>
                  </div>
                  <div className="formula-callout">
                    <Sparkles size={18} />
                    <div>
                      <strong>Ek nakit girişi yok</strong>
                      <span>GES tasarrufu müşteri tahsilatı değildir.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <AdvancedGes value={draft.ges} onChange={(ges) => update('ges', ges)} />
              )}
            </div>
          </section>
        )}
        {step === 2 && (
          <section>
            <div className="section-intro">
              <span className="section-number">02</span>
              <div>
                <h2>Maliyet girdileri</h2>
                <p>Tarife, vergi, operasyon ve finansman varsayımlarını belirleyin.</p>
              </div>
            </div>
            <div className="form-grid three">
              <label className="field span-2">
                <span>Müşteri tipi</span>
                <select
                  value={draft.customerType}
                  onChange={(event) => applyTariff(event.target.value)}
                >
                  {TARIFFS.map((tariff) => (
                    <option key={tariff.key} value={tariff.key}>
                      {tariff.label}
                    </option>
                  ))}
                </select>
                <small>KDV, BTV ve dağıtım 2026 demo tarife tablosundan otomatik seçilir.</small>
              </label>
              <button
                type="button"
                className="button ghost align-end"
                onClick={() => applyTariff(draft.customerType)}
              >
                Varsayılana dön
              </button>
              <div className="notice info span-3">
                <strong>Bu teklif aylık piyasa tahminlerinden hesaplanacaktır.</strong> PTF ve
                YEKDEM değerleri Ayarlar ekranındaki sözleşme aylarıyla eşleştirilir.
              </div>
              <div className="table-wrap span-3">
                <table aria-label="Teklif aylık piyasa tahminleri">
                  <thead>
                    <tr>
                      <th>Dönem</th>
                      <th>Tahmini PTF</th>
                      <th>Tahmini YEKDEM</th>
                      <th>PTF + YEKDEM</th>
                      <th>Veri durumu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketMonths.map((month) => {
                      const record = settings.monthlyMarketPrices.find(
                        (item) => item.month === month,
                      );
                      const ready =
                        record?.forecastPtfTlMwh != null && record.forecastYekdemTlMwh != null;
                      return (
                        <tr key={month}>
                          <td>
                            <strong>{month}</strong>
                          </td>
                          <td>
                            {record?.forecastPtfTlMwh == null
                              ? 'Eksik'
                              : `${formatNumber(record.forecastPtfTlMwh, 3)} TL/MWh`}
                          </td>
                          <td>
                            {record?.forecastYekdemTlMwh == null
                              ? 'Eksik'
                              : `${formatNumber(record.forecastYekdemTlMwh, 3)} TL/MWh`}
                          </td>
                          <td>
                            {ready
                              ? `${formatNumber(
                                  record.forecastPtfTlMwh! + record.forecastYekdemTlMwh!,
                                  3,
                                )} TL/MWh`
                              : '—'}
                          </td>
                          <td className={ready ? 'positive-text' : 'negative-text'}>
                            {ready ? 'Tahmin hazır' : 'Tahmin eksik'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <NumberField
                label="Dağıtım"
                unit="TL/MWh"
                min={0}
                step="0.001"
                value={draft.distributionUnitTlMwh}
                onValue={(value) => update('distributionUnitTlMwh', value)}
              />
              <NumberField
                label="Sözleşme gücü"
                unit="TL"
                min={0}
                step="0.01"
                value={draft.contractPowerTl}
                onValue={(value) => update('contractPowerTl', value)}
                hint="Sözleşme geneli sabit tutar; dönemlere oransal dağılır."
              />
              <NumberField
                label="KDV"
                unit="%"
                min={0}
                max={100}
                step="0.01"
                value={draft.kdvRate}
                onValue={(value) => update('kdvRate', value)}
              />
              <NumberField
                label="BTV"
                unit="%"
                min={0}
                max={100}
                step="0.01"
                value={draft.btvRate}
                onValue={(value) => update('btvRate', value)}
              />
              <NumberField
                label="Dengesizlik"
                unit="%"
                min={0}
                step="0.01"
                value={draft.imbalanceRate}
                onValue={(value) => update('imbalanceRate', value)}
              />
              <NumberField
                label="PİÜ"
                unit="%"
                min={0}
                step="0.01"
                value={draft.piuRate}
                onValue={(value) => update('piuRate', value)}
              />
              <NumberField
                label="Yıllık kredi faizi"
                unit="%"
                min={0}
                step="0.01"
                value={draft.creditRate}
                onValue={(value) => update('creditRate', value)}
                hint="365 gün; yalnız negatif bakiyede günlük bileşik."
              />
              <NumberField
                label="Yıllık valör faizi"
                unit="%"
                min={0}
                step="0.01"
                value={draft.valorRate}
                onValue={(value) => update('valorRate', value)}
                hint="Pozitif bakiye bir sonraki gün getiri üretir."
              />
            </div>
            <div className="subsection">
              <h3>Tedarikçi ödeme günleri</h3>
              <div className="form-grid four">
                <NumberField
                  label="YEKDEM ödeme farkı"
                  unit="gün"
                  value={draft.yekdemDueOffset}
                  onValue={(value) => update('yekdemDueOffset', value)}
                />
                <NumberField
                  label="Dağıtım / güç farkı"
                  unit="gün"
                  value={draft.distributionDueOffset}
                  onValue={(value) => update('distributionDueOffset', value)}
                />
                <NumberField
                  label="KDV ödeme farkı"
                  unit="gün"
                  value={draft.kdvDueOffset}
                  onValue={(value) => update('kdvDueOffset', value)}
                />
                <NumberField
                  label="BTV ödeme farkı"
                  unit="gün"
                  value={draft.btvDueOffset}
                  onValue={(value) => update('btvDueOffset', value)}
                />
              </div>
            </div>
          </section>
        )}
        {step === 3 && (
          <section>
            <div className="notice warning">
              <strong>Teklif oranı henüz girilmedi.</strong> Ödeme tutarları %0 teklif marjlı
              referans fatura üzerinden geçici hesaplanıyor.
            </div>
            <PaymentPlanEditor
              plan={draft.paymentPlan}
              onChange={(paymentPlan) => update('paymentPlan', paymentPlan)}
              previewPayments={result.plannedPayments}
            />
          </section>
        )}
        {step === 4 && (
          <section>
            <div className="section-intro">
              <span className="section-number">04</span>
              <div>
                <h2>Maliyet sonucu ve başabaş</h2>
                <p>Teklif oranı girmeden önce tedarik, operasyon ve finansman maliyetini görün.</p>
              </div>
            </div>
            {!result.valid ? (
              <div className="notice error">
                <strong>Hesaplama tamamlanamadı.</strong>
                {result.errors.join(' ')}
              </div>
            ) : (
              <>
                <div className="metric-grid four">
                  <MetricCard
                    icon={Landmark}
                    label="Toplam tedarik maliyeti"
                    value={formatMoney(result.totals.activeEnergyBaseAmount)}
                    detail={`${formatNumber(result.totals.unitSupplyCost, 3)} TL/MWh finansman dahil`}
                  />
                  <MetricCard
                    label="Operasyonel maliyet"
                    value={formatMoney(result.totals.operationalCost)}
                    detail="Dengesizlik + PİÜ + kanal"
                  />
                  <MetricCard
                    label="Geçici finansman etkisi"
                    value={formatMoney(result.totals.creditCost - result.totals.valorIncome)}
                    detail={`Kredi ${formatMoney(result.totals.creditCost)} · Valör ${formatMoney(result.totals.valorIncome)}`}
                  />
                  <MetricCard
                    icon={CircleDollarSign}
                    label="Tahmini başabaş oranı"
                    value={formatPercent(result.totals.breakevenOfferRate)}
                    detail={`${formatNumber(result.totals.breakevenUnitPrice, 3)} TL/MWh`}
                    tone="accent"
                  />
                </div>
                <div className="cost-waterfall">
                  <div>
                    <span>Aktif enerji tabanı</span>
                    <strong>{formatMoney(result.totals.activeEnergyBaseAmount)}</strong>
                  </div>
                  <span>+</span>
                  <div>
                    <span>Operasyon</span>
                    <strong>{formatMoney(result.totals.operationalCost)}</strong>
                  </div>
                  <span>+</span>
                  <div>
                    <span>Kredi − valör</span>
                    <strong>
                      {formatMoney(result.totals.creditCost - result.totals.valorIncome)}
                    </strong>
                  </div>
                  <span>=</span>
                  <div className="total">
                    <span>Finansman dahil maliyet</span>
                    <strong>{formatMoney(result.totals.financingIncludedCost)}</strong>
                  </div>
                </div>
              </>
            )}
            <div className="draft-save-card">
              <div>
                <Save size={20} />
                <div>
                  <strong>Teklif oranı olmadan kaydedebilirsiniz.</strong>
                  <span>
                    Maliyet ve ödeme planı yapısı saklanır; müşteriye sunulamaz ve teklif PDF’i
                    üretmez.
                  </span>
                </div>
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  void saveCostDraft().catch((error: unknown) =>
                    notify({
                      tone: 'error',
                      title: 'Maliyet taslağı kaydedilemedi',
                      detail: error instanceof Error ? error.message : 'Kayıt hatası',
                    }),
                  )
                }
              >
                Maliyet taslağını kaydet
              </button>
            </div>
          </section>
        )}
        {step === 5 && (
          <section>
            <div className="section-intro">
              <span className="section-number">05</span>
              <div>
                <h2>Teklif simülasyonu</h2>
                <p>Oranı değiştirin; fatura, finansman ve EPSAŞ kârı anında yeniden hesaplansın.</p>
              </div>
            </div>
            <div className="offer-control">
              <div>
                <NumberField
                  label="Teklif oranı"
                  unit="%"
                  min={-99}
                  max={100}
                  step="0.01"
                  value={draft.offerRate ?? 0}
                  onValue={(value) => update('offerRate', value)}
                />
                <input
                  className="rate-slider"
                  aria-label="Teklif oranı kaydırıcısı"
                  type="range"
                  min="-5"
                  max="20"
                  step="0.1"
                  value={draft.offerRate ?? 0}
                  onChange={(event) => update('offerRate', Number(event.target.value))}
                />
                <div className="quick-rates">
                  {[0, 3, 5, 8, 12].map((rate) => (
                    <button type="button" key={rate} onClick={() => update('offerRate', rate)}>
                      %{rate}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="accent"
                    onClick={() => update('offerRate', result.totals.breakevenOfferRate)}
                  >
                    Başabaşa git
                  </button>
                </div>
              </div>
              <div className="live-profit">
                <span>Canlı EPSAŞ net kârı</span>
                <strong
                  className={result.totals.netProfit >= 0 ? 'positive-text' : 'negative-text'}
                >
                  {formatMoney(result.totals.netProfit)}
                </strong>
                <small>
                  {formatPercent(result.totals.netProfitRate, true)} ·{' '}
                  {formatNumber(result.totals.profitPerMwh, 2)} TL/MWh
                </small>
              </div>
            </div>
            <div className="metric-grid four">
              <MetricCard
                label="Aktif enerji satışı"
                value={formatMoney(result.totals.activeEnergySalesAmount)}
                detail={`Marj ${formatMoney(result.totals.offerMargin)}`}
              />
              <MetricCard
                label="Brüt müşteri faturası"
                value={formatMoney(result.totals.grossInvoice)}
                detail={`BTV ${formatMoney(result.totals.btvAmount)} · KDV ${formatMoney(result.totals.kdvAmount)}`}
                tone="accent"
              />
              <MetricCard
                label="Kredi − valör"
                value={formatMoney(result.totals.creditCost - result.totals.valorIncome)}
                detail={`Kanal ${formatMoney(result.totals.paymentChannelCost)}`}
              />
              <MetricCard
                label="Müşteri avantajı"
                value={formatMoney(result.totals.customerAdvantage)}
                detail="Referans tarife + GES tasarrufu"
                tone={result.totals.customerAdvantage >= 0 ? 'positive' : 'negative'}
              />
            </div>
            <div className="panel inline-chart">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">DUYARLILIK</span>
                  <h3>Teklif oranı → EPSAŞ net kârı</h3>
                </div>
                <span className="legend-dot">
                  <i /> Başabaş %{formatNumber(result.totals.breakevenOfferRate, 2)}
                </span>
              </div>
              <SensitivityChart data={sensitivity} breakeven={result.totals.breakevenOfferRate} />
            </div>
            <div className="final-save-bar">
              <div>
                <strong>Nihai teklif snapshot’ı</strong>
                <span>Müşteri, geçerli ödeme planı ve teklif oranı zorunludur.</span>
              </div>
              <button
                className="button primary"
                disabled={!draft.customerId || draft.offerRate == null || !result.valid}
                onClick={() => void saveFinal()}
              >
                <Save size={17} /> Nihai teklifi kaydet
              </button>
            </div>
          </section>
        )}
      </div>
      <div className="wizard-nav">
        <button className="button ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>
          <ArrowLeft size={16} /> Geri
        </button>
        <span>{step} / 5</span>
        {step < 5 ? (
          <button className="button primary" onClick={goNext}>
            Devam <ArrowRight size={16} />
          </button>
        ) : (
          <button className="button ghost" onClick={() => setStep(1)}>
            Başa dön
          </button>
        )}
      </div>
    </div>
  );
}

function AdvancedGes({
  value,
  onChange,
}: {
  value: OfferState['ges'];
  onChange: (value: OfferState['ges']) => void;
}) {
  const change = (key: keyof OfferState['ges'], next: string | number) =>
    onChange({ ...value, [key]: next });
  return (
    <div>
      <div className="notice warning">
        <strong>Vergi modu varsayılan olarak manuel.</strong> İhtiyaç fazlası satın alımı öz tüketim
        tasarrufundan ve müşteri tahsilatından ayrı saklanır.
      </div>
      <div className="form-grid four">
        <NumberField
          label="GES toplam üretimi"
          unit="MWh"
          min={0}
          value={value.totalProductionMwh ?? 0}
          onValue={(next) => change('totalProductionMwh', next)}
        />
        <NumberField
          label="Eş zamanlı öz tüketim"
          unit="MWh"
          min={0}
          value={value.simultaneousSelfConsumptionMwh ?? 0}
          onValue={(next) => change('simultaneousSelfConsumptionMwh', next)}
        />
        <NumberField
          label="Şebekeden çekiş"
          unit="MWh"
          min={0}
          value={value.gridImportMwh ?? 0}
          onValue={(next) => change('gridImportMwh', next)}
        />
        <NumberField
          label="Şebekeye veriş"
          unit="MWh"
          min={0}
          value={value.gridExportMwh ?? 0}
          onValue={(next) => change('gridExportMwh', next)}
        />
        <NumberField
          label="Mahsuplaşma sonrası fazla"
          unit="MWh"
          min={0}
          value={value.excessAfterNettingMwh ?? 0}
          onValue={(next) => change('excessAfterNettingMwh', next)}
        />
        <label className="field">
          <span>Fiyat tipi</span>
          <select
            value={value.priceType ?? 'manual'}
            onChange={(event) => change('priceType', event.target.value)}
          >
            <option value="regulated">Düzenlemeye tabi fiyat</option>
            <option value="ptf">PTF</option>
            <option value="ptf_yekdem">PTF + YEKDEM</option>
            <option value="manual">Manuel fiyat</option>
          </select>
        </label>
        <NumberField
          label="İhtiyaç fazlası alış fiyatı"
          unit="TL/MWh"
          min={0}
          value={value.excessPurchasePrice ?? 0}
          onValue={(next) => change('excessPurchasePrice', next)}
        />
        <label className="field">
          <span>Vergi durumu</span>
          <select
            value={value.excessProductionTaxMode ?? 'manual'}
            onChange={(event) => change('excessProductionTaxMode', event.target.value)}
          >
            <option value="manual">Manuel değerlendirme</option>
            <option value="no_tax_in_demo">Demoda vergi yok</option>
          </select>
        </label>
        <label className="field">
          <span>Mahsup şekli</span>
          <select
            value={value.settlementMode ?? 'cash_outflow'}
            onChange={(event) => change('settlementMode', event.target.value)}
          >
            <option value="cash_outflow">Ayrı nakit çıkışı</option>
            <option value="invoice_offset">Faturayla mahsup</option>
          </select>
        </label>
        <label className="field">
          <span>Ölçüm / mahsup</span>
          <select
            value={value.nettingMethod ?? 'monthly'}
            onChange={(event) => change('nettingMethod', event.target.value)}
          >
            <option value="monthly">Aylık</option>
            <option value="hourly">Saatlik</option>
            <option value="manual">Manuel</option>
          </select>
        </label>
      </div>
    </div>
  );
}
