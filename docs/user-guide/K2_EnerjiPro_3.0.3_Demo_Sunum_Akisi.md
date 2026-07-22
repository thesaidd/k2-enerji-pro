# K2 EnerjiPro 3.0.3 — Demo Sunum Akışı

Bu senaryo 10–15 dakikalık yönetici ve uzman demosu içindir. Sunuma başlamadan önce kontrollü demo veri setini yükleyin ve tarayıcı yakınlaştırmasını %100 yapın.

| Süre | Ekran | Yapılacak işlem | Anlatılacak mesaj |
|---:|---|---|---|
| 0:00–0:45 | Gösterge Paneli | Portföy kartlarını gösterin | “Teklif, nakit ve kârlılık aynı hikâyede; fakat planlanan ile gerçekleşen ayrıdır.” |
| 0:45–1:30 | Müşteriler | Üç demo müşteriyi gösterin | “Her müşteri teklif geçmişi ve kategori bilgisiyle yerel olarak saklanır.” |
| 1:30–3:00 | Teklif Detayı | Demo Standart Vadeli’yi açın | “Bu iki aylı teklif, oluşturulduğu andaki fiyat ve tarifeyi değiştirilemez kopya olarak saklar.” |
| 3:00–4:00 | Teklif Detayı / Ayarlar | PTF/YEKDEM ve tarife kaynağını gösterin | “Her ay kendi fiyatını; her dönem kendi geçerli tarifesini kullanır.” |
| 4:00–5:15 | Maliyet Hesaplama | Ödeme planı şablonlarını açın | “Vade, avans, kart, taksit ve karma plan nakdin zamanını belirler.” |
| 5:15–6:15 | Teklif Detayı | Kredi/valör kartını gösterin | “Tedarikçiye ödeme ile müşteriden tahsilat arasındaki fark günlük finansman sonucuna dönüşür.” |
| 6:15–7:45 | Gerçekleşme | Demo senaryoyu açın | “Gerçek fiyat, tüketim ve tahsilatlar kaynak teklife dokunmadan ayrı senaryoda izlenir.” |
| 7:45–8:45 | Gerçekleşme | Gerçek tahsilat ve gecikme alanını gösterin | “Kısmi ödeme kalan anaparayı segmentlere ayırır; gecikme 360 gün basit faizdir.” |
| 8:45–10:00 | Ödeme Takvimi | Hareket günlerine geçin | “Takvim yeni formül kurmaz; kayıtlı hesaplama sonuçlarını gün gün gösterir.” |
| 10:00–11:00 | Aylık Kâr | Planlanan + gerçekleşen seçin | “Tahakkuk ekonomik aya, nakit paranın hareket ettiği aya aittir.” |
| 11:00–12:00 | Raporlar | Müşteri raporunu seçin | “Müşteri çıktısında iç net kâr ve finansman ayrıntıları bulunmaz.” |
| 12:00–13:00 | Raporlar | İç Finansal Analiz’e geçin | “İç rapor net kâr, kredi, valör, ledger ve override kaynağını gösterir.” |
| 13:00–14:00 | Ayarlar | Backup bölümünü gösterin | “Veriler yereldir; bu nedenle yedek ve restore önizlemesi kritik güvenlik adımıdır.” |
| 14:00–15:00 | Ayarlar | Demo sınırlarını gösterin | “Backend, canlı EPİAŞ, e-fatura ve saatlik GES bu demo kapsamının dışındadır.” |

## Sunum konuşma metni

### 1. Açılış

“K2 EnerjiPro, enerji teklifini yalnız fiyat olarak değil, tedarikçi ödemeleri, müşteri tahsilatları ve finansman zamanıyla birlikte ele alıyor. Bu demo resmî fatura sistemi değildir; karar desteği için yerel bir çalışma alanıdır.”

### 2. Müşteri ve teklif

“Demo portföyünde sanayi, ticarethane ve GES örnekleri var. Demo Standart Vadeli iki aylı bir teklif. PTF ve YEKDEM ay bazında, tarife ise geçerlilik tarihine göre çözülüyor. Nihai teklif oluştuğunda bu değerler snapshot’a dönüşüyor; sonraki ayar değişikliği eski teklifi değiştirmiyor.”

### 3. Ödeme ve finansman

“Faturanın tutarı kadar tahsilatın tarihi de önemlidir. Standart vade, avans, kart veya karma plan seçtiğimizde günlük bakiye değişiyor. Bakiye negatifse kredi, pozitifse valör 365 gün esasıyla günlük bileşik çalışıyor.”

### 4. Gerçekleşme ve gecikme

“Gerçekleşmede kaynak teklif sabit kalıyor. Gerçek fiyatları, tüketimi ve tahsilatları ayrı bir senaryoda giriyoruz. Bu demo senaryoda gecikmeli ve kısmi tahsilat var. Sistem kalan ana parayı segmentlere ayırıyor, aylık %5,55 oranı 360 gün basit faizle uyguluyor ve ana faturanın KDV oranını kullanıyor.”

### 5. Takvim ve aylık kâr

“Takvimde her tedarikçi çıkışı, müşteri tahsilatı ve faiz günü görülebiliyor. Aylık Kâr ekranında tahakkuk ve nakdi ayırıyoruz: satışın ekonomik ayı ile paranın kasaya girdiği ay aynı olmak zorunda değil.”

### 6. Rapor ve backup

“Müşteri raporu iç finansal bilgileri dışarı çıkarmaz. İç analiz ise net kâr, kredi, valör, profit ledger ve tarife kaynağını gösterir. Tüm veriler IndexedDB’de yerel tutulduğu için sunum sonunda tam yedek alıyoruz; restore öncesinde kayıt sayılarını mutlaka önizliyoruz.”

## Sunum öncesi kontrol listesi

- [ ] Demo veri seti yüklendi.
- [ ] `v3.0.3` ve policy bilgisi görünüyor.
- [ ] Demo Standart Vadeli teklifi açılıyor.
- [ ] Demo gerçekleşme senaryosu açılıyor.
- [ ] Ödeme takvimi hareket günlerini gösteriyor.
- [ ] Müşteri ve iç rapor arasında geçiş yapılabiliyor.
- [ ] Backup alanı erişilebilir.
- [ ] Gerçek müşteri veya gizli veri görünmüyor.
