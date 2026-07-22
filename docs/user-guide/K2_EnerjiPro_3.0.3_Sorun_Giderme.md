# K2 EnerjiPro 3.0.3 — Sorun Giderme

Her işlemden önce mümkünse güncel backup alın. “Veri kaybı riski” yüksek olan işlemlerde tarayıcı verisini temizlemeyin.

## 1. Uygulama açılmıyor

- **Belirti:** Tarayıcı bağlantı hatası gösteriyor.
- **Muhtemel neden:** Yerel sunucu çalışmıyor veya terminal kapandı.
- **Kullanıcı çözümü:** Teknik kullanıcıdan uygulamayı yeniden başlatmasını isteyin.
- **Teknik çözüm:** Proje klasöründe `npm run dev -- --host 127.0.0.1` çalıştırın ve terminaldeki adresi açın.
- **Veri kaybı riski:** Yok; IndexedDB aynı tarayıcı profilinde kalır.

## 2. npm install hatası

- **Belirti:** Paket kurulumu hata koduyla duruyor.
- **Muhtemel neden:** Node/npm sürümü, ağ veya dosya izni.
- **Kullanıcı çözümü:** Teknik destek isteyin; `node_modules` klasörünü elle silmeyin.
- **Teknik çözüm:** `node --version`, `npm --version` ve ağ erişimini kontrol edin; proje kökünde `npm install` çalıştırın.
- **Veri kaybı riski:** Uygulama verisine yok; proje dosyalarına yanlış müdahalede risk vardır.

## 3. Port kullanımda

- **Belirti:** “Port 4173 is already in use” veya strict port hatası.
- **Muhtemel neden:** Uygulamanın başka bir terminalde çalışması.
- **Kullanıcı çözümü:** Açık uygulama sekmesinin çalışıp çalışmadığını kontrol edin.
- **Teknik çözüm:** İlgili süreci bulun veya kontrollü olarak farklı portla çalıştırın: `npm run dev -- --host 127.0.0.1 --port 4175`.
- **Veri kaybı riski:** Farklı port farklı origin olduğundan veriler boş görünebilir; silinmiş saymayın.

## 4. Sayfa boş görünüyor

- **Belirti:** Menü var ancak kayıt veya kart yok.
- **Muhtemel neden:** Yeni IndexedDB origin’i, farklı port/host veya demo verisinin yüklenmemesi.
- **Kullanıcı çözümü:** Gösterge Paneli’ndeki **Demo verisi yükle** bağlantısını kullanın.
- **Teknik çözüm:** URL’nin önceki host ve portla aynı olduğundan emin olun; Browser console’u kontrol edin.
- **Veri kaybı riski:** Orta; yanlış origin’de veri temizlemeyin.

## 5. Veriler kaybolmuş görünüyor

- **Belirti:** Daha önceki müşteriler listede yok.
- **Muhtemel neden:** Farklı tarayıcı profili, host (`localhost`/`127.0.0.1`) veya port.
- **Kullanıcı çözümü:** Önceki uygulama adresi ve tarayıcı profiline dönün.
- **Teknik çözüm:** IndexedDB origin’ini kontrol edin; backup varsa önizleyin.
- **Veri kaybı riski:** Yüksek; doğru origin bulunmadan temizleme veya restore yapmayın.

## 6. Demo verisi tekrar yüklenmiyor

- **Belirti:** Kayıt sayısı artmıyor veya demo kayıtları aynı kalıyor.
- **Muhtemel neden:** Demo veri seti deterministik kimliklerle upsert edilir.
- **Kullanıcı çözümü:** Bu normaldir; aynı demo kayıtları çoğaltılmaz.
- **Teknik çözüm:** Deterministik demo kayıt kimliklerini ve başarı bildirimini kontrol edin.
- **Veri kaybı riski:** Yok.

## 7. Tarife bulunamadı

- **Belirti:** Nihai teklif “geçerli tarife bulunamadı” uyarısıyla engellenir.
- **Muhtemel neden:** Tarih aralığı kapsanmıyor, tarife pasif veya aktif tarifeler çakışıyor.
- **Kullanıcı çözümü:** Ayarlar → Tarife Kataloğu’nda müşteri tipi ve geçerlilik tarihini kontrol edin.
- **Teknik çözüm:** `validFrom`, `validTo`, `active` ve müşteri tipi eşleşmesini inceleyin.
- **Veri kaybı riski:** Düşük; mevcut tarifeyi silmek yerine kopyalayıp yeni dönem ekleyin.

## 8. Piyasa fiyatı eksik

- **Belirti:** Bir veya daha fazla ay “Tahmin eksik” gösterir.
- **Muhtemel neden:** Tahmini PTF veya YEKDEM girilmemiştir.
- **Kullanıcı çözümü:** Ayarlar’da eksik ayı ekleyin ve **Piyasa verilerini kaydet** düğmesini kullanın.
- **Teknik çözüm:** Ay formatının `YYYY-AA` ve YEKDEM’in sıfır/pozitif olduğunu kontrol edin.
- **Veri kaybı riski:** Düşük.

