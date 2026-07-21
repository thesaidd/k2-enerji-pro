import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Copy,
  Plus,
  Settings2,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import {
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_PLAN_TEMPLATES,
  createPaymentPlan,
  defaultPaymentRow,
} from '../../config/paymentPlans';
import type { PaymentPlan, PaymentPlanRow, PlannedPayment } from '../../types';
import { formatDate, formatMoney } from '../ui/format';

const scopeOptions = [
  ['each_period', 'Her dönem'],
  ['first_period', 'İlk dönem'],
  ['last_period', 'Son dönem'],
  ['selected_periods', 'Seçili dönemler'],
  ['contract_once', 'Sözleşmede bir kez'],
] as const;
const amountOptions = [
  ['period_invoice_percent', 'Dönem faturası yüzdesi'],
  ['period_fixed_tl', 'Dönem sabit TL'],
  ['period_remaining_balance', 'Dönem kalan borcu'],
  ['contract_total_percent', 'Sözleşme toplamı yüzdesi'],
  ['contract_fixed_tl', 'Sözleşme sabit TL'],
] as const;
const dateOptions = [
  ['usage_start', 'Kullanım başlangıcı'],
  ['usage_end', 'Kullanım bitişi'],
  ['period_start', 'Dönem başlangıcı'],
  ['period_end', 'Dönem sonu'],
  ['invoice_date', 'Fatura tarihi'],
  ['fixed_day', 'Ayın sabit günü'],
  ['manual_date', 'Manuel tarih'],
] as const;

