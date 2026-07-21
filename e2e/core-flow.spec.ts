import { expect, test } from '@playwright/test';

test('müşteriden rapora uçtan uca planlanan ve gerçekleşen akış', async ({ page }) => {
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

  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await page.getByRole('button', { name: 'Yeni ay ekle' }).click();
  const marketRow = page.locator('.market-price-table tbody tr').last();
  await marketRow.getByLabel('Ay', { exact: true }).fill('2026-07');
  await marketRow.getByLabel('Tahmini PTF').fill('3200');
  await marketRow.getByLabel('Tahmini YEKDEM').fill('400');
  await page.getByRole('button', { name: 'Piyasa verilerini kaydet' }).click();
  await expect(page.getByText('Piyasa verileri başarıyla kaydedildi')).toBeVisible();

  await page.getByRole('link', { name: 'Müşteriler' }).click();
  await page.getByRole('button', { name: 'Yeni müşteri' }).click();
  await page.getByLabel('Müşteri adı').fill('ABC Sanayi');
  await page.getByLabel('Etiket / kategori').fill('Sanayi');
  await page.getByLabel('Müşteri notu').fill('E2E doğrulama müşterisi');
  await page.getByRole('button', { name: 'Müşteriyi kaydet' }).click();
  await expect(page.getByText('Müşteri kaydedildi')).toBeVisible();

  await page.getByRole('link', { name: 'Maliyet Hesaplama' }).click();
  await page.getByLabel('Çalışma başlığı').fill('2026 Baz Teklif');
  await page.getByLabel('Kullanım başlangıcı').fill('2026-07-01');
  await page.getByLabel('Kullanım bitişi').fill('2026-07-31');
  await page.getByLabel('Aylık tüketim').fill('100');
  await page.getByLabel('GES Öz Tüketim Oranı').fill('30');
  await page.getByRole('button', { name: /Devam/ }).click();
  await expect(page.getByRole('heading', { name: 'Maliyet girdileri' })).toBeVisible();
  await page.getByRole('button', { name: /Devam/ }).click();
  await expect(page.getByText('Teklif oranı henüz girilmedi.')).toBeVisible();
  await page.getByRole('button', { name: /Devam/ }).click();
  await expect(page.getByRole('heading', { name: 'Maliyet sonucu ve başabaş' })).toBeVisible();
  await page.getByRole('button', { name: 'Maliyet taslağını kaydet' }).click();
  await expect(page.getByText('Maliyet taslağı kaydedildi')).toBeVisible();
  await page.getByRole('button', { name: /Devam/ }).click();
  await page.getByRole('spinbutton', { name: 'Teklif oranı %' }).fill('8');
  await page.getByRole('button', { name: 'Nihai teklifi kaydet' }).click();
  await expect(page).toHaveURL(/\/offers\//);
  await expect(page.getByText('Nihai teklif kaydedildi')).toBeVisible();

  await page.getByRole('button', { name: /Kopyala/ }).click();
  await expect(page).toHaveURL(/cost-calculation/);
  await page.getByRole('button', { name: /Teklif.*Canlı simülasyon/ }).click();
  await page.getByRole('spinbutton', { name: 'Teklif oranı %' }).fill('6');
  await page.getByRole('button', { name: 'Nihai teklifi kaydet' }).click();
  await expect(page).toHaveURL(/\/offers\//);

  await page.getByRole('link', { name: 'Gerçekleşme Simülasyonu' }).click();
  await page.getByLabel('Müşteri').selectOption({ label: 'ABC Sanayi' });
  await page.getByLabel('Planlanan teklif').selectOption({ index: 1 });
  await page.getByLabel('Senaryo adı').fill('5 Gün Gecikmeli');
  await page.getByRole('button', { name: 'Gerçekleşme senaryosu oluştur' }).click();
  await expect(page).toHaveURL(/\/realization\//);
  await expect(page.getByText('Bu ekran kaynak teklifi değiştirmez.')).toBeVisible();
  await page.getByLabel('Hesaplama tarihi').fill('2026-08-31');
  await page.getByLabel('Fatura / dönem').selectOption({ index: 1 });
  await page.getByLabel('Gerçek ödeme tarihi').fill('2026-08-20');
  await page.getByLabel('Tahsilat tutarı').fill('400000');
  await page.getByRole('button', { name: 'Tahsilat ekle' }).click();
  await page.getByLabel('Gerçek ödeme tarihi').fill('2026-08-25');
  await page.getByLabel('Tahsilat tutarı').fill('350000');
  await page.getByRole('button', { name: 'Tahsilat ekle' }).click();
  await expect(page.getByRole('heading', { name: 'Nihai Gecikme Bedeli Faturası' })).toBeVisible();
  await page.getByRole('button', { name: 'Senaryoyu kaydet' }).click();
  await expect(page.getByText('Gerçekleşme senaryosu kaydedildi').last()).toBeVisible();

  await page.getByRole('link', { name: 'Aylık Kâr' }).click();
  await page.getByLabel('Planlanan teklif').selectOption({ index: 1 });
  await expect(
    page.getByRole('heading', { name: 'Bu tüketim ayı ticari olarak ne kadar kârlıydı?' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Grafikler' }).click();
  await page.getByLabel('Müşteri').selectOption({ label: 'ABC Sanayi' });
  const checks = page.locator('.checkbox-list input[type="checkbox"]');
  await expect(checks).toHaveCount(2);
  await page.getByRole('checkbox', { name: '2026 Baz Teklif · Kopya · v1' }).check();
  await expect(
    page.getByRole('heading', { name: 'Seçili kayıtların zaman içindeki görünümü' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Raporlar' }).click();
  await page.getByLabel('Kaynak teklif').selectOption({ index: 1 });
  await expect(page.locator('.report-brand')).toContainText('ENERJİPRO 3.0');
  await page.reload();
  await page.getByRole('link', { name: 'Planlanan Teklifler' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
});
