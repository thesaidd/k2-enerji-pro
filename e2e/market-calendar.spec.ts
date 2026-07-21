import { expect, test } from '@playwright/test';

test('aylık piyasa verisinden çok aylı teklif ve ödeme takvimine gider', async ({ page }) => {
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
  for (const [month, ptf, yekdem] of [
    ['2026-07', '3200', '400'],
    ['2026-08', '3450', '430'],
  ]) {
    await page.getByRole('button', { name: 'Yeni ay ekle' }).click();
    const row = page.locator('.market-price-table tbody tr').last();
    await row.getByLabel('Ay', { exact: true }).fill(month);
    await row.getByLabel('Tahmini PTF').fill(ptf);
    await row.getByLabel('Tahmini YEKDEM').fill(yekdem);
    await row.getByLabel('Kaynak veya not').fill('E2E tahmini');
  }
  await page.getByRole('button', { name: 'Piyasa verilerini kaydet' }).click();
  await expect(page.getByText('Piyasa verileri başarıyla kaydedildi')).toBeVisible();

  await page.getByRole('link', { name: 'Müşteriler' }).click();
  await page.getByRole('button', { name: 'Yeni müşteri' }).click();
  await page.getByLabel('Müşteri adı').fill('Aylık Fiyat Sanayi');
  await page.getByRole('button', { name: 'Müşteriyi kaydet' }).click();

  await page.getByRole('link', { name: 'Maliyet Hesaplama' }).click();
  await page.getByLabel('Çalışma başlığı').fill('Temmuz Ağustos Teklifi');
  await page.getByLabel('Kullanım başlangıcı').fill('2026-07-01');
  await page.getByLabel('Kullanım bitişi').fill('2026-08-31');
  await page.getByLabel('Aylık tüketim').fill('100');
  await page.getByRole('button', { name: /Devam/ }).click();

  const marketTable = page.getByRole('table', { name: 'Teklif aylık piyasa tahminleri' });
  await expect(marketTable.getByText('2026-07')).toBeVisible();
  await expect(marketTable.getByText('2026-08')).toBeVisible();
  await expect(marketTable.locator('tbody tr').nth(0)).toContainText('3.200');
  await expect(marketTable.locator('tbody tr').nth(1)).toContainText('3.450');
  await page.getByRole('button', { name: /Devam/ }).click();
  await page.getByRole('button', { name: /Devam/ }).click();
  await page.getByRole('button', { name: /Devam/ }).click();
  await page.getByRole('spinbutton', { name: 'Teklif oranı %' }).fill('8');
  await page.getByRole('button', { name: 'Nihai teklifi kaydet' }).click();
  await expect(page).toHaveURL(/\/offers\//);

  const snapshotTable = page.getByRole('heading', {
    name: 'Kaydedildiği tarihte kullanılan piyasa verileri',
  });
  await expect(snapshotTable).toBeVisible();
  await expect(page.getByText('2026-07').last()).toBeVisible();
  await expect(page.getByText('2026-08').last()).toBeVisible();

  await page.getByRole('link', { name: 'Ödeme / Kullanım Takvimini Aç' }).click();
  await expect(page).toHaveURL(/payment-calendar\?source=planned_offer&id=/);
  await expect(page.locator('.calendar-source-summary')).toContainText('Temmuz Ağustos Teklifi');
  for (const column of [
    'Müşteri net nakit girişi',
    'PTF çıkışı',
    'YEKDEM çıkışı',
    'Kredi maliyeti',
    'Valör getirisi',
    'Kapanış bakiyesi',
  ])
    await expect(page.getByRole('columnheader', { name: column })).toBeVisible();

  await page.reload();
  await expect(page.locator('.calendar-source-summary')).toContainText('Temmuz Ağustos Teklifi');
  await expect(page.getByRole('columnheader', { name: 'Kapanış bakiyesi' })).toBeVisible();
});
