# K2 EnerjiPro Kapsamlı Finansal Test Özeti

- Toplam ana senaryo: **2160**
- PASS: **1512**
- FAIL: **0**
- REVIEW: **648**
- Bloke: **648**
- Çalışma süresi: **238.25 saniye**
- Finansman gün bazı: **365**
- Saat dilimi: **Europe/Istanbul**
- Para toleransı: **0.01 TL**

> Üretim hesaplama formülleri kopyalanmadı veya değiştirilmedi. Sonuçlar doğrudan üretim domain fonksiyonlarından üretildi.

### Müşteri tipine göre

| Değer | PASS | FAIL | REVIEW |
|---|---:|---:|---:|
| cift-terimli-og-mesken | 126 | 0 | 54 |
| cift-terimli-og-sanayi | 126 | 0 | 54 |
| cift-terimli-og-tarimsal-sulama | 126 | 0 | 54 |
| cift-terimli-og-ticarethane | 126 | 0 | 54 |
| tek-terimli-ag-mesken | 126 | 0 | 54 |
| tek-terimli-ag-sanayi | 126 | 0 | 54 |
| tek-terimli-ag-tarimsal-sulama | 126 | 0 | 54 |
| tek-terimli-ag-ticarethane | 126 | 0 | 54 |
| tek-terimli-og-mesken | 126 | 0 | 54 |
| tek-terimli-og-sanayi | 126 | 0 | 54 |
| tek-terimli-og-tarimsal-sulama | 126 | 0 | 54 |
| tek-terimli-og-ticarethane | 126 | 0 | 54 |

### Ödeme planına göre

| Değer | PASS | FAIL | REVIEW |
|---|---:|---:|---:|
| card_installment_settlement | 168 | 0 | 72 |
| card_installment_upfront | 168 | 0 | 72 |
| card_single | 168 | 0 | 72 |
| custom | 168 | 0 | 72 |
| fixed_day | 168 | 0 | 72 |
| full_advance | 168 | 0 | 72 |
| mixed | 168 | 0 | 72 |
| partial_advance_balance | 168 | 0 | 72 |
| standard_deferred | 168 | 0 | 72 |

### Ödeme davranışına göre

| Değer | PASS | FAIL | REVIEW |
|---|---:|---:|---:|
| late_10_days | 324 | 0 | 216 |
| on_time | 540 | 0 | 0 |
| overpay_carry | 324 | 0 | 216 |
| overpay_refund | 324 | 0 | 216 |

### GES moduna göre

| Değer | PASS | FAIL | REVIEW |
|---|---:|---:|---:|
| active_zero | 432 | 0 | 0 |
| excess_120 | 108 | 0 | 324 |
| off | 432 | 0 | 0 |
| self_100 | 108 | 0 | 324 |
| self_30 | 432 | 0 | 0 |

### Ana senaryo hata kuralları

| Kural | Etkilenen senaryo |
|---|---:|

## Sorulara doğrudan cevaplar

