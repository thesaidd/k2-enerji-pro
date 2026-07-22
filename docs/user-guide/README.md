# K2 EnerjiPro 3.0.3 kullanıcı dokümantasyonu

Bu klasör, K2 EnerjiPro 3.0.3 demo sürümünün gerçek UI ve hesaplama davranışına dayanan Türkçe dokümantasyon paketidir.

## Belgeler

- [K2_EnerjiPro_3.0.3_Kullanici_Rehberi.md](K2_EnerjiPro_3.0.3_Kullanici_Rehberi.md) — 28 bölümlü ana kaynak
- [K2_EnerjiPro_3.0.3_Kullanici_Rehberi.html](K2_EnerjiPro_3.0.3_Kullanici_Rehberi.html) — A4 yazdırmaya hazır HTML
- [K2_EnerjiPro_3.0.3_Kullanici_Rehberi.pdf](K2_EnerjiPro_3.0.3_Kullanici_Rehberi.pdf) — HTML kaynağından üretilen PDF
- [K2_EnerjiPro_3.0.3_Hizli_Baslangic.md](K2_EnerjiPro_3.0.3_Hizli_Baslangic.md) — kısa kullanım akışı
- [K2_EnerjiPro_3.0.3_Demo_Sunum_Akisi.md](K2_EnerjiPro_3.0.3_Demo_Sunum_Akisi.md) — 10–15 dakikalık demo senaryosu
- [K2_EnerjiPro_3.0.3_Sorun_Giderme.md](K2_EnerjiPro_3.0.3_Sorun_Giderme.md) — kullanıcı ve teknik kullanıcı çözümleri
- [screenshots/](screenshots/) — 22 gerçek uygulama ekran görüntüsü
- [build-guide.mjs](build-guide.mjs) — Markdown kaynağından HTML üreten bağımsız script

## Doğrulama kaynağı

- Uygulama sürümü: 3.0.3
- Hesaplama politikası: K2-ENERJIPRO-3.0.0
- Backup schema: 2
- Başlangıç etiketi: `v3.0.3-demo-ready`
- Demo veri seti: 3 müşteri, 6 teklif, 1 gerçekleşme senaryosu
- Browser: izole `http://localhost:4173` origin’i

## HTML üretimi

Proje kökünden:

```powershell
node docs/user-guide/build-guide.mjs
```

Script yalnız Node.js standart kütüphanesini kullanır; yeni paket eklemez.

## PDF üretimi

HTML dosyasını Chromium/Chrome’da açın, Yazdır’ı seçin ve hedefi **PDF olarak kaydet** yapın. Depodaki PDF aynı HTML kaynağından A4, arka plan grafikleri açık ve üst/alt bilgi etkin olacak şekilde üretilmiştir.

## Ekran görüntüsü ilkeleri

- Yalnız deterministik demo veri seti kullanılmıştır.
- Gerçek müşteri veya gizli veri yoktur.
- Görüntüler uygulama viewport’undan alınmış, tarayıcı çerçevesi dahil edilmemiştir.
- Dosya adları ana rehber sırasıyla `01`–`22` numaralıdır.

## Dokümantasyon sırasında bulunan ürün sorunu

- Sol üst ürün markası ve Ayarlar’daki “Sürüm ve Depolama” kart başlığı bazı yerlerde `3.0 · Demo` / `K2 EnerjiPro 3.0 — Demo` gösterirken aynı ekranda gerçek uygulama alanı `v3.0.3` gösteriyor. İşlevsel hesaplamayı etkilemeyen, düşük öncelikli UI release metadata tutarsızlığıdır. Bu dokümantasyon görevinde ürün kodu değiştirilmemiştir.
