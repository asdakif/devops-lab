# Proje sunumu ve demo akışı

[Proje tanıtımı](../README.md) · [Mimari kararlar](architecture.md)

## Kısa proje anlatımı

> DevOps Task API, küçük bir Node.js/PostgreSQL uygulamasının testten canlı dağıtıma kadar olan sürecini kapsayan kişisel projem. GitHub Actions üzerinde HTTP, gerçek veritabanı, Docker smoke ve yedekten geri yükleme kontrolleri bulunuyor. Başarılı GitHub kontrollerinden sonra Railway’de otomatik dağıtım yapılıyor. Yerel ortamda Prometheus metrikleri, alarm kuralları ve kurtarma senaryoları yer alıyor.

## CV / portföy özeti

**DevOps Task API — Node.js, PostgreSQL, Docker, GitHub Actions, Railway, Prometheus**

- HTTP, PostgreSQL entegrasyonu, Docker smoke ve yedek/restore testlerini birleştiren CI akışı.
- Başarılı GitHub kontrollerine bağlı canlı dağıtım; commit SHA ve readiness üzerinden sürüm doğrulaması.
- JSON istek logları, Prometheus metrikleri ve yerel ortam için alarm/kurtarma senaryoları.

Bu anlatım mevcut özelliklere dayanır. Canlı Prometheus, otomatik uzak yedekleme, kullanıcı rolleri ve ölçülmüş hizmet hedefleri sunumda gelecek çalışmalar olarak ele alınabilir.

## Beş dakikalık demo

| Süre | Gösterilecek bölüm | Gösterdiği davranış |
| --- | --- | --- |
| 0:00–0:45 | README mimarisi ve ortam tablosu | Bileşenler ve canlı/yerel kapsam |
| 0:45–1:30 | Başarılı bir GitHub Actions çalışması | Test, paketleme ve hata durumundaki durma noktaları |
| 1:30–2:00 | Canlı `/health/ready` yanıtı ve commit geçmişi | Çalışan sürümün kaynak kodla ilişkilendirilmesi |
| 2:00–3:00 | Yerelde `npm run smoke` | Kimlik doğrulama ve görev CRUD akışı |
| 3:00–4:00 | Yerel Prometheus sorguları | İstek sayısı, gecikme dağılımı ve veritabanı durumu |
| 4:00–5:00 | `npm run test:backup` ve test sonucu | Yedeğin ayrı veritabanına açılması, mevcut hedefin korunması |

Yerel demo öncesi [kurulum rehberini](local-development.md) uygula. Arıza denemelerini canlı ortamda sunum sırasında çalıştırma. Ekran paylaşımında `.env` veya `.env.production` dosyalarını açmadan komutları çalıştır.

## Açıklayabilmen gereken kararlar

1. Veritabanı kapandığında liveness ve readiness neden farklı yanıt verir?
2. Railway hangi GitHub kontrolünü bekler, GHCR imajının rolü nedir?
3. Metriklerde neden görev UUID’si yerine rota şablonu kullanılır?
4. Veritabanı yedeği almak ile geri yüklenebildiğini doğrulamak arasındaki fark nedir?
5. Bir uygulama sürümünü geri almak neden veritabanı şemasını geri almaz?
6. Ortak token yaklaşımı neden çok kullanıcılı bir ürün için yeterli değildir?

Yanıtların dayanağı [mimari kararlar](architecture.md), kod ve testlerdir. Projeyi güçlü biçimde sunmanın yolu, çalışan parçaları göstermek ve sonraki geliştirmeleri gerekçeleriyle açıklamaktır.

## Paylaşım

Depo şu anda özeldir; bağlantıyı paylaşmak tek başına kaynak koda erişim sağlamaz. Görüşme sırasında yetkili hesapla ekran paylaşımı veya ilgili kişiye depo erişimi kullanılabilir. Herkese açık portföy için depo görünürlüğü ayrıca değiştirilmelidir. Canlı sağlık bağlantısı token olmadan incelenebilir; görev uçlarına erişim token gerektirir.
