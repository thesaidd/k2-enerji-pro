import { useState, type ChangeEvent } from 'react';
import {
  CalendarPlus,
  DatabaseBackup,
  FileUp,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../../app/store/useAppStore';
import { CALCULATION_POLICY_VERSION } from '../../config/calculationPolicy';
import { APP_VERSION, BACKUP_SCHEMA_VERSION } from '../../config/release';
import {
  DataPortabilityService,
  type RestorePreview,
} from '../../services/storage/DataPortabilityService';
import {
  detectLegacyLocalStorage,
  preview217Migration,
  type MigrationPreview,
} from '../../services/migration/migrate217';
import { downloadText } from '../../services/export/download';
import { NumberField } from '../../components/ui/NumberField';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  MONTHLY_MARKET_PRICE_STATUS_LABELS,
  monthlyMarketPriceStatus,
} from '../../domain/market-prices/marketPrices';
import type { MonthlyMarketPrice, TariffVersion } from '../../types';
import { DemoDataService } from '../../demo/demoDataService';

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const customers = useAppStore((state) => state.customers);
  const costDrafts = useAppStore((state) => state.costDrafts);
  const offers = useAppStore((state) => state.offers);
  const scenarios = useAppStore((state) => state.scenarios);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const saveMonthlyMarketPrices = useAppStore((state) => state.saveMonthlyMarketPrices);
  const applyMigration = useAppStore((state) => state.applyMigration);
  const loadAll = useAppStore((state) => state.loadAll);
  const notify = useAppStore((state) => state.notify);
  const [lateRate, setLateRate] = useState(settings.lateFee.monthlyRate);
  const [holiday, setHoliday] = useState('');
  const [migration, setMigration] = useState<MigrationPreview | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [demoAction, setDemoAction] = useState<'load' | 'clear' | null>(null);
  const [marketPrices, setMarketPrices] = useState<MonthlyMarketPrice[]>(() =>
    structuredClone(settings.monthlyMarketPrices),
  );
  const marketPriceSignature = JSON.stringify(settings.monthlyMarketPrices);
  const [loadedMarketPriceSignature, setLoadedMarketPriceSignature] = useState(marketPriceSignature);
  const tariffSignature = JSON.stringify(settings.tariffVersions ?? []);
  const [tariffVersions, setTariffVersions] = useState<TariffVersion[]>(() =>
    structuredClone(settings.tariffVersions ?? []),
  );
  const [loadedTariffSignature, setLoadedTariffSignature] = useState(tariffSignature);
  if (loadedMarketPriceSignature !== marketPriceSignature) {
    setLoadedMarketPriceSignature(marketPriceSignature);
    setMarketPrices(structuredClone(settings.monthlyMarketPrices));
  }
  if (loadedTariffSignature !== tariffSignature) {
    setLoadedTariffSignature(tariffSignature);
    setTariffVersions(structuredClone(settings.tariffVersions ?? []));
  }
  const addTariffVersion = () => {
    const source = tariffVersions[0];
    const timestamp = new Date().toISOString();
    setTariffVersions([
      ...tariffVersions,
      {
        id: `tariff-${Date.now()}`,
        customerType: source?.customerType ?? 'tek-terimli-ag-sanayi',
        validFrom: '',
        validTo: undefined,
        kdvRate: source?.kdvRate ?? 20,
        btvRate: source?.btvRate ?? 1,
        distributionUnitTlMwh: source?.distributionUnitTlMwh ?? 0,
        sourceLabel: '',
        versionLabel: '',
        active: false,
        updatedAt: timestamp,
      },
    ]);
  };
  const copyTariffVersion = (index: number) => {
    const source = tariffVersions[index];
    if (!source) return;
    setTariffVersions([
      ...tariffVersions,
      {
        ...structuredClone(source),
        id: `${source.id}-copy-${Date.now()}`,
        versionLabel: `${source.versionLabel} kopya`,
        active: false,
        updatedAt: new Date().toISOString(),
      },
    ]);
  };
  const saveTariffVersions = async () => {
    try {
      await updateSettings({ tariffVersions });
      notify({ tone: 'success', title: 'Tarife kataloğu kaydedildi' });
    } catch (error) {
      notify({
        tone: 'error',
        title: 'Tarife kataloğu kaydedilemedi',
        detail: error instanceof Error ? error.message : 'Tarife doğrulama hatası',
      });
    }
  };
  const addMarketPrice = () => {
    if (marketPrices.some((record) => !record.month)) {
      notify({ tone: 'warning', title: 'Önce boş ay satırını tamamlayın' });
      return;
    }
    setMarketPrices([
      ...marketPrices,
      {
        month: '',
        forecastPtfTlMwh: null,
        actualPtfTlMwh: null,
        forecastYekdemTlMwh: null,
        actualYekdemTlMwh: null,
        sourceNote: '',
        updatedAt: new Date().toISOString(),
      },
    ]);
  };
  const updateMarketPrice = (index: number, patch: Partial<MonthlyMarketPrice>) => {
    if (
      patch.month &&
      marketPrices.some(
        (record, candidateIndex) => candidateIndex !== index && record.month === patch.month,
      )
    ) {
      notify({ tone: 'error', title: 'Aynı ay ikinci kez eklenemez', detail: patch.month });
      return;
    }
    setMarketPrices(
      marketPrices
        .map((record, candidateIndex) =>
          candidateIndex === index ? { ...record, ...patch } : record,
        )
        .sort((a, b) => {
          if (!a.month) return 1;
          if (!b.month) return -1;
          return a.month.localeCompare(b.month);
        }),
    );
  };
  const saveMarketPrices = async () => {
    const timestamp = new Date().toISOString();
    await saveMonthlyMarketPrices(
      marketPrices.map((record) => ({
        ...record,
        sourceNote: record.sourceNote?.trim(),
        actualizedAt:
          record.actualPtfTlMwh != null && record.actualYekdemTlMwh != null
            ? (record.actualizedAt ?? timestamp)
            : undefined,
        updatedAt: timestamp,
      })),
    );
  };
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      if (record.format === 'K2-ENERJIPRO' || record.version === 'K2-ENERJIPRO-3.0') {
        setRestorePreview(await DataPortabilityService.previewRestore(parsed));
      } else setMigration(preview217Migration(parsed));
    } catch (error) {
      notify({
        tone: 'error',
        title: 'Yedek dosyası okunamadı',
        detail: error instanceof Error ? error.message : 'Geçersiz JSON',
      });
    }
    event.target.value = '';
  };
  const detect = () => {
    try {
      const preview = detectLegacyLocalStorage();
      setMigration(preview);
      if (!preview) notify({ tone: 'info', title: 'Aynı origin’de 2.17 verisi bulunamadı' });
    } catch {
      notify({ tone: 'error', title: '2.17 localStorage verisi okunamadı' });
    }
  };
  const backup = async () => {
    const timestamp = new Date().toISOString();
    downloadText(
      JSON.stringify(await DataPortabilityService.export(), null, 2),
      `k2-energipro-3.0-yedek-${timestamp.slice(0, 10)}.json`,
      'application/json',
    );
    await updateSettings({ lastBackupAt: timestamp });
  };
  const confirmRestore = async () => {
    if (!restorePreview) return;
    await DataPortabilityService.restore(restorePreview);
    setRestorePreview(null);
    await loadAll();
    notify({ tone: 'success', title: 'Yedek güvenli transaction ile geri yüklendi' });
  };
  const confirmDemoAction = async () => {
    if (demoAction === 'load') {
      await DemoDataService.load();
      notify({ tone: 'success', title: 'Kontrollü demo verisi yüklendi' });
    } else if (demoAction === 'clear') {
      await DemoDataService.clear();
      notify({ tone: 'success', title: 'Yalnız demo fixture kayıtları temizlendi' });
    }
    setDemoAction(null);
    await loadAll();
  };
  return (
    <div>
      <PageHeader
        eyebrow="POLİTİKA VE VERİ"
        title="Ayarlar"
        description="Tema, gecikme politikası, tatiller, yedekleme ve 2.17 veri taşıma işlemlerini yönetin."
      />
      <div className="settings-grid">
        <section className="panel span-2">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">AYLIK PİYASA VERİLERİ</span>
              <h2>PTF ve YEKDEM Tahmin/Gerçekleşen Değerleri</h2>
            </div>
            <button className="button secondary" onClick={addMarketPrice}>
              <Plus size={16} /> Yeni ay ekle
            </button>
          </div>
          <p className="muted">
            PTF negatif olabilir. YEKDEM değerleri negatif olamaz. Yeni teklifler sözleşme aylarını
            bu tablodan çözümler.
          </p>
          <div className="table-wrap wide-table market-price-table">
            <table>
              <thead>
                <tr>
                  <th>Ay</th>
                  <th>Tahmini PTF — TL/MWh</th>
                  <th>Gerçekleşen PTF — TL/MWh</th>
                  <th>Tahmini YEKDEM — TL/MWh</th>
                  <th>Gerçekleşen YEKDEM — TL/MWh</th>
                  <th>Kaynak/Not</th>
                  <th>Durum</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {marketPrices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      Henüz aylık piyasa verisi eklenmedi.
                    </td>
                  </tr>
                ) : (
                  marketPrices.map((record, index) => {
                    const status = monthlyMarketPriceStatus(record);
                    return (
                      <tr key={`${record.month}-${index}`}>
                        <td>
                          <label className="field compact-field">
                            <span className="sr-only">Ay</span>
                            <input
                              aria-label="Ay"
                              type="month"
                              value={record.month}
                              onChange={(event) =>
                                updateMarketPrice(index, { month: event.target.value })
                              }
                            />
                          </label>
                        </td>
                        <td>
                          <NullableMarketInput
                            label="Tahmini PTF"
                            value={record.forecastPtfTlMwh}
                            onValue={(value) =>
                              updateMarketPrice(index, { forecastPtfTlMwh: value })
                            }
                          />
                        </td>
                        <td>
                          <NullableMarketInput
                            label="Gerçekleşen PTF"
                            value={record.actualPtfTlMwh}
                            onValue={(value) => updateMarketPrice(index, { actualPtfTlMwh: value })}
                          />
                        </td>
                        <td>
                          <NullableMarketInput
                            label="Tahmini YEKDEM"
                            min={0}
                            value={record.forecastYekdemTlMwh}
                            onValue={(value) =>
                              updateMarketPrice(index, { forecastYekdemTlMwh: value })
                            }
                          />
                        </td>
                        <td>
                          <NullableMarketInput
                            label="Gerçekleşen YEKDEM"
                            min={0}
                            value={record.actualYekdemTlMwh}
                            onValue={(value) =>
                              updateMarketPrice(index, { actualYekdemTlMwh: value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label="Kaynak veya not"
                            value={record.sourceNote ?? ''}
                            onChange={(event) =>
                              updateMarketPrice(index, { sourceNote: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <StatusBadge
                            tone={
                              status === 'actual_complete'
                                ? 'positive'
                                : status === 'forecast_missing'
                                  ? 'warning'
                                  : 'info'
                            }
                          >
                            {MONTHLY_MARKET_PRICE_STATUS_LABELS[status]}
                          </StatusBadge>
                        </td>
                        <td>
                          <button
                            className="icon-button danger"
                            aria-label={`${record.month || 'Boş'} piyasa verisini sil`}
                            onClick={() =>
                              setMarketPrices(
                                marketPrices.filter(
                                  (_candidate, candidateIndex) => candidateIndex !== index,
                                ),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button
              className="button primary"
              onClick={() => void saveMarketPrices().catch(() => undefined)}
            >
              <Save size={16} /> Piyasa verilerini kaydet
            </button>
          </div>
        </section>
        <section className="panel span-2">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">TARİFE KATALOĞU</span>
              <h2>Tarihli demo tarife versiyonları</h2>
            </div>
            <div className="page-actions">
              <button className="button ghost" onClick={addTariffVersion}>
                <Plus size={16} /> Yeni tarife versiyonu
              </button>
              <button className="button secondary" onClick={() => void saveTariffVersions()}>
                <Save size={16} /> Tarifeleri kaydet
              </button>
            </div>
          </div>
          <p className="muted">
            Bir dönem için tam bir aktif tarife bulunamazsa nihai teklif engellenir. Sistem eski
            tarifeyi sessizce ileri taşımaz.
          </p>
          <div className="table-wrap wide-table">
            <table aria-label="Tarife versiyonları">
              <thead>
                <tr>
                  <th>Aktif</th>
                  <th>Müşteri tipi</th>
                  <th>Geçerlilik</th>
                  <th>KDV</th>
                  <th>BTV</th>
                  <th>Dağıtım</th>
                  <th>Kaynak / sürüm</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {tariffVersions.map((tariff, index) => {
                  const patchTariff = (patch: Partial<TariffVersion>) =>
                    setTariffVersions(
                      tariffVersions.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, ...patch, updatedAt: new Date().toISOString() }
                          : candidate,
                      ),
                    );
                  return (
                    <tr key={tariff.id}>
                      <td>
                        <input
                          aria-label={`${tariff.customerType} aktif`}
                          type="checkbox"
                          checked={tariff.active}
                          onChange={(event) => patchTariff({ active: event.target.checked })}
                        />
                      </td>
                      <td><input aria-label={`${tariff.id} müşteri tipi`} value={tariff.customerType} onChange={(event) => patchTariff({ customerType: event.target.value })} /></td>
                      <td>
                        <input aria-label={`${tariff.customerType} başlangıç`} type="date" value={tariff.validFrom} onChange={(event) => patchTariff({ validFrom: event.target.value })} />
                        <input aria-label={`${tariff.customerType} bitiş`} type="date" value={tariff.validTo ?? ''} onChange={(event) => patchTariff({ validTo: event.target.value || undefined })} />
                      </td>
                      <td><input aria-label={`${tariff.customerType} tarife KDV`} type="number" min="0" max="100" value={Number.isFinite(tariff.kdvRate) ? tariff.kdvRate : ''} onChange={(event) => patchTariff({ kdvRate: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></td>
                      <td><input aria-label={`${tariff.customerType} tarife BTV`} type="number" min="0" max="100" value={Number.isFinite(tariff.btvRate) ? tariff.btvRate : ''} onChange={(event) => patchTariff({ btvRate: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></td>
                      <td><input aria-label={`${tariff.customerType} tarife dağıtım`} type="number" min="0" value={Number.isFinite(tariff.distributionUnitTlMwh) ? tariff.distributionUnitTlMwh : ''} onChange={(event) => patchTariff({ distributionUnitTlMwh: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></td>
                      <td>
                        <input aria-label={`${tariff.id} kaynak etiketi`} value={tariff.sourceLabel} onChange={(event) => patchTariff({ sourceLabel: event.target.value })} />
                        <input aria-label={`${tariff.id} sürüm etiketi`} value={tariff.versionLabel} onChange={(event) => patchTariff({ versionLabel: event.target.value })} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" aria-label={`${tariff.id} kopyala`} title="Kopyala" onClick={() => copyTariffVersion(index)}>K</button>
                          <button className="icon-button danger" aria-label={`${tariff.id} sil`} title="Sil" onClick={() => setTariffVersions(tariffVersions.filter((_, candidateIndex) => candidateIndex !== index))}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">GÖRÜNÜM</span>
              <h2>Tema</h2>
            </div>
            <Settings size={20} />
          </div>
          <div className="theme-cards">
            <button
              className={settings.theme === 'light' ? 'selected' : ''}
              onClick={() => void updateSettings({ theme: 'light' })}
            >
              <Sun />
              <strong>Açık</strong>
              <small>Gündüz çalışma alanı</small>
            </button>
            <button
              className={settings.theme === 'dark' ? 'selected' : ''}
              onClick={() => void updateSettings({ theme: 'dark' })}
            >
              <Moon />
              <strong>Koyu</strong>
              <small>Az ışıklı ortamlar</small>
            </button>
            <button
              className={settings.theme === 'system' ? 'selected' : ''}
              onClick={() => void updateSettings({ theme: 'system' })}
            >
              <RefreshCw />
              <strong>Sistem</strong>
              <small>Cihaz tercihini izle</small>
            </button>
          </div>
        </section>
        <section className="panel span-2" id="demo-data">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">KONTROLLÜ DEMO</span>
              <h2>Sunum veri seti</h2>
            </div>
            <Sparkles size={20} />
          </div>
          <p>
            Üç müşteri, çok aylı teklifler, GES, kart komisyonu, gecikmeli tahsilat, müşteri avansı,
            açık alacak ve legacy snapshot örneklerini deterministik kimliklerle yükler.
          </p>
          <div className="export-actions">
            <button className="button primary" onClick={() => setDemoAction('load')}><Sparkles size={16} /> Demo verisi yükle</button>
            <button className="button danger" onClick={() => setDemoAction('clear')}><Trash2 size={16} /> Demo verisini temizle</button>
          </div>
          {demoAction && (
            <div className="migration-preview">
              <div className="notice warning">
                {demoAction === 'load'
                  ? 'Demo verisi yüklemek mevcut veriyi değiştirebilir. Önce yedek alın. Kullanıcı kayıtları silinmez; aynı aylardaki kullanıcı piyasa verileri korunur.'
                  : 'Yalnız K2 demo fixture’ına ait deterministik kimlikler ve işaretli demo piyasa ayları silinir. Diğer kullanıcı kayıtları korunur.'}
              </div>
              <div className="form-actions">
                <button className="button ghost" onClick={() => setDemoAction(null)}>İptal</button>
                <button className="button primary" onClick={() => void confirmDemoAction()}>
                  {demoAction === 'load' ? 'Uyarıyı kabul et ve yükle' : 'Yalnız demo verisini temizle'}
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">GECİKME MOTORU</span>
              <h2>Şirket politikası</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <NumberField
            label="Şirket Aylık Gecikme Oranı"
            unit="%"
            min={0}
            step="0.01"
            value={lateRate}
            onValue={setLateRate}
            hint="Yasal oran değildir. 360 gün, basit faiz; hafta sonu ve tatiller dahil."
          />
          <dl className="settings-facts">
            <div>
              <dt>Gün bazı</dt>
              <dd>360</dd>
            </div>
            <div>
              <dt>Yöntem</dt>
              <dd>Basit faiz</dd>
            </div>
            <div>
              <dt>Gecikme KDV’si</dt>
              <dd>Ana fatura KDV oranı</dd>
            </div>
            <div>
              <dt>Bileşik gecikme</dt>
              <dd>Kapalı</dd>
            </div>
          </dl>
          <button
            className="button primary"
            onClick={() =>
              void updateSettings({ lateFee: { ...settings.lateFee, monthlyRate: lateRate } })
            }
          >
            Gecikme ayarını kaydet
          </button>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">İŞ GÜNÜ TAKVİMİ</span>
              <h2>Manuel tatiller</h2>
            </div>
            <CalendarPlus size={20} />
          </div>
          <div className="inline-form">
            <label className="field">
              <span>Tatil tarihi</span>
              <input
                type="date"
                value={holiday}
                onChange={(event) => setHoliday(event.target.value)}
              />
            </label>
            <button
              className="button secondary align-end"
              disabled={!holiday}
              onClick={() => {
                void updateSettings({
                  holidays: [...new Set([...settings.holidays, holiday])].sort(),
                });
                setHoliday('');
              }}
            >
              Tarihi ekle
            </button>
          </div>
          <div className="holiday-list">
            {settings.holidays.length === 0 ? (
              <p className="muted">
                Manuel tatil eklenmedi. Sabit resmî tatiller otomatik uygulanır.
              </p>
            ) : (
              settings.holidays.map((date) => (
                <button
                  key={date}
                  onClick={() =>
                    void updateSettings({
                      holidays: settings.holidays.filter((item) => item !== date),
                    })
                  }
                >
                  {new Date(`${date}T00:00:00`).toLocaleDateString('tr-TR')} <span>×</span>
                </button>
              ))
            )}
          </div>
        </section>
        <section className="panel" id="backup">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YEDEKLEME</span>
              <h2>3.0 veri taşınabilirliği</h2>
            </div>
            <DatabaseBackup size={20} />
          </div>
          <p>
            Tüm müşteri, maliyet taslağı, teklif snapshot’ı, gerçekleşme ve ayar kayıtlarını tek
            JSON dosyasında saklayın.
          </p>
          <div className="export-actions">
            <button className="button secondary" onClick={() => void backup()}>
              <DatabaseBackup size={16} /> Tam yedek indir
            </button>
            <label className="button ghost file-button">
              <FileUp size={16} /> Yedek geri yükle
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => void handleFile(event)}
              />
            </label>
          </div>
          {restorePreview && (
            <div className="migration-preview">
              <div className="metric-grid four">
                <div><span>Müşteri</span><strong>{restorePreview.customers}</strong></div>
                <div><span>Taslak</span><strong>{restorePreview.costDrafts}</strong></div>
                <div><span>Nihai teklif</span><strong>{restorePreview.plannedOffers}</strong></div>
                <div><span>Gerçekleşme</span><strong>{restorePreview.realizationScenarios}</strong></div>
                <div><span>Aylık fiyat</span><strong>{restorePreview.monthlyPrices}</strong></div>
                <div><span>Legacy kayıt</span><strong>{restorePreview.legacyRecords}</strong></div>
                <div><span>Migration kaydı</span><strong>{restorePreview.migrationRecords}</strong></div>
                <div><span>Uyarı</span><strong>{restorePreview.warnings.length}</strong></div>
              </div>
              {restorePreview.warnings.map((warning) => <div className="notice warning" key={warning}>{warning}</div>)}
              <div className="notice warning">
                Onaydan sonra mevcut veriler tek transaction içinde bu yedekle değiştirilecektir.
              </div>
              <div className="form-actions">
                <button className="button ghost" onClick={() => setRestorePreview(null)}>İptal</button>
                <button className="button primary" onClick={() => void confirmRestore()}>Önizlemeyi onayla ve geri yükle</button>
              </div>
            </div>
          )}
        </section>
        <section className="panel span-2">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">2.17 MIGRATION</span>
              <h2>Eski verileri önizleyerek taşıyın</h2>
            </div>
            <FileUp size={20} />
          </div>
          <p>
            2.17 JSON yedeğini seçin veya aynı origin’deki eski localStorage anahtarlarını tespit
            edin. Onay vermeden hiçbir kayıt taşınmaz.
          </p>
          <div className="export-actions">
            <label className="button secondary file-button">
              <FileUp size={16} /> 2.17 JSON seç
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => void handleFile(event)}
              />
            </label>
            <button className="button ghost" onClick={detect}>
              <RefreshCw size={16} /> Aynı origin’i tara
            </button>
          </div>
          {migration && (
            <div className="migration-preview">
              <div className="metric-grid four">
                <div>
                  <span>Müşteri</span>
                  <strong>{migration.customers}</strong>
                </div>
                <div>
                  <span>Teklif</span>
                  <strong>{migration.offers}</strong>
                </div>
                <div>
                  <span>Arşivlenmiş</span>
                  <strong>{migration.archived}</strong>
                </div>
                <div>
                  <span>Dönüştürülemeyen</span>
                  <strong>{migration.unconvertible}</strong>
                </div>
              </div>
              {migration.warnings.map((warning) => (
                <div className="notice warning" key={warning}>
                  {warning}
                </div>
              ))}
              <div className="form-actions">
                <button className="button ghost" onClick={() => setMigration(null)}>
                  İptal
                </button>
                <button
                  className="button primary"
                  onClick={() => void applyMigration(migration).then(() => setMigration(null))}
                >
                  Önizlemeyi onayla ve taşı
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="panel span-2 policy-card">
          <div>
            <span className="eyebrow">HESAPLAMA POLİTİKASI</span>
            <h2>{CALCULATION_POLICY_VERSION}</h2>
            <p>
              Ara yuvarlama yok · Finansman 365 gün · Gecikme 360 gün · GES öz tüketim alacak
              değildir.
            </p>
          </div>
          <ShieldCheck size={34} />
        </section>
        <section className="panel span-2">
          <div className="panel-heading">
            <div><span className="eyebrow">SÜRÜM VE DEPOLAMA</span><h2>K2 EnerjiPro 3.0 — Demo</h2></div>
            <ShieldCheck size={28} />
          </div>
          <div className="metric-grid four">
            <div><span>Uygulama</span><strong>v{APP_VERSION}</strong></div>
            <div><span>Policy</span><strong>{CALCULATION_POLICY_VERSION}</strong></div>
            <div><span>Backup schema</span><strong>v{BACKUP_SCHEMA_VERSION}</strong></div>
            <div><span>Depolama</span><strong>IndexedDB</strong></div>
            <div><span>Müşteri</span><strong>{customers.length}</strong></div>
            <div><span>Taslak / teklif</span><strong>{costDrafts.length} / {offers.length}</strong></div>
            <div><span>Gerçekleşme</span><strong>{scenarios.length}</strong></div>
            <div><span>Son yedek</span><strong>{settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('tr-TR') : 'Yok'}</strong></div>
          </div>
        </section>
        <section className="panel span-2">
          <div className="panel-heading"><div><span className="eyebrow">DEMO SINIRLARI</span><h2>Desteklenmeyen ürün davranışları</h2></div></div>
          <ul className="demo-limits">
            <li>Backend, merkezi veritabanı ve çok kullanıcılı çalışma yoktur.</li>
            <li>Saatlik GES mahsuplaşması ve GES faturadan mahsup modu yoktur.</li>
            <li>Resmî fatura entegrasyonu ve otomatik tarife/mevzuat güncellemesi yoktur.</li>
            <li>EPİAŞ canlı veri entegrasyonu yoktur; piyasa fiyatları kullanıcı girdisidir.</li>
            <li>GES vergi modu, açık sabit TL girişi veya “demoda vergi yok” varsayımıyla sınırlıdır.</li>
            <li>PDF çıktısı tarayıcının yazdırma altyapısını kullanır.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function NullableMarketInput({
  label,
  value,
  min,
  onValue,
}: {
  label: string;
  value: number | null;
  min?: number;
  onValue: (value: number | null) => void;
}) {
  return (
    <input
      aria-label={label}
      type="number"
      step="0.001"
      min={min}
      value={value ?? ''}
      onChange={(event) => onValue(event.target.value === '' ? null : Number(event.target.value))}
    />
  );
}
