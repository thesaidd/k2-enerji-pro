<div align="center">

# K2 EnerjiPro 3.0.3

**Elektrik perakende satış şirketleri için teklif, ödeme planı, finansman ve gerçekleşme simülasyonu**

[![Version](https://img.shields.io/badge/version-3.0.3-2563eb)](./package.json)
[![Status](https://img.shields.io/badge/status-demo%20ready-16a34a)](./docs/user-guide/K2_EnerjiPro_3.0.3_Kullanici_Rehberi.pdf)
[![Unit Tests](https://img.shields.io/badge/unit%20tests-317%20passing-16a34a)](#testler)
[![E2E](https://img.shields.io/badge/e2e-6%20passing-16a34a)](#testler)
[![React](https://img.shields.io/badge/React-TypeScript-149eca)](https://react.dev/)

K2 EnerjiPro; enerji satış tekliflerini, dönemsel tarifeleri, ödeme planlarını, günlük nakit akışını ve gerçekleşen finansal sonuçları tek bir uygulamada analiz eden modüler bir frontend projesidir.

[Hızlı Başlangıç](#hızlı-başlangıç) · [Özellikler](#öne-çıkan-özellikler) · [Mimari](#mimari) · [Kullanıcı Rehberi](./docs/user-guide/K2_EnerjiPro_3.0.3_Kullanici_Rehberi.pdf)

</div>

![K2 EnerjiPro hesaplama özeti](docs/user-guide/screenshots/11-calculation-summary.png)

> [!IMPORTANT]
> Bu sürüm kontrollü yerel demo ve sunum kullanımı içindir. Resmî fatura, muhasebe veya canlı enerji piyasası entegrasyonu değildir.

## Proje özeti

K2 EnerjiPro, elektrik perakende satış şirketlerinin tüketicilere sunduğu ikili anlaşmalar için aşağıdaki süreçleri birlikte modellemek amacıyla geliştirilmiştir:

- tüketim ve dönem bazlı teklif hesaplama,
- aylık PTF ve YEKDEM fiyatları,
- tarihli tarife versiyonları,
- esnek ödeme planları ve komisyonlar,
- müşteri avansı ve açık alacak mutabakatı,
- günlük kredi/valör finansmanı,
- gerçekleşen tüketim ve tahsilatlar,
- gecikme bedeli,
- GES öz tüketim ve ihtiyaç fazlası maliyeti,
- aylık tahakkuk/nakit kârlılığı,
- müşteri ve şirket içi raporlar.

İlk tek dosyalık demo, bu sürümde ayrıştırılmış domain modülleri, kalıcı tarayıcı verisi, sürümlü snapshot yapısı ve kapsamlı otomatik testlerle yeniden tasarlanmıştır.

## Öne çıkan özellikler

| Alan | Yetenek |
|---|---|
| **Teklif motoru** | Çok aylı tüketim, PTF/YEKDEM, teklif marjı, dağıtım, BTV, KDV ve sözleşme gücü |
| **Tarife yönetimi** | `validFrom` / `validTo` destekli dönemsel tarife versiyonları ve gerekçeli manuel override |
| **Ödeme planı** | 9 hazır şablon, özel plan editörü, taksit, komisyon, banka valörü ve çoklu ödeme satırları |
| **Mutabakat** | Fazla ödemeyi taşıma/iade etme; eksik ödemeyi tahsil etme, taşıma veya açık bırakma |
| **Finansman** | Günlük bileşik kredi maliyeti, valör getirisi ve açık finansman bakiyesi |
| **Gerçekleşme** | Gerçek tüketim, piyasa fiyatı, tahsilat, komisyon, iade ve finansman override’ları |
| **GES** | Basit öz tüketim, gelişmiş sayaç modeli, aylık/manual mahsuplaşma ve ihtiyaç fazlası nakit çıkışı |
| **Gecikme** | Kısmi ödemeleri dikkate alan segment bazlı gecikme bedeli ve gecikme KDV’si |
| **Kârlılık** | Planlanan/gerçekleşen profit ledger, aylık tahakkuk ve aylık nakit görünümü |
| **Raporlama** | Müşteri teklif raporu, şirket içi analiz, CSV, JSON ve tarayıcı tabanlı PDF |
| **Veri güvenliği** | IndexedDB, sürümlü JSON yedeği, restore önizlemesi ve transaction güvenliği |
| **Demo deneyimi** | Deterministik demo veri seti, seçici demo temizleme ve gerçek UI rehberi |

## Ekran görüntüleri

<table>
  <tr>
    <td width="50%"><img src="docs/user-guide/screenshots/05-cost-calculation-general.png" alt="Teklif hesaplama ekranı"></td>
    <td width="50%"><img src="docs/user-guide/screenshots/16-payment-calendar.png" alt="Ödeme ve kullanım takvimi"></td>
  </tr>
  <tr>
    <td align="center"><strong>Teklif ve maliyet hesaplama</strong></td>
    <td align="center"><strong>Ödeme/Kullanım Takvimi</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/user-guide/screenshots/13-realization-general.png" alt="Gerçekleşme analizi"></td>
    <td width="50%"><img src="docs/user-guide/screenshots/19-internal-report.png" alt="İç finansal analiz raporu"></td>
  </tr>
  <tr>
    <td align="center"><strong>Planlanan ve gerçekleşen sonuçlar</strong></td>
    <td align="center"><strong>Şirket içi finansal rapor</strong></td>
  </tr>
</table>

Tüm ekranlar deterministik demo verisiyle oluşturulmuştur. Gerçek müşteri veya gizli şirket verisi içermez.

## Temel iş kuralları

<details>
<summary><strong>Aktif enerji, BTV ve KDV formülleri</strong></summary>

```text
Aktif enerji tabanı = Şebekeden tüketim × (PTF + YEKDEM)
Teklif marjı        = Aktif enerji tabanı × Teklif oranı
Aktif enerji satışı = Aktif enerji tabanı + Teklif marjı

BTV matrahı = Aktif enerji satışı
BTV         = BTV matrahı × BTV oranı

KDV matrahı = Aktif enerji satışı
            + Dağıtım
            + Sözleşme gücü
            + BTV

KDV = KDV matrahı × KDV oranı
```

Ara hesaplarda yuvarlama yapılmaz; biçimlendirme yalnız kullanıcı arayüzünde uygulanır.

</details>

<details>
<summary><strong>Günlük kredi ve valör sırası</strong></summary>

```text
Açılış bakiyesi
→ tedarikçi çıkışları ve iadeler
→ faiz bazı
→ kredi maliyeti / valör getirisi
→ müşteri tahsilatları
→ gecikme tahsilatları
→ kapanış bakiyesi
```

- Gün bazı: `365`
- Hafta sonu ve tatillerde faiz işler.
- Aynı gün alınan müşteri tahsilatı o gün valör üretmez.

</details>

<details>
<summary><strong>Gecikme bedeli</strong></summary>

```text
Gecikme bedeli = Açık anapara
               × Geciken gün
               × (Aylık oran / 100)
               × 12 / 360
```

Varsayılan aylık oran `%5,55` ve yöntem basit faizdir. Kısmi ödemeler kalan anapara üzerinden yeni segment oluşturur.

</details>

## Mimari

Hesaplama kuralları kullanıcı arayüzünden ayrılmış saf domain fonksiyonlarında tutulur. Nihai teklifler, oluşturuldukları andaki fiyat, tarife ve hesaplama değerlerini değiştirilemez snapshot olarak saklar.

```text
k2-enerji-pro/
├─ docs/user-guide/              # Kullanıcı rehberi, PDF ve ekran görüntüleri
├─ e2e/                          # Playwright uçtan uca senaryoları
├─ src/
│  ├─ app/                       # Router ve Zustand store
│  ├─ components/                # Ortak arayüz ve ödeme planı bileşenleri
│  ├─ config/                    # Sürüm, tarife, politika ve varsayılanlar
│  ├─ demo/                      # Deterministik demo veri seti
│  ├─ domain/                    # Saf hesaplama motorları
│  │  ├─ financing/
│  │  ├─ ges/
│  │  ├─ invoice/
│  │  ├─ late-fee/
│  │  ├─ payment-calendar/
│  │  ├─ payment-plan/
│  │  ├─ profitability/
│  │  ├─ realization/
│  │  ├─ receivables/
│  │  ├─ reconciliation/
│  │  ├─ reporting/
│  │  └─ tariff/
│  ├─ pages/                     # Route sayfaları
│  ├─ services/                  # Storage, migration ve export servisleri
│  ├─ tests/                     # Vitest ve RTL testleri
│  └─ types/                     # Paylaşılan TypeScript modelleri
├─ playwright.config.ts
├─ vite.config.ts
└─ package.json
```

### Tasarım kararları

- **Immutable teklif snapshot’ı:** Ayarlar değişse bile geçmiş teklif değişmez.
- **Planlanan/gerçekleşen ayrımı:** Tahmin edilen ve gerçekleşen finansal sonuçlar ayrı tutulur.
- **Ortak profit ledger:** Aylık ve sözleşme toplamları aynı finansal kaynaktan üretilir.
- **Receivable ledger:** Açık alacak, tahsilat, müşteri avansı ve iadeler tek kaynaktan izlenir.
- **UI’dan bağımsız domain:** Hesaplama motorları backend’e taşınabilecek biçimde tarayıcı API’lerinden ayrılmıştır.
- **Ara yuvarlama yok:** Para hesaplarında doğruluk korunur; yalnız gösterim biçimlendirilir.

## Teknoloji yığını

- **Frontend:** React, TypeScript, Vite, React Router
- **State:** Zustand
- **Form ve doğrulama:** React Hook Form, Zod
- **Yerel veritabanı:** Dexie / IndexedDB
- **Tarih işlemleri:** date-fns
- **Grafikler:** Recharts
- **Unit ve component testleri:** Vitest, React Testing Library
- **E2E:** Playwright / Chromium
- **Kod kalitesi:** ESLint, Prettier, TypeScript strict mode

## Hızlı başlangıç

### Gereksinimler

- Güncel Node.js LTS
- npm

### Kurulum

```bash
git clone https://github.com/thesaidd/k2-enerji-pro.git
cd k2-enerji-pro
npm install
npx playwright install chromium
```

### Geliştirme sunucusu

```bash
npm run dev
```

Uygulama: `http://localhost:4173`

### Production build

```bash
npm run build
npm run preview
```

Preview: `http://localhost:4174`

### Demo verisini yükleme

1. Uygulamayı açın.
2. **Ayarlar** sayfasına gidin.
3. **Demo verisi yükle** düğmesine basın.
4. Uyarıyı okuyup onaylayın.
5. Üç müşteri, altı teklif ve örnek gerçekleşme senaryosu otomatik olarak eklenir.

## Testler

```bash
npm run lint
npm run build
npm run test
npm run test:coverage
npm run test:e2e
```

Son doğrulanan durum:

| Kontrol | Sonuç |
|---|---:|
| Unit / integration | **317 / 317** |
| E2E | **6 / 6** |
| Statements | **%89,64** |
| Branches | **%73,29** |
| Functions | **%87,40** |
| Lines | **%91,77** |

Test kapsamı; 12 müşteri tipi, 9 ödeme planı şablonu, vergi hesapları, dönemsel tarifeler, GES, mutabakat, alacak ledger’ı, kredi/valör, gerçekleşme, gecikme, raporlama, migration ve yedekleme akışlarını içerir.

## Kullanıcı dokümantasyonu

| Belge | Açıklama |
|---|---|
| [Kullanıcı Rehberi — PDF](docs/user-guide/K2_EnerjiPro_3.0.3_Kullanici_Rehberi.pdf) | 36 sayfalık ayrıntılı rehber |
| [Kullanıcı Rehberi — Markdown](docs/user-guide/K2_EnerjiPro_3.0.3_Kullanici_Rehberi.md) | GitHub üzerinden okunabilir ana kaynak |
| [Hızlı Başlangıç](docs/user-guide/K2_EnerjiPro_3.0.3_Hizli_Baslangic.md) | İlk kullanım için kısa akış |
| [Demo Sunum Akışı](docs/user-guide/K2_EnerjiPro_3.0.3_Demo_Sunum_Akisi.md) | 10–15 dakikalık ürün demosu |
| [Sorun Giderme](docs/user-guide/K2_EnerjiPro_3.0.3_Sorun_Giderme.md) | Kullanıcı ve teknik çözüm adımları |
| [Tüm dokümantasyon](docs/user-guide/README.md) | Belge ve ekran görüntüsü envanteri |

## Veri saklama ve yedekleme

Veriler tarayıcıdaki `k2-energipro-3` isimli IndexedDB veritabanında saklanır:

- `customers`
- `costDrafts`
- `plannedOffers`
- `realizationScenarios`
- `settings`

Ayarlar ekranından sürümlü JSON yedeği alınabilir. Restore işleminden önce dosya doğrulanır, kayıt özeti gösterilir ve veriler tek transaction içinde yazılır. Geçersiz yedek mevcut verileri silmez.

> Tarayıcı profili temizlenmeden veya başka bilgisayara geçilmeden önce yedek alınmalıdır.

## Desteklenen ve desteklenmeyen GES özellikleri

| Özellik | Durum |
|---|---|
| Basit öz tüketim | ✅ Destekleniyor |
| Gelişmiş sayaç modeli | ✅ Destekleniyor |
| Aylık mahsuplaşma | ✅ Destekleniyor |
| Manuel mahsuplaşma | ✅ Destekleniyor |
| PTF / PTF+YEKDEM / manuel alım fiyatı | ✅ Destekleniyor |
| İhtiyaç fazlası `cash_outflow` | ✅ Destekleniyor |
| Saatlik mahsuplaşma | ⛔ Demo sürümünde yok |
| Faturadan mahsup (`invoice_offset`) | ⛔ Demo sürümünde yok |

## Bilinen sınırlamalar

- Uygulama frontend-only çalışır; backend, kullanıcı hesabı ve rol bazlı yetki bulunmaz.
- Veriler merkezi sunucu yerine kullanıcının tarayıcısında tutulur.
- EPİAŞ, e-fatura veya resmî tarife servisleriyle canlı bağlantı yoktur.
- Tarife ve mevzuat parametreleri otomatik güncellenmez.
- Saatlik GES verisi ve faturadan mahsup modu desteklenmez.
- PDF çıktısı tarayıcının yazdırma altyapısını kullanır.
- Production build başarılıdır; ana JavaScript paketi için code-splitting uyarısı devam eder.

## Yol haritası

Demo sonrasındaki ürünleştirme hedefleri:

- FastAPI tabanlı backend ve PostgreSQL,
- kullanıcı girişi, rol ve yetki yönetimi,
- şirket/tenant izolasyonu,
- teklif onay ve versiyonlama akışı,
- değiştirilemez audit log,
- merkezi yedekleme ve hata izleme,
- canlı tarife ve piyasa veri entegrasyonları,
- sunucu tarafı PDF/XLSX rapor üretimi.

## Sürümleme

- `v3.0.1-market-calendar` — aylık piyasa verileri ve ödeme takvimi
- `v3.0.2-p0b-reconciliation` — finansman ve kârlılık mutabakatı
- `v3.0.3-demo-ready` — kontrollü demo sürümü

## Geliştirici

**Yusuf Sait Sakoğlu**  
Bilgisayar Mühendisliği · Full-stack geliştirme · Finansal modelleme · Enerji teknolojileri

GitHub: [@thesaidd](https://github.com/thesaidd)

---

<div align="center">

**K2 EnerjiPro 3.0.3 — Demo Ready**

Bu proje portföy ve kontrollü demo amacıyla yayımlanmıştır.

</div>
