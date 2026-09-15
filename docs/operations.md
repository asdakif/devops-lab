# Operasyon alıştırmaları

Bu alıştırmaları yerel öğrenme ortamında yap. Uzak ortamda kullanıcı trafiği varsa kesintiyi ayrıca planla.

## 1. Veritabanı arızasını tanı

```bash
docker compose stop db
curl -i http://localhost:3080/health/live
curl -i http://localhost:3080/health/ready
```

Beklenen: liveness 200, readiness 503. Prometheus scrape çalışmaya devam ettiği için `app_database_ready` sıfıra iner. Yaklaşık 1–1,5 dakika sonra `DatabaseUnavailable` alarmı firing olur.

```bash
docker compose start db
curl -i http://localhost:3080/health/ready
```

Veritabanı hazır olduğunda readiness 200’e, sonraki scrape’te metrik 1’e döner. Docker’ın `unhealthy` durumu çalışan konteyneri tek başına yeniden başlatmaz; `restart: unless-stopped` süreç çıktığında devreye girer. Sağlık kontrolü, dağıtım betiğinin yeni sürümü kabul etmesini belirler.

## 2. API arızasını gözlemle

```bash
docker compose stop api
```

Bir dakikalık alarm süresi ve scrape aralığı sonrasında `ApiDown` firing olmalı. Ardından:

```bash
docker compose start api
npm run smoke
```

## 3. Verinin kalıcılığını doğrula

README komutuyla bir görev oluştur, ID’sini kaydet. `docker compose restart api db` çalıştır. Servisler hazır olduğunda aynı ID’yi sorgula; başlık ve tamamlanma bilgisi korunmalı.

## 4. Yedek gerçekten açılıyor mu?

1. Bilinen başlıklı bir görev oluştur ve ID’sini kaydet.
2. `bash scripts/backup.sh` çalıştır; çıktıdaki yolu not et.
3. `bash scripts/restore.sh backups/DOSYA devops_restore_drill` çalıştır.
4. Geri yüklenen veritabanında kaydını kontrol et:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d devops_restore_drill -c "SELECT id, title, completed FROM tasks"'
```

Uygulamanın bağlantısı değiştirilmediği için asıl veritabanı çalışmaya devam eder. Yedekler bilgisayarındaki `backups/` klasöründedir; bu tek başına disk kaybına karşı koruma sağlamaz. İleri aşamada şifreli uzak depolama, zamanlanmış yedek ve saklama süresi ekle.

Gerçek bir kurtarma için önce yazmaları durdur, yeni veritabanında satırları doğrula, `.env` içindeki `POSTGRES_DB` değerini yeni veritabanının adıyla değiştir ve API’yi `docker compose up -d --no-build --wait api` ile yeniden oluştur. Uzak ortamda buna kayıtlı `API_IMAGE` değerini de geçir. `npm run dev` kullanıyorsan ayrıca `DATABASE_URL` içindeki veritabanı adını değiştir. Eski veritabanını doğrulama tamamlanana kadar koru. Kimlik bilgilerini değiştirme.

## 5. Hatalı sürümden dön

İki farklı imaj sürümünü sırasıyla `scripts/deploy.sh` ile dağıttıktan sonra `bash scripts/rollback.sh` çalıştır. `/health/live` yanıtındaki `version` alanı önceki commit’e dönmeli. API smoke testini tekrar çalıştır. Bu işlem veritabanı içeriğini geri almaz.

## Sık karşılaşılan sorunlar

| Belirti | Kontrol |
| --- | --- |
| Docker daemon’a bağlanılamıyor | Docker Desktop açık mı? `docker info` |
| Port kullanımda | `.env` içindeki API/PROMETHEUS portunu değiştir |
| API 401 döndürüyor | `.env` içindeki `API_TOKEN` ile Bearer başlığı aynı mı? |
| API başlarken kapanıyor | `docker compose logs --tail=50 api db` |
| PostgreSQL parola hatası | Var olan volume’ün parolası ile `.env` eşleşiyor mu? |
| Prometheus hedefi down | API sağlıklı mı, token secret’ı güncel mi? |
| Sunucu imajı indiremiyor | GHCR paket erişimi ve sunucudaki Docker login |
| Restore hedefi zaten var | Yeni `devops_restore_...` adı kullan |

Loglar token ve veritabanı bağlantı dizesi içermez. Yapılandırmayı incelerken `.env` veya `docker compose config` çıktısını herkese açık issue’lara yapıştırma.
