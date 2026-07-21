import { useState, type ChangeEvent } from 'react';
import {
  CalendarPlus,
  DatabaseBackup,
  FileUp,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAppStore } from '../../app/store/useAppStore';
import { CALCULATION_POLICY_VERSION } from '../../config/calculationPolicy';
import {
  DataPortabilityService,
  type BackupPayload,
} from '../../services/storage/DataPortabilityService';
import {
  detectLegacyLocalStorage,
  preview217Migration,
  type MigrationPreview,
} from '../../services/migration/migrate217';
import { downloadText } from '../../services/export/download';
import { NumberField } from '../../components/ui/NumberField';
import { PageHeader } from '../../components/ui/PageHeader';

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const applyMigration = useAppStore((state) => state.applyMigration);
  const loadAll = useAppStore((state) => state.loadAll);
  const notify = useAppStore((state) => state.notify);
  const [lateRate, setLateRate] = useState(settings.lateFee.monthlyRate);
  const [holiday, setHoliday] = useState('');
  const [migration, setMigration] = useState<MigrationPreview | null>(null);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const version =
        parsed && typeof parsed === 'object' && 'version' in parsed
          ? String((parsed as { version?: unknown }).version)
          : '';
      if (version === 'K2-ENERJIPRO-3.0') {
        await DataPortabilityService.restore(parsed as BackupPayload);
        await loadAll();
        notify({ tone: 'success', title: '3.0 yedeği geri yüklendi', detail: file.name });
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
  const backup = async () =>
    downloadText(
      JSON.stringify(await DataPortabilityService.export(), null, 2),
      `k2-energipro-3.0-yedek-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    );
  return (
    <div>
      <PageHeader
        eyebrow="POLİTİKA VE VERİ"
        title="Ayarlar"
        description="Tema, gecikme politikası, tatiller, yedekleme ve 2.17 veri taşıma işlemlerini yönetin."
      />
      <div className="settings-grid">
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
        <section className="panel">
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
      </div>
    </div>
  );
}
