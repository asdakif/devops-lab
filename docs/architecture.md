# Mimari kararlar

[Proje tanıtımı](../README.md) · [Dağıtım](deployment.md) · [Operasyon](operations.md)

Bu belge mevcut uygulamanın kararlarını, sonuçlarını ve sınırlarını açıklar. Performans veya erişilebilirlik için ölçülmemiş sonuçlar ileri sürmez.

## Küçük uygulama alanı, tek API

Görev CRUD işlemleri, veri yazma/okuma ve doğrulama davranışlarını göstermek için yeterli bir alan sağlar. Express HTTP katmanını, `pg` ise PostgreSQL bağlantı havuzunu yönetir. Ayrı servisler gerektiren bir iş ihtiyacı olmadığı için uygulama tek API sürecidir.

Sonuç: log, healthcheck, test ve dağıtım akışı az sayıda bileşen üzerinden izlenebilir. Mikroservis iletişimi veya dağıtık işlem yönetimi bu projede uygulanmaz.

## Dockerfile ortak, ortam ayarları ayrı

Yerel geliştirme, CI ve Railway aynı Dockerfile’ı kullanır. Üretim imajına geliştirme bağımlılıkları alınmaz ve uygulama root olmayan kullanıcıyla çalışır.

Compose; bağımlılık sırasını, yerel portları, salt okunur API dosya sistemini ve volume’leri tanımlar. Railway kaynak kodu ayrı build eder ve API ile PostgreSQL’i ayrı servisler olarak çalıştırır. Compose’un ek çalışma zamanı kısıtları Railway’e aktarılmış kabul edilmez. Yerelde PostgreSQL 17, canlıda provision edilen PostgreSQL 18 kullanılır; sürüm eşitleme yol haritasındadır.

## CI ve canlı dağıtımın ayrılması

GitHub Actions önce HTTP testlerini ve gerçek PostgreSQL entegrasyonunu çalıştırır. Ardından Compose ortamını başlatır, smoke/yedek testlerini ve Prometheus kural kontrolünü yürütür. Başarılı `main` çalışması GHCR imajını commit SHA etiketiyle yayımlar.

Railway’in GitHub bağlantısındaki `checkSuites` ayarı başarılı kontrolleri bekler. Kaynak build sonrası `/health/ready` kullanılır. GHCR imajı ile Railway’in kendi oluşturduğu imajın aynı digest’e sahip olduğu iddia edilmez. İlişki, kaynak commit üzerinden izlenir; API sağlık yanıtı bu SHA değerini döndürür.

Alternatif SSH dağıtım işi varsayılan olarak kapalıdır. Linux/Compose betikleri yeni imajın sağlık kontrolü başarısızsa önceki imajı yeniden çalıştırmayı dener. Bu davranış Railway için bir rollback garantisi değildir; Compose rollback betikleri CI’da uçtan uca test edilmez.

## Liveness ve readiness

`/health/live` API sürecinin yanıt verebildiğini gösterir. `/health/ready` veritabanına `SELECT 1` gönderir. Veritabanı bağlantısı kesildiğinde çalışan süreç liveness için 200, readiness için 503 dönebilir.

Bu ayrım, süreç arızasını bağımlılık arızasından ayırmaya yardımcı olur. Readiness tablonun bütünlüğünü veya iş verisinin doğruluğunu kapsamlı olarak denetlemez. Docker healthcheck tek başına çalışan fakat sağlıksız bir konteyneri yeniden başlatmaz.

## Log ve metrik tasarımı

İstek loglarında UUID biçiminde bir istek kimliği, HTTP metodu, rota şablonu, durum kodu ve süre bulunur. Görev başlıkları ve Authorization başlığı loglanmaz.

Prometheus etiketinde `/tasks/:id` kullanılması her görevin ayrı zaman serisi üretmesini engeller. Veritabanı erişilebilirliği scrape sırasında ölçülür. Yerel Prometheus, API’ye token ile bağlanır. Alarmlar Prometheus ekranında değerlendirilebilir; Alertmanager ve dış bildirim kanalı kurulmamıştır.

## Kimlik doğrulama

Görev ve metrik uçları ortak Bearer token ile korunur. Bu, sınırlı bir demo/operatör kullanımı için basit bir erişim kontrolüdür. Token’a sahip istemciler aynı görev kümesine erişir; kullanıcı izolasyonu, rol yönetimi, token yaşam döngüsü ve rate limiting ayrı geliştirme konularıdır.

## Şema ve kurtarma

İlk tablo `CREATE TABLE IF NOT EXISTS` ile oluşturulur. Yeniden başlatmalar mevcut satırları korur; ancak bu yöntem sonraki şema değişiklikleri için sürümlü migration sisteminin yerini tutmaz.

Restore betiği sadece yeni ve belirli önekli bir veritabanına yazar. Böylece kurtarılan veri incelenirken mevcut API veritabanı korunur. Test, gerçek bir görevin geri yüklendiğini ve mevcut restore hedefinin üzerine yazılmadığını doğrular. Yedeğin ayrı bir makinede saklanması ve zamanlanması henüz bu akışa dahil değildir.
