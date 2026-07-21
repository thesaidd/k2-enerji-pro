import { useMemo, useState } from 'react';
import { CalendarDays, Download, FileSpreadsheet, Printer, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../app/store/useAppStore';
import {
  buildPlannedPaymentCalendar,
  buildRealizationPaymentCalendar,
  filterPaymentCalendarRows,
  paymentCalendarToExcelHtml,
  paymentCalendarToRows,
} from '../../domain/payment-calendar/paymentCalendar';
import { energyFromMwh } from '../../domain/consumption/conversions';
import { downloadText, toCsv } from '../../services/export/download';
import { EmptyState } from '../../components/ui/EmptyState';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatMoney, formatNumber } from '../../components/ui/format';
import type { EnergyUnit, PaymentCalendarSourceType } from '../../types';

type ColumnGroup = 'inflows' | 'outflows' | 'financing' | 'consumption' | 'taxes';

const validSource = (value: string | null): value is PaymentCalendarSourceType =>
  value === 'planned_offer' || value === 'realization_scenario';

export function PaymentCalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ready = useAppStore((state) => state.ready);
  const allCustomers = useAppStore((state) => state.customers);
  const allOffers = useAppStore((state) => state.offers);
  const scenarios = useAppStore((state) => state.scenarios);
  const customers = useMemo(
    () => allCustomers.filter((item) => !item.isArchived),
    [allCustomers],
  );
  const offers = useMemo(() => allOffers.filter((item) => item.status === 'final'), [allOffers]);
  const initialSource = validSource(searchParams.get('source'))
    ? searchParams.get('source')!
    : 'planned_offer';
  const initialId = searchParams.get('id') ?? '';
  const [sourceType, setSourceType] = useState<PaymentCalendarSourceType>(
    initialSource as PaymentCalendarSourceType,
  );
  const [customerId, setCustomerId] = useState('');
  const [recordId, setRecordId] = useState(initialId);
  const [opened, setOpened] = useState<{
    sourceType: PaymentCalendarSourceType;
    id: string;
  } | null>(
    initialId ? { sourceType: initialSource as PaymentCalendarSourceType, id: initialId } : null,
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [movementsOnly, setMovementsOnly] = useState(false);
  const [unit, setUnit] = useState<EnergyUnit>('MWh');
  const [groups, setGroups] = useState<Record<ColumnGroup, boolean>>({
    inflows: true,
    outflows: true,
    financing: true,
    consumption: true,
    taxes: true,
  });

  const openedCustomerId = opened
    ? opened.sourceType === 'planned_offer'
      ? offers.find((offer) => offer.id === opened.id)?.customerId
      : scenarios.find((scenario) => scenario.id === opened.id)?.sourceCustomerId
    : undefined;
  const effectiveCustomerId = customerId || openedCustomerId || '';

  const records =
    sourceType === 'planned_offer'
      ? offers.filter((offer) => offer.customerId === effectiveCustomerId)
      : scenarios.filter((scenario) => scenario.sourceCustomerId === effectiveCustomerId);
  const model = useMemo(() => {
    if (!opened) return null;
    const customer = customers.find((item) => item.id === effectiveCustomerId);
    if (opened.sourceType === 'planned_offer') {
      const offer = offers.find((item) => item.id === opened.id);
      return offer ? buildPlannedPaymentCalendar(offer, customer?.name ?? 'Müşteri') : null;
    }
    const scenario = scenarios.find((item) => item.id === opened.id);
    return scenario ? buildRealizationPaymentCalendar(scenario, customer?.name ?? 'Müşteri') : null;
  }, [customers, effectiveCustomerId, offers, opened, scenarios]);
  const visibleRows = useMemo(
    () => filterPaymentCalendarRows(model?.rows ?? [], { startDate, endDate, movementsOnly }),
    [endDate, model?.rows, movementsOnly, startDate],
  );
  const openRecord = () => {
    if (!recordId) return;
    setOpened({ sourceType, id: recordId });
    setSearchParams({ source: sourceType, id: recordId });
  };
  const closeRecord = () => {
    setOpened(null);
    setRecordId('');
    setSearchParams({});
  };
  const toggleGroup = (group: ColumnGroup) =>
    setGroups((current) => ({ ...current, [group]: !current[group] }));

  if (!ready)
    return (
      <EmptyState
        icon={CalendarDays}
        title="Takvim yükleniyor"
        description="IndexedDB kayıtları hazırlanıyor."
      />
    );

  return (
    <div className="print-surface">
      <PageHeader
        eyebrow="GÜNLÜK NAKİT VE KULLANIM"
        title="Ödeme / Kullanım Takvimi"
        description="Planlanan veya gerçekleşen kaydın mevcut hesap sonuçlarını günlük görünümde mutabıklaştırın."
      />
      <section className="panel no-print">
        <div className="form-grid five">
          <label className="field">
            <span>Kaynak türü</span>
            <select
              value={sourceType}
              onChange={(event) => {
                setSourceType(event.target.value as PaymentCalendarSourceType);
                setCustomerId('');
                setRecordId('');
                setOpened(null);
                setSearchParams({});
              }}
            >
              <option value="planned_offer">Planlanan Teklif</option>
              <option value="realization_scenario">Gerçekleşme Senaryosu</option>
            </select>
          </label>
          <label className="field">
            <span>Müşteri</span>
            <select
              value={effectiveCustomerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setRecordId('');
                setOpened(null);
                setSearchParams({});
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
          <label className="field span-2">
            <span>{sourceType === 'planned_offer' ? 'Teklif' : 'Senaryo'}</span>
            <select
              value={recordId}
              disabled={!effectiveCustomerId}
              onChange={(event) => {
                setCustomerId(effectiveCustomerId);
                setRecordId(event.target.value);
                setOpened(null);
                setSearchParams({});
              }}
            >
              <option value="">Kayıt seçin</option>
              {records.map((record) => (
                <option key={record.id} value={record.id}>
                  {'version' in record
                    ? `${record.title} · v${record.version}`
                    : `${record.name} · v${record.sourceOfferVersion}`}
                </option>
              ))}
            </select>
          </label>
          <div className="calendar-source-actions align-end">
            <button className="button primary" disabled={!recordId} onClick={openRecord}>
              Görüntüle
            </button>
            <button className="button ghost" disabled={!opened} onClick={closeRecord}>
              <X size={15} /> Açılan kaydı kapat
            </button>
          </div>
        </div>
      </section>

      {!model ? (
        <EmptyState
          icon={CalendarDays}
          title="Takvim kaynağı seçilmedi"
          description="Kaynak türü, müşteri ve kayıt seçip Görüntüle düğmesini kullanın."
        />
      ) : (
        <>
          <section className="panel calendar-source-summary">
            <strong>{model.customerName}</strong>
            <span>
              {model.sourceTitle} · v{model.sourceVersion} · {model.policyVersion}
            </span>
            <small>Fiyat kaynağı: {model.priceSourceSummary}</small>
          </section>
          <section className="metric-grid four calendar-metrics">
            <MetricCard
              label="Toplam müşteri nakit girişi"
              value={formatMoney(model.summary.totalCustomerCashIn)}
            />
            <MetricCard
              label="Toplam gecikme nakit girişi"
              value={formatMoney(model.summary.totalLateFeeCashIn)}
            />
            <MetricCard
              label="Toplam nakit çıkışı"
              value={formatMoney(model.summary.totalCashOutflow)}
            />
            <MetricCard
              label={
                model.sourceType === 'realization_scenario'
                  ? 'Gerçek kanal maliyeti'
                  : 'Ödeme kanalı maliyeti'
              }
              value={formatMoney(model.summary.totalPaymentChannelCost)}
            />
            <MetricCard
              label="Toplam kredi maliyeti"
              value={formatMoney(model.summary.totalCreditCost)}
            />
            <MetricCard
              label="Toplam valör getirisi"
              value={formatMoney(model.summary.totalValorIncome)}
            />
            <MetricCard
              label="En düşük bakiye"
              value={formatMoney(model.summary.minimumBalance)}
              tone={model.summary.minimumBalance < 0 ? 'negative' : 'neutral'}
            />
            <MetricCard
              label="En yüksek bakiye"
              value={formatMoney(model.summary.maximumBalance)}
              tone={model.summary.maximumBalance > 0 ? 'positive' : 'neutral'}
            />
            <MetricCard
              label="Son kapanış bakiyesi"
              value={formatMoney(model.summary.endingBalance)}
              tone={model.summary.endingBalance < 0 ? 'negative' : 'positive'}
            />
            <MetricCard label="Açık alacak" value={formatMoney(model.summary.openReceivable)} />
            <MetricCard label="Müşteri avansı" value={formatMoney(model.summary.customerAdvance)} />
            <MetricCard
              label="Hesaplama bitiş tarihi"
              value={model.summary.calculationEndDate || '—'}
            />
            <MetricCard
              label="Efektif kredi oranı"
              value={`%${formatNumber(model.summary.effectiveCreditRate, 2)}`}
            />
            <MetricCard
              label="Efektif valör oranı"
              value={`%${formatNumber(model.summary.effectiveValorRate, 2)}`}
            />
            <MetricCard
              label="Gerçek GES ihtiyaç fazlası alımı"
              value={formatMoney(model.summary.totalExcessProductionPurchase)}
            />
            <MetricCard
              label="Açık finansman bakiyesi"
              value={formatMoney(model.summary.openFinancingBalance)}
              tone={model.summary.openFinancingBalance > 0 ? 'negative' : 'neutral'}
            />
          </section>
          <section className="panel no-print">
            <div className="form-grid four">
              <label className="field">
                <span>Başlangıç tarihi</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Bitiş tarihi</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Gün görünümü</span>
                <select
                  value={movementsOnly ? 'movements' : 'all'}
                  onChange={(event) => setMovementsOnly(event.target.value === 'movements')}
                >
                  <option value="all">Tüm günler</option>
                  <option value="movements">Yalnız hareket olan günler</option>
                </select>
              </label>
              <label className="field">
                <span>Tüketim birimi</span>
                <select
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as EnergyUnit)}
                >
                  <option value="MWh">MWh</option>
                  <option value="kWh">kWh</option>
                </select>
              </label>
            </div>
            <div className="checkbox-list calendar-column-filters">
              {(
                [
                  ['inflows', 'Nakit girişleri'],
                  ['outflows', 'Nakit çıkışları'],
                  ['financing', 'Finansman'],
                  ['consumption', 'Tüketim'],
                  ['taxes', 'Vergiler'],
                ] as Array<[ColumnGroup, string]>
              ).map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" checked={groups[key]} onChange={() => toggleGroup(key)} />
                  {label}
                </label>
              ))}
            </div>
            <div className="export-actions">
              <button
                className="button secondary"
                onClick={() =>
                  downloadText(
                    toCsv(paymentCalendarToRows(model)),
                    `k2-${model.sourceTitle}-takvim.csv`,
                    'text/csv;charset=utf-8',
                  )
                }
              >
                <Download size={16} /> Takvim CSV
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  downloadText(
                    paymentCalendarToExcelHtml(model),
                    `k2-${model.sourceTitle}-takvim.xls`,
                    'application/vnd.ms-excel;charset=utf-8',
                  )
                }
              >
                <FileSpreadsheet size={16} /> Excel uyumlu tablo
              </button>
              <button className="button secondary" onClick={() => window.print()}>
                <Printer size={16} /> PDF / Yazdır
              </button>
            </div>
          </section>
          <section className="panel payment-calendar-table">
            <div className="table-wrap wide-table">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Gün</th>
                    {groups.consumption && <th>Günlük tüketim ({unit})</th>}
                    {groups.outflows && (
                      <>
                        <th>PTF çıkışı</th>
                        <th>YEKDEM çıkışı</th>
                        <th>Dağıtım çıkışı</th>
                        <th>Sözleşme gücü çıkışı</th>
                      </>
                    )}
                    {groups.taxes && (
                      <>
                        <th>BTV çıkışı</th>
                        <th>KDV çıkışı</th>
                      </>
                    )}
                    {groups.outflows && <th>GES ihtiyaç fazlası alımı/mahsubu</th>}
                    {groups.inflows && (
                      <>
                        <th>Müşteri brüt anapara tahsilatı</th>
                        <th>Müşteri net nakit girişi</th>
                        <th>Gecikme tahsilatı</th>
                      </>
                    )}
                    {groups.outflows && (
                      <>
                        <th>Müşteri iadesi</th>
                        <th>Ödeme kanalı maliyeti</th>
                      </>
                    )}
                    <th>Avans bakiyesi</th>
                    <th>Açık alacak bakiyesi</th>
                    <th>Ödeme kanalı / ödeme planı satırı</th>
                    {groups.financing && (
                      <>
                        <th>Açılış bakiyesi</th>
                        <th>Çıkışlar sonrası bakiye</th>
                        <th>Faiz bazı</th>
                        <th>Valör getirisi</th>
                        <th>Kredi maliyeti</th>
                        <th>Kapanış bakiyesi</th>
                      </>
                    )}
                    <th>Not</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      <td>{row.dayLabel}</td>
                      {groups.consumption && (
                        <td>{formatNumber(energyFromMwh(row.consumptionMwh, unit), 3)}</td>
                      )}
                      {groups.outflows && (
                        <>
                          <MoneyCell value={row.ptfOutflow} />
                          <MoneyCell value={row.yekdemOutflow} />
                          <MoneyCell value={row.distributionOutflow} />
                          <MoneyCell value={row.contractPowerOutflow} />
                        </>
                      )}
                      {groups.taxes && (
                        <>
                          <MoneyCell value={row.btvOutflow} />
                          <MoneyCell value={row.kdvOutflow} />
                        </>
                      )}
                      {groups.outflows && <MoneyCell value={row.excessProductionOutflow} />}
                      {groups.inflows && (
                        <>
                          <MoneyCell value={row.customerGrossPrincipal} />
                          <MoneyCell value={row.customerNetCashIn} />
                          <MoneyCell value={row.lateFeeCashIn} />
                        </>
                      )}
                      {groups.outflows && (
                        <>
                          <MoneyCell value={row.customerRefund} />
                          <MoneyCell value={row.paymentChannelCost} />
                        </>
                      )}
                      <MoneyCell value={row.customerAdvance} />
                      <MoneyCell value={row.openReceivable} />
                      <td>{row.paymentDescription || '—'}</td>
                      {groups.financing && (
                        <>
                          <MoneyCell value={row.openingBalance} balance />
                          <MoneyCell value={row.balanceAfterOutflows} balance />
                          <MoneyCell value={row.interestBase} balance />
                          <MoneyCell value={row.valorInterest} />
                          <MoneyCell value={row.creditInterest} />
                          <MoneyCell value={row.closingBalance} balance />
                        </>
                      )}
                      <td>{row.notes.join(' · ') || '—'}</td>
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

function MoneyCell({ value, balance = false }: { value: number; balance?: boolean }) {
  return (
    <td className={balance ? (value < 0 ? 'negative-text' : value > 0 ? 'positive-text' : '') : ''}>
      {formatMoney(value)}
    </td>
  );
}
