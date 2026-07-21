# K2 EnerjiPro 3.0

## Projenin amacı

K2 EnerjiPro 3.0, tek HTML dosyasındaki 2.17 demosunu modüler, test edilebilir ve tarayıcıda kalıcı veri saklayan bir frontend uygulamasına dönüştürür. Müşteri, maliyet, teklif, ödeme planı, gerçekleşme, gecikme, finansman, aylık kâr, grafik ve rapor akışları birbirinden ayrılmış domain modülleriyle hesaplanır.

Kaynak `k2-pro-version_chat-2.17.html` yalnızca referans olarak incelenmiştir; 3.0 projesi ayrı klasördedir ve kaynak dosyayı değiştirmez.

## Teknoloji yığını

- Vite, React ve TypeScript (`strict`)
- React Router
- Zustand
- Dexie / IndexedDB
- Zod
- date-fns
- Recharts
- Vitest, React Testing Library ve V8 coverage
- Playwright
- ESLint ve Prettier

## Kurulum

Gereksinim: güncel Node.js ve npm.

```bash
npm install
npx playwright install chromium
```

## Çalıştırma

```bash
npm run dev
```

Uygulama varsayılan olarak `http://localhost:4173` adresinde açılır.

## Build

```bash
npm run build
npm run preview
```

Üretim çıktısı `dist/` klasörüne yazılır. `npm run build`, önce TypeScript project build çalıştırdığı için strict tip hatalarında durur.

## Testler

```bash
npm run test
npm run test:coverage
npm run test:e2e
npm run lint
```

Vitest yalnızca `src/**/*.{test,spec}.{ts,tsx}` dosyalarını toplar; Playwright senaryoları `e2e/` altında ayrı çalışır. Coverage HTML raporu `coverage/` klasöründedir. Testler; 12 müşteri tipi, 8 hazır ödeme planı matrisi, özel planlar, fatura, vergi, GES, gecikme, kısmi ödeme, kredi/valör, gerçekleşme, migration ve temel arayüz bileşenlerini kapsar.

## Klasör yapısı

```text
k2-enerjipro-3.0/
├─ e2e/                         # Playwright uçtan uca akışları
├─ src/
│  ├─ app/router/               # Route tanımları
│  ├─ app/store/                # Zustand uygulama durumu
│  ├─ components/               # Ortak UI, grafik ve ödeme planı bileşenleri
│  ├─ config/                   # Tarife, politika, varsayılanlar ve plan şablonları
│  ├─ domain/                   # Saf hesaplama motorları
│  ├─ pages/                    # Route sayfaları
│  ├─ services/export/          # CSV/JSON indirme
│  ├─ services/migration/       # 2.17 dönüşümü
│  ├─ services/storage/         # Dexie ve repository katmanı
│  ├─ tests/                    # Vitest/RTL testleri
│  └─ types/                    # Paylaşılan TypeScript modelleri
├─ playwright.config.ts
├─ vite.config.ts
└─ package.json
```

## Hesaplama motoru

Hesaplar `src/domain` altında saf fonksiyonlar olarak tutulur. Politika sürümü `K2-ENERJIPRO-3.0.0` olarak her sonuç snapshot'ına yazılır. Kullanım aralığı fatura dönemlerine bölünür; kısmi ay tüketimi gün payıyla dağıtılır. Ara hesaplarda yuvarlama yapılmaz, yalnızca arayüz gösteriminde biçimlendirme uygulanır.

Temel aktif enerji hesabı:

```text
Aktif enerji tabanı = Şebekeden tüketim × (PTF + YEKDEM)
Teklif marjı         = Aktif enerji tabanı × Teklif oranı
Aktif enerji satışı  = Aktif enerji tabanı + Teklif marjı
```

Net kâr; teklif marjından dengesizlik, PİÜ, ödeme kanalı ve kredi maliyetlerini düşer; valör ve gerçekleşmiş gecikme gelirlerini ekler. Vergiler kâr sayılmaz.

## Vergi formülleri

```text
BTV matrahı = Aktif enerji satışı
BTV         = BTV matrahı × BTV oranı

KDV matrahı = Aktif enerji satışı
            + Dağıtım
            + Sözleşme gücü
            + BTV
KDV         = KDV matrahı × KDV oranı

Brüt fatura = Aktif enerji satışı
            + Dağıtım
            + Sözleşme gücü
            + BTV
            + KDV
```

