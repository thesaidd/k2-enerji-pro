import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const resetApplication = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('k2-energipro-3');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
};

const loadDemoData = async (page: import('@playwright/test').Page) => {
  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await page.getByRole('button', { name: 'Demo verisi yükle' }).click();
  await expect(page.getByText('Demo verisi yüklemek mevcut veriyi değiştirebilir.')).toBeVisible();
  await page.getByRole('button', { name: 'Uyarıyı kabul et ve yükle' }).click();
  await expect(page.getByText('Kontrollü demo verisi yüklendi')).toBeVisible();
};

test('boş başlangıç, deterministik demo yükleme, kalıcılık ve seçici temizleme', async ({ page }) => {
  await resetApplication(page);

  await expect(page.getByRole('heading', { name: 'İlk adımı seçin' })).toBeVisible();
  await expect(page.getByText('K2 EnerjiPro 3.0 — Demo')).toBeVisible();

  await page.getByRole('link', { name: 'Müşteriler' }).click();
  await page.getByRole('button', { name: 'Yeni müşteri' }).click();
  await page.getByLabel('Müşteri adı').fill('Kullanıcı Kaydı Korunmalı');
  await page.getByRole('button', { name: 'Müşteriyi kaydet' }).click();
  await expect(page.getByText('Müşteri kaydedildi')).toBeVisible();

  await loadDemoData(page);
  await page.getByRole('link', { name: 'Müşteriler' }).click();
  await expect(page.locator('.customer-card')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Kullanıcı Kaydı Korunmalı' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo Anadolu Sanayi' })).toBeVisible();

  await page.reload();
  await expect(page.locator('.customer-card')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Demo GES Üretim Tesisi' })).toBeVisible();

  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await page.getByRole('button', { name: 'Demo verisini temizle' }).click();
  await expect(page.getByText('Yalnız K2 demo fixture’ına ait deterministik kimlikler')).toBeVisible();
  await page.getByRole('button', { name: 'Yalnız demo verisini temizle' }).click();
  await expect(page.getByText('Yalnız demo fixture kayıtları temizlendi')).toBeVisible();

  await page.getByRole('link', { name: 'Müşteriler' }).click();
  await expect(page.locator('.customer-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Kullanıcı Kaydı Korunmalı' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo Anadolu Sanayi' })).toHaveCount(0);
});

test('rapor ayrımı, sürüm/tarife görünürlüğü ve güvenli yedek önizleme', async ({ page }) => {
  await resetApplication(page);
  await loadDemoData(page);

  await expect(page.getByRole('heading', { name: 'Tarihli demo tarife versiyonları' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Tarife versiyonları' }).locator('tbody tr')).toHaveCount(12);
  await expect(page.getByRole('main').getByText('v3.0.0')).toBeVisible();
  await expect(page.getByText('IndexedDB')).toBeVisible();
  await expect(page.getByText('Saatlik GES mahsuplaşması ve GES faturadan mahsup modu yoktur.')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tam yedek indir' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^k2-energipro-3\.0-yedek-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  const backupText = await readFile(backupPath!, 'utf8');
  const backup = JSON.parse(backupText) as {
    schemaVersion: number;
    appVersion: string;
    payload: { customers: unknown[]; plannedOffers: unknown[]; realizationScenarios: unknown[] };
  };
  expect(backup.schemaVersion).toBe(2);
  expect(backup.appVersion).toBe('3.0.0');
  expect(backup.payload.customers).toHaveLength(3);
  expect(backup.payload.plannedOffers).toHaveLength(6);
  expect(backup.payload.realizationScenarios).toHaveLength(1);

  const backupInput = page.locator('#backup input[type="file"]');
  await backupInput.setInputFiles({ name: 'round-trip.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
  await expect(page.getByText('Onaydan sonra mevcut veriler tek transaction içinde')).toBeVisible();
  await expect(page.locator('#backup').getByText('6', { exact: true })).toBeVisible();
  await page.locator('#backup').getByRole('button', { name: 'İptal' }).click();

  await backupInput.setInputFiles({ name: 'corrupt.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"K2-ENERJIPRO","schemaVersion":2,"appVersion":"3.0.0","payload":null}') });
  await expect(page.getByText('Yedek dosyası okunamadı')).toBeVisible();

  const legacyBackup = JSON.stringify({
    version: 'K2-ENERJIPRO-3.0',
    exportedAt: new Date().toISOString(),
    ...backup.payload,
  });
  await backupInput.setInputFiles({ name: 'legacy-3.0.json', mimeType: 'application/json', buffer: Buffer.from(legacyBackup) });
  await expect(page.getByText('Eski K2-ENERJIPRO-3.0 zarfı güvenli biçimde normalize edilecek.')).toBeVisible();
  await page.locator('#backup').getByRole('button', { name: 'Önizlemeyi onayla ve geri yükle' }).click();
  await expect(page.getByText('Yedek güvenli transaction ile geri yüklendi')).toBeVisible();

  await page.getByRole('link', { name: 'Raporlar' }).click();
  await page.getByLabel('Kaynak teklif').selectOption('demo-offer-standard');
  const paper = page.locator('.report-paper');
  await expect(paper).toContainText('DEMO — RESMÎ FATURA DEĞİLDİR');
  await expect(paper).toContainText('ENERJİPRO 3.0.0 · DEMO');
  await expect(paper).not.toContainText('Net kâr');
  await expect(paper).not.toContainText('Kredi maliyeti');

  const customerCsvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  const customerCsv = await customerCsvPromise;
  const customerCsvPath = await customerCsv.path();
  const customerCsvText = await readFile(customerCsvPath!, 'utf8');
  expect(customerCsvText).toContain('Tarife / piyasa kaynağı');
  expect(customerCsvText).not.toContain('Net kâr');
  expect(customerCsvText).not.toContain('Profit ledger');

  const customerJsonPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON' }).click();
  const customerJson = await customerJsonPromise;
  const customerJsonPath = await customerJson.path();
  const customerJsonText = await readFile(customerJsonPath!, 'utf8');
  expect(customerJsonText).not.toContain('netProfit');
  expect(customerJsonText).not.toContain('profitLedger');

  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.customerPrint = 'yes';
    };
  });
  await page.getByRole('button', { name: 'PDF / Yazdır' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-customer-print', 'yes');

  await page.getByLabel('Rapor türü').selectOption('internal_analysis');
  await expect(paper).toContainText('ŞİRKET İÇİ / GİZLİ');
  await expect(paper).toContainText('Net kâr');
  await expect(paper).toContainText('Profit ledger');
  await expect(paper).toContainText('Piyasa fiyat snapshot’ı');
  await expect(paper).toContainText('Aylık tahakkuk ve nakit');
  await expect(page.getByLabel('Rapor türü').locator('option:disabled')).toHaveCount(4);

  const internalCsvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  const internalCsv = await internalCsvPromise;
  const internalCsvPath = await internalCsv.path();
  const internalCsvText = await readFile(internalCsvPath!, 'utf8');
  expect(internalCsvText).toContain('Net kâr');
  expect(internalCsvText).toContain('Profit ledger');

  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.internalPrint = 'yes';
    };
  });
  await page.getByRole('button', { name: 'PDF / Yazdır' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-internal-print', 'yes');

  await page.reload();
  await page.getByRole('link', { name: 'Müşteriler' }).click();
  await expect(page.locator('.customer-card')).toHaveCount(3);
});

test('desteklenmeyen saatlik GES final adımında açık gerekçeyle engellenir', async ({ page }) => {
  await resetApplication(page);
  await page.getByRole('link', { name: 'Maliyet Hesaplama' }).click();
  await page.getByLabel('Kullanım başlangıcı').fill('');
  await page.getByLabel('Aylık tüketim').fill('');
  await expect(page.getByRole('heading', { name: 'Tüketim ve teknik bilgiler' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('NaN');
  await expect(page.locator('main')).not.toContainText('Infinity');
  await page.getByLabel('Kullanım başlangıcı').fill('2026-07-01');
  await page.getByLabel('Aylık tüketim').fill('100');
  await page.getByRole('button', { name: 'Gelişmiş ölçüm' }).click();
  await page.getByLabel('Ölçüm / mahsup').selectOption('hourly');
  await page.getByRole('button', { name: '5 Teklif Canlı simülasyon', exact: true }).click();

  await expect(page.getByText('Saatlik mahsuplaşma bu demo sürümünde desteklenmiyor.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nihai teklifi kaydet' })).toBeDisabled();

  await page.getByRole('button', { name: 'Tüketim Teknik bilgiler', exact: true }).click();
  await page.getByLabel('Ölçüm / mahsup').selectOption('monthly');
  await page.getByLabel('Mahsup şekli').selectOption('invoice_offset');
  await page.getByRole('button', { name: '5 Teklif Canlı simülasyon', exact: true }).click();
  await expect(page.getByText('Faturadan mahsup bu demo sürümünde desteklenmiyor')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nihai teklifi kaydet' })).toBeDisabled();
});

test('gerçek müşteri iadesi avansı azaltır, takvime girer ve yenilemede korunur', async ({ page }) => {
  await resetApplication(page);
  await loadDemoData(page);
  await page.goto('/realization/demo-scenario-realization');

  await expect(page.getByText('₺5.000,00 kullanılabilir')).toBeVisible();
  await page.getByLabel('İade tutarı').fill('2000');
  await page.getByRole('button', { name: 'İade ekle' }).click();
  await expect(page.getByText('₺3.000,00 kullanılabilir')).toBeVisible();
  await page.getByRole('button', { name: 'Senaryoyu kaydet' }).click();
  await expect(page.getByText('Gerçekleşme senaryosu kaydedildi')).toBeVisible();

  await page.reload();
  await expect(page.getByText('₺3.000,00 kullanılabilir')).toBeVisible();

  await page.getByRole('link', { name: 'Ödeme / Kullanım Takvimini Aç' }).click();
  const refundRow = page.locator('tbody tr').filter({ hasText: 'Gerçek müşteri iadesi' });
  await expect(refundRow).toContainText('₺2.000,00');
  await expect(refundRow).toContainText('₺3.000,00');
});