## 9. Teklif finalleşmiyor

- **Belirti:** **Nihai teklifi kaydet** devre dışı.
- **Muhtemel neden:** Eksik müşteri/oran/fiyat/tarife, geçersiz ödeme planı veya unsupported GES.
- **Kullanıcı çözümü:** Teklif adımındaki hata kartını okuyup önceki adımı düzeltin.
- **Teknik çözüm:** Final validation sonuçlarını ve tarife/piyasa çözümlemesini inceleyin.
- **Veri kaybı riski:** Yok; çalışma taslak olarak saklanabilir.

## 10. Gerçekleşme hesaplanmıyor

- **Belirti:** Senaryo bulunamadı, sonuçlar güncellenmiyor veya kaydetme başarısız.
- **Muhtemel neden:** Kaynak teklif yok, tarih geçersiz veya actual değer uygun değil.
- **Kullanıcı çözümü:** Senaryoyu listeden yeniden açın; hesaplama tarihi ve tahsilat tarihlerini kontrol edin.
- **Teknik çözüm:** Kaynak teklif referansı, period override ve actual payment alanlarını inceleyin.
- **Veri kaybı riski:** Düşük; kaynak teklif değişmez.

## 11. Rapor boş

- **Belirti:** “Rapor kaynağı seçin” görünür.
- **Muhtemel neden:** Nihai teklif seçilmemiştir.
- **Kullanıcı çözümü:** Rapor türünü ve **Kaynak teklif**i seçin. İç raporda senaryo isteğe bağlıdır.
- **Teknik çözüm:** Teklifin `final` statüsünde ve IndexedDB’de bulunduğunu kontrol edin.
- **Veri kaybı riski:** Yok.

## 12. PDF açılmıyor

- **Belirti:** **PDF / Yazdır** sonrasında pencere açılmıyor.
- **Muhtemel neden:** Tarayıcı yazdırma penceresi engeli veya kiosk politikası.
- **Kullanıcı çözümü:** Tarayıcı menüsünden Yazdır’ı açın ve hedefi “PDF olarak kaydet” seçin.
- **Teknik çözüm:** `window.print` desteğini ve kurumsal tarayıcı politikasını kontrol edin.
- **Veri kaybı riski:** Yok.

## 13. CSV Türkçe karakter sorunu

- **Belirti:** Excel’de Türkçe karakterler bozuk.
- **Muhtemel neden:** CSV’nin UTF-8 yerine sistem kodlamasıyla açılması.
- **Kullanıcı çözümü:** Excel’de Veri → Metinden/CSV → Dosya Kökeni UTF-8 seçin.
- **Teknik çözüm:** İndirilen dosyanın UTF-8 olarak üretildiğini doğrulayın.
- **Veri kaybı riski:** Yok.

## 14. Backup kabul edilmiyor

- **Belirti:** “Yedek dosyası okunamadı” veya desteklenmeyen schema uyarısı.
- **Muhtemel neden:** Bozuk JSON, yanlış schema, tekrar eden kimlik veya eksik referans.
- **Kullanıcı çözümü:** Dosyayı değiştirmeden doğru K2 backup’ını yeniden seçin.
- **Teknik çözüm:** `format`, `schemaVersion`, koleksiyonlar, ID ve referansları kontrol edin.
- **Veri kaybı riski:** Düşük; önizleme başarısızsa mevcut veriler korunur. Başarılı restore öncesi yine backup alın.

## 15. IndexedDB sorunu

- **Belirti:** Kayıt kaydetme/okuma hatası veya farklı origin’de boş görünüm.
- **Muhtemel neden:** Tarayıcı depolama izni, gizli pencere, profil veya origin farkı.
- **Kullanıcı çözümü:** Normal pencere ve doğru URL ile tekrar deneyin; tarayıcı verisini silmeyin.
- **Teknik çözüm:** DevTools Application → IndexedDB → `k2-energipro-3` alanını yalnız okuma amacıyla inceleyin; console’daki Dexie hatasını kaydedin.
- **Veri kaybı riski:** Yüksek; temizleme son seçenek olmalı ve önce backup alınmalıdır.

## 16. Testler çalışmıyor

- **Belirti:** lint, build, unit veya E2E komutu hata verir.
- **Muhtemel neden:** Eksik paket, port çakışması veya tarayıcı binary eksikliği.
- **Kullanıcı çözümü:** Teknik ekibe hata çıktısını iletin.
- **Teknik çözüm:** Sırasıyla `npm install`, `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e` çalıştırın. Playwright kurulumu eksikse mevcut proje politikasına göre browser binary’lerini kurun.
- **Veri kaybı riski:** Uygulama verisine yok.

## Acil veri güvenliği sırası

1. Tarayıcı verisini silmeyin.
2. Doğru profil, host ve portu doğrulayın.
3. Mevcut uygulama açılıyorsa tam yedek alın.
4. Backup önizleme sayılarını kontrol edin.
5. Restore’u yalnız doğru dosyada onaylayın.