KDV ve BTV oranları 12 müşteri tipi için 2026 referans tablosundan gelir. Dağıtımsız model seçildiğinde dağıtım bedeli sıfırlanır.

## GES modeli

2.17'deki GES alacağı yaklaşımı değiştirilmiştir. Basit modda girilen oran, müşterinin eşzamanlı öz tüketim oranıdır:

```text
Öz tüketim         = min(Brüt tüketim, Brüt tüketim × Öz tüketim oranı)
Şebekeden tüketim  = max(0, Brüt tüketim - Öz tüketim)
Öz tüketim tasarrufu = Öz tüketim × Aktif enerji birim fiyatı
```

Gelişmiş sayaç modunda eşzamanlı öz tüketim, şebeke çekişi, şebekeye veriş ve mahsuplaşma sonrası ihtiyaç fazlası ayrı alanlardır. İhtiyaç fazlası üretim satın alımı öz tüketim tasarrufuna eklenmez; ayrı nakit çıkışı ve belge olarak ele alınır.

## Ödeme planı

Sekiz hazır şablon ile özel plan editörü bulunur. Satırlar dönem bazında veya sözleşmede bir kez uygulanabilir; tüm dönemler ya da seçili dönemler hedeflenebilir. Tutar türleri arasında yüzde, sabit TL ve kalan bakiye; tarih referansları arasında dönem başlangıcı, dönem sonu, fatura tarihi, vade tarihi ve manuel tarih vardır.

Taksit, komisyon, valör günü, ödeme kanalı ve manuel not satır bazında saklanır. Plan doğrulaması; pozitif tutarları, zorunlu manuel tarihi, seçili dönemleri ve bakiye uyumunu kontrol eder. Müşteri ödemesi ile EPSAŞ net nakit girişi ayrı tutulur.

## Gerçekleşme simülasyonu

Gerçekleşme senaryosu, kaynak nihai teklifin değişmez snapshot'ını ve sürümünü kopyalar. Gerçek tahsilatlar, ödeme kanalı, fatura bağlantısı, tarih ve tutarla eklenir. Atanmamış ödemeler en eski vadeden başlayarak açık faturalara dağıtılır; fazla tutar müşteri avansı olur.

Planlanan ve gerçekleşen nakit akışı, kredi/valör sonucu, gecikme alacağı, aylık kâr ve sapma aynı senaryoda yeniden hesaplanır. Senaryoyu değiştirmek kaynak teklifi değiştirmez.

## Gecikme motoru

Varsayılan aylık oran `%5,55`, gün esası `360` ve yöntem basit faizdir:

```text
Gecikme bedeli = Açık anapara × Geciken gün × (Aylık oran / 100) × 12 / 360
```

Vade günü gecikmiş sayılmaz. Hafta sonu ve tatiller gecikme gününe dahildir. Vade öncesi/üzerindeki ödemeler başlangıç anaparasını azaltır. Kısmi ödemeler tarih sırasıyla segment oluşturur ve sonraki segment yalnızca kalan anapara üzerinden işler. Gecikme bedeli ile gecikme KDV'si anaparaya eklenip bileşikleştirilmez. Gecikme KDV'si kaynak faturanın efektif KDV oranıyla ayrı hesaplanır.

## Kredi/valör motoru

Nakit akışı günlük çalışır ve gün esası `365`tir. Önce tedarikçi çıkışları ve iadeler uygulanır; gün içi faiz tabanı bu ara bakiyedir:

```text
Negatif bakiye kredi maliyeti = |Bakiye| × Yıllık kredi oranı / 365
Pozitif bakiye valör geliri   = Bakiye × Yıllık valör oranı / 365
```

Ardından faiz ve müşteri girişleri kapanış bakiyesine işlenir. EPİAŞ PTF çıkışları teslimat günü ve politika takvim ofsetiyle, diğer tedarikçi/vergi kalemleri kendi vade ofsetleriyle oluşturulur. Hafta sonu ve kullanıcı tanımlı resmi tatiller EPİAŞ ödeme tarihinde dikkate alınır.

## Aylık kâr

İki görünüm birbirinden ayrıdır:

- Tahakkuk bazlı kâr, geliri ve maliyeti tüketimin ekonomik ayına yazar.
- Nakit bazlı sonuç, paranın gerçekten giriş/çıkış yaptığı ayı gösterir.

