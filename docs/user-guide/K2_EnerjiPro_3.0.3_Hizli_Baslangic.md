# K2 EnerjiPro 3.0.3 — Hızlı Başlangıç

Bu kısa rehber, demo sunumuna veya ilk incelemeye 10 dakika içinde başlamanız içindir. Ayrıntılı formüller için ana kullanıcı rehberine bakın.

> Demo sürümü resmî fatura veya muhasebe sistemi değildir. Veriler kullandığınız tarayıcının IndexedDB alanında saklanır.

## 1. Uygulamayı başlatın

PowerShell’de:

```powershell
cd C:\Users\yusuf\Projeler\kepsas\k2-enerji\k2-enerjipro-3.0
npm install
npm run dev -- --host 127.0.0.1
```

Terminalde gösterilen adresi tarayıcıda açın. Boş başlangıçta **İlk adımı seçin** kartını görmelisiniz.

![Boş başlangıç](screenshots/01-dashboard-empty.png)

## 2. Demo verisini yükleyin

1. **Ayarlar**’ı açın.
2. **Demo verisi yükle** düğmesine basın.
3. Uyarıyı okuyun.
4. **Uyarıyı kabul et ve yükle** düğmesine basın.
5. “Kontrollü demo verisi yüklendi” bildirimini doğrulayın.

![Demo yükleme](screenshots/02-demo-data-load.png)

Demo veri seti gerçek kullanıcı kayıtlarını silmez. Temizleme düğmesi de yalnız deterministik demo kayıtlarını kaldırır.

## 3. Müşteriyi seçin

**Müşteriler** ekranında üç örnek bulunur:

- Demo Anadolu Sanayi
- Demo Merkez Ticarethane
- Demo GES Üretim Tesisi

![Demo müşteriler](screenshots/03-customer-list.png)

Kendi deneme müşterinizi eklemek için **Yeni müşteri** düğmesini kullanın; müşteri adı zorunludur.

## 4. Bir teklifi açın

**Planlanan Teklifler** menüsünden **Demo Standart Vadeli** teklifini açın. Üst kartlarda brüt fatura, EPSAŞ net kârı, kredi/valör ve GES tasarrufunu görürsünüz.

![Teklif özeti](screenshots/11-calculation-summary.png)

Nihai teklif, teklif anındaki fiyat, tarife ve hesapların değiştirilemez kopyasıdır: Ayarlar daha sonra değişse bile kayıtlı teklif değişmez. Değişiklik için **Kopyala** ile yeni versiyon oluşturun.

## 5. Fiyat ve ödeme planını inceleyin

Teklif detayındaki dönem tablosunda Temmuz ve Ağustos PTF/YEKDEM kaynaklarını ve tarife versiyonunu kontrol edin. Yeni teklif hazırlarken Maliyet Hesaplama’daki **Ödeme planı** adımında dokuz hazır şablondan birini seçebilirsiniz.

![Ödeme planları](screenshots/08-payment-plan.png)

**Gelişmiş** görünümde ödeme kanalı, komisyon, banka valörü ve fazla/eksik ödeme mutabakatı bulunur.

## 6. Gerçekleşme senaryosunu açın

**Gerçekleşme Simülasyonu** menüsünden **Demo Gecikmeli Tahsilat ve Açık Alacak** kaydını açın. Planlanan ve gerçekleşen kârı, açık ana parayı, gecikme/KDV’yi ve açık finansmanı karşılaştırın.

![Gerçekleşme özeti](screenshots/13-realization-general.png)

Bu ekrandaki değişiklikler kaynak teklifi değiştirmez. Gerçek ödeme veya iade eklerseniz **Senaryoyu kaydet** düğmesini kullanın.

## 7. Ödeme takvimini inceleyin

Gerçekleşme ekranındaki **Ödeme / Kullanım Takvimini Aç** bağlantısını kullanın. **Gün görünümü**nü “Yalnız hareket olan günler” yaparak tedarikçi ödemeleri, müşteri tahsilatı, kredi ve bakiye değişimini daha kısa listede izleyin.

![Ödeme takvimi](screenshots/16-payment-calendar.png)

## 8. Müşteri raporunu yazdırın

1. **Raporlar**’ı açın.
2. Rapor türü olarak **Müşteri Teklif Raporu**nu seçin.
3. Kaynak teklif olarak **Demo Standart Vadeli**yi seçin.
4. Müşteriye gönderilecek görünümde net kâr ve profit ledger bulunmadığını kontrol edin.
5. **PDF / Yazdır** ile tarayıcı yazdırma penceresini açın.

![Müşteri raporu](screenshots/18-customer-report.png)

## 9. Yedek alın

**Ayarlar → 3.0 veri taşınabilirliği → Tam yedek indir** yolunu izleyin. Büyük bir değişiklik veya restore işleminden önce mutlaka güncel yedek alın.

Geri yüklemede dosyayı seçtikten sonra kayıt sayılarını ve legacy uyarılarını önizleyin; doğru dosya olduğundan emin olmadan onaylamayın.

![Backup önizleme](screenshots/21-backup-preview.png)

## Hızlı kontrol

- [ ] Uygulama başlığında `v3.0.3` görünüyor.
- [ ] Demo veri yükleme bildirimi alındı.
- [ ] Üç demo müşteri ve altı teklif var.
- [ ] Teklif detayında tarife ve piyasa kaynağı görünüyor.
- [ ] Gerçekleşme kaynak teklifi değiştirmiyor.
- [ ] Takvimde açık alacak ve finansman görünüyor.
- [ ] Müşteri raporunda iç kâr alanı yok.
- [ ] Güncel backup indirildi.