export function PaymentPlanEditor({
  plan,
  onChange,
  previewPayments,
}: {
  plan: PaymentPlan;
  onChange: (plan: PaymentPlan) => void;
  previewPayments: PlannedPayment[];
}) {
  const [advanced, setAdvanced] = useState(false);
  const setRow = (id: string, patch: Partial<PaymentPlanRow>) =>
    onChange({
      ...plan,
      mode: 'custom',
      rows: plan.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  const move = (id: string, delta: number) => {
    const rows = [...plan.rows];
    const index = rows.findIndex((row) => row.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= rows.length) return;
    [rows[index], rows[next]] = [rows[next]!, rows[index]!];
    onChange({
      ...plan,
      mode: 'custom',
      rows: rows.map((row, rowIndex) => ({ ...row, order: rowIndex + 1 })),
    });
  };
  return (
    <div className="payment-editor">
      <div className="payment-editor-top">
        <div>
          <span className="eyebrow">ÖDEME PLANI</span>
          <h2>Paranın zamanını tanımlayın</h2>
          <p>Ne kadar, ne zaman ve hangi kanalla tahsil edilecek?</p>
        </div>
        <div className="segmented">
          <button
            className={!advanced ? 'active' : ''}
            onClick={() => setAdvanced(false)}
            type="button"
          >
            <WandSparkles size={15} /> Basit
          </button>
          <button
            className={advanced ? 'active' : ''}
            onClick={() => setAdvanced(true)}
            type="button"
          >
            <Settings2 size={15} /> Gelişmiş
          </button>
        </div>
      </div>
      {!advanced ? (
        <div className="template-grid">
          {PAYMENT_PLAN_TEMPLATES.map((template) => (
            <button
              type="button"
              key={template.id}
              className={`template-card ${plan.templateId === template.id ? 'selected' : ''}`}
              onClick={() => onChange(createPaymentPlan(template.id))}
            >
              <span className="template-radio" />
              <strong>{template.name}</strong>
              <small>{template.summary}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="advanced-plan">
          <div className="inline-form">
            <label className="field">
              <span>Plan adı</span>
              <input
                value={plan.name}
                onChange={(event) =>
                  onChange({ ...plan, name: event.target.value, mode: 'custom' })
                }
              />
              <small>Teklif, analiz ve raporlarda görünür.</small>
            </label>
            <button
              type="button"
              className="button secondary align-end"
              onClick={() =>
                onChange({
                  ...plan,
                  mode: 'custom',
                  rows: [...plan.rows, { ...defaultPaymentRow(), order: plan.rows.length + 1 }],
                })
              }
            >
              <Plus size={16} /> Yeni ödeme satırı
            </button>
          </div>
          {plan.rows.length === 0 && (
            <div className="notice warning">
              Özel planda en az bir aktif ödeme satırı oluşturun.
            </div>
          )}
          <div className="payment-rows">
            {plan.rows.map((row, index) => (
              <details
                className={`payment-row ${row.enabled ? '' : 'disabled'}`}
                open={index === 0}
                key={row.id}
              >
                <summary>
                  <span className="row-index">{index + 1}</span>
                  <div>
                    <strong>{row.name}</strong>
                    <small>
                      {amountOptions.find(([value]) => value === row.amountType)?.[1]} ·{' '}
                      {dateOptions.find(([value]) => value === row.dateReference)?.[1]}
                    </small>
                  </div>
                  <span className="summary-spacer" />
                  <button
                    type="button"
                    className="icon-button"
                    title="Yukarı taşı"
                    onClick={(event) => {
                      event.preventDefault();
                      move(row.id, -1);
                    }}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Aşağı taşı"
                    onClick={(event) => {
                      event.preventDefault();
                      move(row.id, 1);
                    }}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Kopyala"
                    onClick={(event) => {
                      event.preventDefault();
                      onChange({
                        ...plan,
                        rows: [
                          ...plan.rows,
                          {
                            ...structuredClone(row),
                            id: crypto.randomUUID(),
                            name: `${row.name} kopya`,
                            order: plan.rows.length + 1,
                          },
                        ],
                      });
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    title="Sil"
                    onClick={(event) => {
                      event.preventDefault();
                      onChange({
                        ...plan,
                        rows: plan.rows
                          .filter((item) => item.id !== row.id)
                          .map((item, i) => ({ ...item, order: i + 1 })),
                      });
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </summary>
                <div className="form-grid four dense">
                  <label className="field checkbox-field">
                    <span>Aktif / pasif</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(event) => setRow(row.id, { enabled: event.target.checked })}
                      />
                      <i />
                    </label>
                    <small>Pasif satır kayıtta kalır, hesaba girmez.</small>
                  </label>
                  <label className="field">
                    <span>Satır adı</span>
                    <input
                      value={row.name}
                      onChange={(event) => setRow(row.id, { name: event.target.value })}
                    />
                    <small>Takvim ve raporlarda görünür.</small>
                  </label>
                  <label className="field">
                    <span>Uygulama kapsamı</span>
                    <select
                      value={row.applicationScope}
                      onChange={(event) =>
                        setRow(row.id, {
                          applicationScope: event.target
                            .value as PaymentPlanRow['applicationScope'],
                        })
                      }
                    >
                      {scopeOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <small>Sözleşmede bir kez seçeneği aylık tekrarlanmaz.</small>
                  </label>
                  <label className="field">
                    <span>Seçili dönemler</span>
                    <input
                      value={row.selectedPeriods.join(',')}
                      disabled={row.applicationScope !== 'selected_periods'}
                      onChange={(event) =>
                        setRow(row.id, {
                          selectedPeriods: event.target.value
                            .split(',')
                            .map(Number)
                            .filter((value) => Number.isInteger(value) && value > 0),
                        })
                      }
                    />
                    <small>Örnek: 1,3,6</small>
                  </label>
                  <label className="field">
                    <span>Tutar tipi</span>
                    <select
                      value={row.amountType}
                      onChange={(event) =>
                        setRow(row.id, {
                          amountType: event.target.value as PaymentPlanRow['amountType'],
                        })
                      }
                    >
                      {amountOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <small>Dönem kalan borcu, önceki ödemelerden sonra kalanı kapatır.</small>
                  </label>
                  <label className="field">
                    <span>Tutar / yüzde</span>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        value={row.amountValue}
                        disabled={row.amountType === 'period_remaining_balance'}
                        onChange={(event) =>
                          setRow(row.id, { amountValue: Number(event.target.value) })
                        }
                      />
                      <em>{row.amountType.includes('percent') ? '%' : 'TL'}</em>
                    </div>
                  </label>
                  <label className="field">
                    <span>Tarih referansı</span>
                    <select
                      value={row.dateReference}
                      onChange={(event) =>
                        setRow(row.id, {
                          dateReference: event.target.value as PaymentPlanRow['dateReference'],
                        })
                      }
                    >
                      {dateOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <small>Gün farkının hangi tarihten başlayacağını belirler.</small>
                  </label>
                  <label className="field">
                    <span>Gün farkı</span>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        value={row.dayOffset}
                        onChange={(event) =>
                          setRow(row.id, { dayOffset: Number(event.target.value) })
                        }
                      />
                      <em>gün</em>
                    </div>
                    <small>Eksi erken, artı geç tahsilattır.</small>
                  </label>
                  <label className="field">
                    <span>Ayın sabit günü</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={row.fixedDay}
                      disabled={row.dateReference !== 'fixed_day'}
                      onChange={(event) => setRow(row.id, { fixedDay: Number(event.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Ay farkı</span>
                    <input
                      type="number"
                      value={row.fixedDayMonthOffset}
                      disabled={row.dateReference !== 'fixed_day'}
                      onChange={(event) =>
                        setRow(row.id, { fixedDayMonthOffset: Number(event.target.value) })
                      }
                    />
                    <small>1 = takip eden ay.</small>
                  </label>
                  <label className="field">
                    <span>Manuel tarih</span>
                    <input
                      type="date"
                      value={row.manualDate ?? ''}
                      disabled={row.dateReference !== 'manual_date'}
                      onChange={(event) => setRow(row.id, { manualDate: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Ödeme kanalı</span>
                    <select
                      value={row.paymentChannel}
                      onChange={(event) =>
                        setRow(row.id, {
                          paymentChannel: event.target.value as PaymentPlanRow['paymentChannel'],
                        })
                      }
                    >
                      {Object.entries(PAYMENT_CHANNEL_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Taksit sayısı</span>
                    <input
                      type="number"
                      min="1"
                      max="36"
                      value={row.installmentCount}
                      disabled={row.paymentChannel !== 'credit_card_installment'}
                      onChange={(event) =>
                        setRow(row.id, { installmentCount: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Taksit aralığı</span>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        value={row.installmentIntervalDays}
                        disabled={row.paymentChannel !== 'credit_card_installment'}
                        onChange={(event) =>
                          setRow(row.id, { installmentIntervalDays: Number(event.target.value) })
                        }
                      />
                      <em>gün</em>
                    </div>
                  </label>
                  <label className="field">
                    <span>Banka aktarım biçimi</span>
                    <select
                      value={row.merchantSettlementMode}
                      disabled={row.paymentChannel !== 'credit_card_installment'}
                      onChange={(event) =>
                        setRow(row.id, {
                          merchantSettlementMode: event.target
                            .value as PaymentPlanRow['merchantSettlementMode'],
                        })
                      }
                    >
                      <option value="upfront_net">Peşin / net aktarım</option>
                      <option value="installment_settlement">Taksitli aktarım</option>
                    </select>
                    <small>Bankanın EPSAŞ’a tek mi, parça parça mı ödediği.</small>
                  </label>
                  <label className="field">
                    <span>Banka valörü</span>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        value={row.bankSettlementDelayDays}
                        onChange={(event) =>
                          setRow(row.id, { bankSettlementDelayDays: Number(event.target.value) })
                        }
                      />
                      <em>gün</em>
                    </div>
                  </label>
                  <label className="field">
                    <span>Komisyon oranı</span>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.commissionRate}
                        onChange={(event) =>
                          setRow(row.id, { commissionRate: Number(event.target.value) })
                        }
                      />
                      <em>%</em>
                    </div>
                  </label>
                  <label className="field">
                    <span>Komisyonu ödeyen</span>
                    <select
                      value={row.commissionBearer}
                      onChange={(event) =>
                        setRow(row.id, {
                          commissionBearer: event.target
                            .value as PaymentPlanRow['commissionBearer'],
                        })
                      }
                    >
                      <option value="epsas">EPSAŞ</option>
                      <option value="customer">Müşteri</option>
                    </select>
                    <small>
                      EPSAŞ öderse net nakit azalır; müşteri öderse enerji geliri sayılmaz.
                    </small>
                  </label>
                  <label className="field span-2">
                    <span>Not</span>
                    <input
                      value={row.note ?? ''}
                      onChange={(event) => setRow(row.id, { note: event.target.value })}
                      placeholder="Banka kampanyası, özel anlaşma…"
                    />
                  </label>
                </div>
              </details>
            ))}
          </div>
          <div className="reconciliation-panel">
            <div>
              <span className="eyebrow">MAHSUP VE MUTABAKAT</span>
              <h3>Fazla veya eksik bakiye</h3>
              <p>
                {plan.reconciliation.enabled
                  ? 'Sistem kalan bakiyeyi seçtiğiniz kurala göre otomatik işler.'
                  : 'Sistem otomatik işlem oluşturmaz; avans ve açık alacağı yalnızca raporlar.'}
              </p>
            </div>
            <label className="switch-label">
              <span>Mutabakat</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={plan.reconciliation.enabled}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      reconciliation: { ...plan.reconciliation, enabled: event.target.checked },
                    })
                  }
                />
                <i />
              </label>
            </label>
            <label className="field">
              <span>Fazla ödeme</span>
              <select
                value={plan.reconciliation.overpaymentAction}
                disabled={!plan.reconciliation.enabled}
                onChange={(event) =>
                  onChange({
                    ...plan,
                    reconciliation: {
                      ...plan.reconciliation,
                      overpaymentAction: event.target
                        .value as PaymentPlan['reconciliation']['overpaymentAction'],
                    },
                  })
                }
              >
                <option value="carry_forward">Sonraki faturaya taşı</option>
                <option value="refund_after_days">Belirli gün sonra iade</option>
                <option value="refund_at_contract_end">Sözleşme sonunda iade</option>
              </select>
            </label>
            <label className="field">
              <span>Eksik ödeme</span>
              <select
                value={plan.reconciliation.underpaymentAction}
                disabled={!plan.reconciliation.enabled}
                onChange={(event) =>
                  onChange({
                    ...plan,
                    reconciliation: {
                      ...plan.reconciliation,
                      underpaymentAction: event.target
                        .value as PaymentPlan['reconciliation']['underpaymentAction'],
                    },
                  })
                }
              >
                <option value="collect_after_days">Tamamlayıcı tahsilat</option>
                <option value="carry_to_next_invoice">Sonraki faturaya taşı</option>
                <option value="leave_open">Açık alacak bırak</option>
              </select>
            </label>
          </div>
        </div>
      )}
      <div className="timeline-preview">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">GÖRSEL ÖNİZLEME</span>
            <h3>Planlanan nakit zaman çizelgesi</h3>
          </div>
          <Clock3 size={19} />
        </div>
        {previewPayments.length === 0 ? (
          <p className="muted">Geçerli bir ödeme satırı seçildiğinde tahsilatlar burada görünür.</p>
        ) : (
          <div className="timeline-track">
            {previewPayments.slice(0, 12).map((payment) => (
              <div className="timeline-event income" key={payment.id}>
                <i />
                <span>{formatDate(payment.settlementDate)}</span>
                <strong>{formatMoney(payment.netCashIn)}</strong>
                <small>
                  {payment.planRowName}
                  {payment.installmentCount > 1
                    ? ` · ${payment.installmentNo}/${payment.installmentCount}`
                    : ''}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