Tahakkuk bazlı satır; aktif enerji geliri, teklif marjı, dengesizlik, PİÜ, kanal maliyeti, kredi, valör ve gecikme gelirini gösterir. KDV, BTV ve gecikme KDV'si kâr değildir. Nakit sonucu, nakit girişleri eksi tedarikçi çıkışları, iadeler ve kredi maliyetidir.

## Veri saklama

Veriler `k2-energipro-3` adlı IndexedDB veritabanında Dexie ile tutulur. Tablolar:

- `customers`
- `costDrafts`
- `plannedOffers`
- `realizationScenarios`
- `settings`

Repository katmanı sayfaları Dexie ayrıntılarından ayırır. Ayarlar ekranı tüm veriyi sürümlü JSON yedeğine aktarabilir ve aynı sürümdeki yedeği tek transaction içinde geri yükleyebilir. Bu işlem yereldir; tarayıcı profili silinirse yedeklenmemiş veri kaybolur.

## 2.17 migration

Migration iki şekilde çalışır: Ayarlar sayfasına 2.17 JSON verisi yapıştırma veya bilinen legacy localStorage anahtarlarını algılama. Önce müşteri, teklif, arşiv ve dönüştürülemeyen kayıt sayılarıyla önizleme üretilir; kullanıcı onayından sonra yazılır.

Eski teklif sonucu `legacySnapshot` içinde denetim izi olarak korunur, fakat 3.0 sonucu güncel hesap motoruyla yeniden üretilir. Eski GES oranı `GES Öz Tüketim Oranı` olarak yorumlanır; eski GES alacağı ve tahsilat gecikmesi yeni modele taşınmaz. Bu değişiklik migration uyarısında açıkça gösterilir. Tatiller mevcut ayarlarla birleştirilir ve tekilleştirilir.

## Raporlama

Rapor ekranında maliyet analizi, müşteri teklifi, iç kârlılık, planlanan/gerçekleşen nakit, aylık kâr, gecikme, teklif karşılaştırması ve tarife/tasarruf rapor türleri bulunur. Kaynak teklif sürümü, hesap zamanı ve politika sürümü raporda görünür. CSV ve JSON indirme ile yazdırmaya uygun PDF görünümü sağlanır. Grafikler CSV olarak dışa aktarılabilir.

## Bilinen sınırlamalar

- Uygulama yalnızca frontend'dir; kullanıcı hesabı, yetkilendirme, merkezi veritabanı, eşzamanlı çalışma ve sunucu denetim kaydı yoktur.
- Tarife ve mevzuat parametreleri otomatik bir resmi kaynaktan güncellenmez; 2026 referans değerleri uygulama konfigürasyonundadır.
- Resmi EPİAŞ/takas süreçleriyle çevrimiçi entegrasyon yoktur; ödeme tarihleri sürümlü politika ofsetleriyle modellenir.
- PDF çıktısı tarayıcının yazdırma altyapısına, XLSX çıktısı yerine tablo raporları CSV/JSON dışa aktarımına dayanır.
- Gelişmiş GES sonucunun doğruluğu kullanıcı tarafından girilen sayaç/mahsuplaşma verisinin doğruluğuna bağlıdır.
- Büyük Recharts bağımlılığı nedeniyle üretim derlemesi 500 kB chunk uyarısı verir; build başarılıdır.

## Backend'e geçiş notları

Domain fonksiyonları tarayıcı API'lerinden bağımsızdır ve sunucu paketine taşınabilir. Backend geçişinde Dexie repository arayüzleri HTTP/API repository'leriyle değiştirilmeli; snapshot ve politika sürümü korunmalıdır. Para alanları veritabanında sabit hassasiyetli decimal tipinde tutulmalı, kimlik ve zaman damgaları sunucu tarafından üretilmeli, transaction ve optimistic concurrency uygulanmalıdır.

Kimlik doğrulama, rol bazlı yetki, tenant/müşteri ayrımı, değiştirilemez audit log, resmi tarife sürümleme, sunucu tarafı PDF/XLSX üretimi ve migration idempotency anahtarları backend kapsamına alınmalıdır. Aynı golden ve regression testleri hem frontend domain paketinde hem backend hesap servisinde çalıştırılmalıdır.