| Kural | Soru | Sonuç | Beklenen | Gerçekleşen | Fark | Kanıt senaryoları | Üretim kodu |
|---|---|---:|---|---|---:|---|---|
| PAY-01 | Tam ön ödemede valör oluşuyor mu? | PASS | Gerçek pozitif bakiye günlerinde valör; ilk tahsilat gününde 0. | 12/12 profilde valör oluştu; doğrudan günlük örnekte ilk gün 0.00 TL. | 0.00 TL | cift-terimli-og-sanayi__full_advance__on_time__off<br>cift-terimli-og-sanayi__full_advance__overpay_carry__off<br>cift-terimli-og-sanayi__full_advance__overpay_refund__off<br>cift-terimli-og-sanayi__full_advance__late_10_days__off | src/domain/financing/financing.ts:112-181 |
| PAY-02 | Vadeli planda gerçek tahsilata kadar kredi maliyeti oluşuyor mu? | PASS | Negatif bakiye günlerinde kredi devam eder; tahsilat bakiyeyi azaltır. | 12/12 profilde kredi oluştu; 12/12 müşteri hesabı kapandı. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__on_time__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_carry__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_refund__off<br>cift-terimli-og-sanayi__standard_deferred__late_10_days__off | src/domain/financing/financing.ts:112-181; src/domain/receivables/ledger.ts:96-230 |
| PAY-03 | Kart komisyonu müşteri anaparasını azaltıyor mu? | PASS | 100 TL anapara tamamen kapanır; EPSAŞ net nakdi %2 komisyonla 98 TL olur. | Anapara 100.00 TL, EPSAŞ net nakit 98.00 TL, komisyon 2.00 TL. | 0.00 TL | target-card-epsas-2pct | src/domain/payment-plan/actualPaymentFinancials.ts:33-56 |
| PAY-04 | Müşteri ve EPSAŞ komisyon modelleri ayrılıyor mu? | PASS | EPSAŞ modelinde 2 TL gider; müşteri modelinde 2 TL müşteri kanal ücreti. | EPSAŞ gideri 2.00 TL; müşteri ücreti 2.00 TL. | -2.00 TL | target-card-epsas-2pct<br>target-card-customer-2pct | src/domain/payment-plan/actualPaymentFinancials.ts:33-56 |
| PAY-05 | Taksitli aktarım mükerrer nakit girişi üretiyor mu? | REVIEW | Banka aktarımı anaparayı aşmaz; müşteri kart takvimi ve banka transferi ayrı rollerde izlenir. | Mükerrer nakit kimliği yok; ancak üretim modeli müşteri kart çekim takvimini ayrı olay türü olarak taşımıyor. | 0.00 TL | cift-terimli-og-sanayi__card_installment_upfront__on_time__off<br>cift-terimli-og-sanayi__card_installment_upfront__overpay_carry__off<br>cift-terimli-og-sanayi__card_installment_upfront__overpay_refund__off<br>cift-terimli-og-sanayi__card_installment_upfront__late_10_days__off | src/domain/payment-plan/paymentPlan.ts:34-125; src/types/index.ts:260-284 |
| PAY-06 | Karma ve özel plan tutarları faturaya tam eşit mi? | PASS | Satır toplamı dönem borcuna eşit; negatif veya kuruşluk artık yok. | En büyük dağılım farkı 0.00 TL. | 0.00 TL | cift-terimli-og-sanayi__mixed__on_time__off<br>cift-terimli-og-sanayi__mixed__overpay_carry__off<br>cift-terimli-og-sanayi__mixed__overpay_refund__off<br>cift-terimli-og-sanayi__mixed__late_10_days__off | src/domain/payment-plan/paymentPlan.ts:34-125 |
| FIN-01 | Kredi oranı %49’dan %60’a çıkınca maliyet artıyor mu? | PASS | Negatif bakiye varsa kredi artar ve net kâr düşer; yoksa değişmez. | 70/108 kombinasyonda negatif bakiye etkisi ölçüldü. | 438207.38 TL | cift-terimli-og-sanayi__standard_deferred__financing<br>cift-terimli-og-sanayi__fixed_day__financing<br>cift-terimli-og-sanayi__full_advance__financing<br>cift-terimli-og-sanayi__partial_advance_balance__financing | src/domain/financing/financing.ts:112-181; src/domain/profitability/profitLedger.ts |
| FIN-02 | Valör oranı %40’tan %50’ye çıkınca gelir artıyor mu? | PASS | Pozitif bakiye varsa valör ve net kâr artar; yoksa değişmez. | 84/108 kombinasyonda pozitif bakiye etkisi ölçüldü. | 520824.86 TL | cift-terimli-og-sanayi__standard_deferred__financing<br>cift-terimli-og-sanayi__fixed_day__financing<br>cift-terimli-og-sanayi__full_advance__financing<br>cift-terimli-og-sanayi__partial_advance_balance__financing | src/domain/financing/financing.ts:112-181; src/domain/profitability/profitLedger.ts |
| FIN-03 | Tahsilatın gerçekleştiği ilk gün valör sıfır mı? | PASS | İlk gün 0; sonraki gün pozitif. | 2026-07-10 0.00 TL, 2026-07-11 1.10 TL. | 0.00 TL | fin-same-day-valor | src/domain/financing/financing.ts:151-158 |
| FIN-04 | Cumartesi ve pazar finansman faizi işliyor mu? | PASS | 11 ve 12 Temmuz günlerinde faiz sıfırdan büyük. | Cumartesi 1.34 TL, pazar 1.35 TL. | 2.69 TL | fin-weekend-2026-07-10 | src/domain/financing/financing.ts:112-181 |
| FIN-05 | 15 Temmuz tatilinde faiz işliyor mu? | PASS | İşlem 16 Temmuz’a kayabilir; 15 Temmuz faiz günü atlanmaz. | İş günü düzeltmesi 2026-07-16; 15 Temmuz kredi 1.34 TL. | 1.34 TL | fin-holiday-2026-07-15 | src/domain/calendar/calendar.ts:24-37; src/domain/financing/financing.ts:112-181 |
| FIN-06 | Geç ödemede planlanan tarih ödeme sayılıyor mu? | PASS | Gerçek tahsilata kadar alacak/finansman açık; gerçekleşen ödeme sonunda müşteri hesabı kapanır. | 12/12 kredi; son açık alacak toplamı 0.00 TL. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__late_10_days__off<br>cift-terimli-og-sanayi__fixed_day__late_10_days__off<br>cift-terimli-og-sanayi__full_advance__late_10_days__off<br>cift-terimli-og-sanayi__partial_advance_balance__late_10_days__off | src/domain/receivables/ledger.ts:96-230; src/domain/realization/realization.ts:130-469 |
| GES-Q01 | Öz tüketim ayrı nakit geliri oluşturuyor mu? | PASS | Öz tüketim fiziksel azaltım; nakit tahsilatı değil. | Öz tüketim senaryolarında GES settlement nakdi 0 TL. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__on_time__self_30<br>cift-terimli-og-sanayi__standard_deferred__overpay_carry__self_30<br>cift-terimli-og-sanayi__standard_deferred__overpay_refund__self_30<br>cift-terimli-og-sanayi__standard_deferred__late_10_days__self_30 | src/domain/ges/ges.ts:48-96; src/domain/financing/financing.ts:13-95 |
| GES-Q02 | GES oranı şebeke tüketimini 10/7/0/0 MWh yapıyor mu? | PASS | %0=10, %30=7, %100=0, %120=0 ve negatif tüketim yok. | Beş GES modu 12 aylık üretim sonuçlarıyla karşılaştırıldı. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__on_time__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_carry__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_refund__off<br>cift-terimli-og-sanayi__standard_deferred__late_10_days__off<br>cift-terimli-og-sanayi__standard_deferred__on_time__active_zero | src/domain/ges/ges.ts:48-96 |
| GES-Q03 | %120 GES ihtiyaç fazlası EPSAŞ nakit çıkışı mı? | PASS | Aylık 2 MWh × 3.500 = 7.000 TL; yıllık 84.000 TL çıkış. | Yıllık settlement aralığı 84000.00 TL–84000.00 TL. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__on_time__excess_120<br>cift-terimli-og-sanayi__standard_deferred__overpay_carry__excess_120<br>cift-terimli-og-sanayi__standard_deferred__overpay_refund__excess_120<br>cift-terimli-og-sanayi__standard_deferred__late_10_days__excess_120 | src/domain/ges/ges.ts:35-96; src/domain/financing/financing.ts:13-95 |
| GES-Q04 | 12.000 TL manuel GES sabit vergi/maliyeti yalnız bir kez uygulanıyor mu? | PASS | Yıllık ihtiyaç fazlası alımına tam 12.000 TL eklenir. | 84.000 TL enerji alımına eklenen tutar 12000.00 TL. | 0.00 TL | ges-fixed-cost-12000 | src/domain/ges/ges.ts:84-95; src/domain/invoice/invoice.ts:13-99 |
| GES-Q05 | GES kapalı ile aktif %0 finansal olarak aynı mı? | PASS | Fiziksel, fatura, nakit, finansman ve kâr değerleri aynı. | 108 kapalı/%0 çifti karşılaştırıldı. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__on_time__off<br>cift-terimli-og-sanayi__fixed_day__on_time__off<br>cift-terimli-og-sanayi__full_advance__on_time__off<br>cift-terimli-og-sanayi__partial_advance_balance__on_time__off | src/domain/ges/ges.ts:48-67 |
| TAR-01 | 12 gerçek tarife profili eksiksiz mi? | PASS | 12 profil. | 12 profil. | 0 | cift-terimli-og-sanayi<br>cift-terimli-og-ticarethane<br>cift-terimli-og-mesken<br>cift-terimli-og-tarimsal-sulama<br>tek-terimli-og-sanayi<br>tek-terimli-og-ticarethane<br>tek-terimli-og-mesken<br>tek-terimli-og-tarimsal-sulama<br>tek-terimli-ag-sanayi<br>tek-terimli-ag-ticarethane<br>tek-terimli-ag-mesken<br>tek-terimli-ag-tarimsal-sulama | src/config/tariffs.ts:13-122 |
| TAR-02 | Marj %0 iken aktif enerji 3.900 TL/MWh mı? | PASS | PTF 3.500 + YEKDEM 400 = 3.900 TL/MWh. | 2.160 senaryonun dönemsel aktif enerji tutarları net şebeke tüketimiyle karşılaştırıldı. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__on_time__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_carry__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_refund__off<br>cift-terimli-og-sanayi__standard_deferred__late_10_days__off | src/domain/invoice/invoice.ts:13-99 |
| TAR-03 | BTV yalnız aktif enerji matrahından mı hesaplanıyor? | PASS | Dağıtım BTV matrahına girmez; oran grup bazında %1/%5. | 12/12 profil oranı doğru; 0 ana senaryoda oran/matrah uyumsuzluğu. | 0 | cift-terimli-og-sanayi<br>cift-terimli-og-ticarethane<br>cift-terimli-og-mesken<br>cift-terimli-og-tarimsal-sulama<br>tek-terimli-og-sanayi<br>tek-terimli-og-ticarethane<br>tek-terimli-og-mesken<br>tek-terimli-og-tarimsal-sulama<br>tek-terimli-ag-sanayi<br>tek-terimli-ag-ticarethane<br>tek-terimli-ag-mesken<br>tek-terimli-ag-tarimsal-sulama | src/domain/invoice/invoice.ts:63-66; src/config/tariffs.ts:13-122 |
| TAR-04 | KDV matrahı ve profil oranları beklenen kuralla uyumlu mu? | PASS | Sanayi/Ticarethane %20; Mesken/Tarımsal Sulama %10. | 12/12 profil oranı doğru; 0 ana senaryoda oran uyumsuzluğu. KDV matrah formülü ayrıca doğrulandı. | 0 | cift-terimli-og-sanayi<br>cift-terimli-og-ticarethane<br>cift-terimli-og-mesken<br>cift-terimli-og-tarimsal-sulama<br>tek-terimli-og-sanayi<br>tek-terimli-og-ticarethane<br>tek-terimli-og-mesken<br>tek-terimli-og-tarimsal-sulama<br>tek-terimli-ag-sanayi<br>tek-terimli-ag-ticarethane<br>tek-terimli-ag-mesken<br>tek-terimli-ag-tarimsal-sulama | src/config/tariffs.ts:13-122; src/domain/invoice/invoice.ts:67-69 |
| TAR-05 | AG/OG ve tek/çift terimli dağıtım değerleri gerçekten farklı mı? | PASS | 12 profil kendi dağıtım birim bedelini kullanır. | 12 benzersiz dağıtım değeri. | 0 | cift-terimli-og-sanayi<br>cift-terimli-og-ticarethane<br>cift-terimli-og-mesken<br>cift-terimli-og-tarimsal-sulama | src/config/tariffs.ts:13-122; src/domain/invoice/invoice.ts:61-63 |
| ACC-01 | Fatura, ödeme, nakit ve kâr mutabakatları sıfır mı? | PASS | Dört mutabakat farkı ≤ 0,01 TL. | Fatura=true, ödeme=true, nakit=true, kâr=true. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__on_time__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_carry__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_refund__off<br>cift-terimli-og-sanayi__standard_deferred__late_10_days__off | src/domain/profitability/monthlyProfit.ts; src/domain/profitability/profitLedger.ts |
| ACC-02 | Fazla ödeme satış geliri veya kâr anaparası olarak yazılıyor mu? | PASS | Fazla ödeme müşteri avansı/iade yükümlülüğüdür; enerji geliri değişmez. | 648 uygulanabilir fazla ödeme senaryosunda enerji geliri zamanında ödeme eşleniğiyle aynı; iade tutarı fazla ödemeyle mutabık. | 0.00 TL | cift-terimli-og-sanayi__standard_deferred__overpay_carry__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_refund__off<br>cift-terimli-og-sanayi__standard_deferred__overpay_carry__active_zero<br>cift-terimli-og-sanayi__standard_deferred__overpay_refund__active_zero | src/domain/receivables/ledger.ts:96-230; src/domain/profitability/profitLedger.ts:128-225 |
| TECH-01 | Sonuçlarda NaN veya Infinity var mı? | PASS | 0 geçersiz sayısal değer. | 0 geçersiz sonuç. | 0 |  | src/domain/** |
| TAR-06 | 132 yönlü müşteri tipi geçişinde eski değer kalıyor mu? | PASS | 132 geçiş; hedef KDV/BTV/dağıtım ve hesaplama sonucu yeni profile ait. | 132 satır; 0 FAIL; Playwright UI kanıtı. | 0 | test-results/k2-customer-type-transition-results.csv | src/pages/CostCalculation/CostCalculationPage.tsx:317-427; src/config/tariffs.ts:13-144 |

## Üretim varsayılanları notu

- Sabit Gün şablonu: takip eden ayın **10. günü**.
- Tam Ön Ödeme: dönem başlangıcından **10 gün önce**.
- Kısmi Avans + Kalan: **%80 avans + kalan**.
- Karma Plan: **%30 avans + %40 kart + kalan EFT**.
- Kart şablonlarının varsayılan komisyon oranı: **%0**; `%2` varyant PAY-03/PAY-04 hedefli testinde çalıştırıldı.
- Üretimde genel GES sabit maliyet alanı yoktur; `manualTaxAmountTl` yalnız ihtiyaç fazlası alımının manuel vergi/maliyet bileşeni olarak test edildi.
