# DevOps Lab — Görev Takip API’si

Kodunu test edip konteyner olarak paketleyeceğin, PostgreSQL ile çalıştıracağın ve hataları gözlemleyeceğin bir öğrenme projesi. Uygulama REST API’sidir; görev işlemleri curl veya Postman ile yapılır.

## Hızlı başlangıç

Gerekenler: Node.js 24, npm ve çalışan Docker Desktop / Docker Engine + Compose v2. Compose sürümünün `secrets.environment` ve `up --wait` desteği olmalı.

```bash
npm ci
npm run setup
docker compose --profile monitoring up -d --build --wait
npm run smoke
```

`npm run setup` rastgele parola ve API token’ı üretip `.env` dosyasına yazar. Var olan `.env` dosyasına dokunmaz. Bu dosya Git’e dahil edilmez. Veritabanı volume’ü oluştuktan sonra `.env` içindeki parolayı değiştirmek PostgreSQL kullanıcısının parolasını değiştirmez.

| Adres | İşlev |
| --- | --- |
| http://localhost:3080 | API bilgisi ve sürüm |
| http://localhost:3080/health/live | API süreci çalışıyor mu? |
| http://localhost:3080/health/ready | API veritabanına erişebiliyor mu? |
| http://localhost:9095 | Prometheus sorguları, hedefler ve alarmlar |

Portlar `.env` dosyasında değiştirilebilir. API ve Prometheus yalnızca `127.0.0.1` üzerinde açılır. PostgreSQL varsayılan olarak host’a port açmaz.

## İlk görevini oluştur

Bu komutları proje klasöründe çalıştır. Token terminal çıktısına yazdırılmaz:

```bash
set -a
source .env
set +a

curl -sS "http://localhost:${API_PORT}/tasks" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"İlk CI akışımı çalıştır"}'

curl -sS "http://localhost:${API_PORT}/tasks" \
  -H "Authorization: Bearer $API_TOKEN"
```

Dönen `id` değerini aşağıdaki `TASK_ID` yerine koy:

```bash
curl -sS -X PATCH "http://localhost:${API_PORT}/tasks/TASK_ID" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"completed":true}'

curl -i -X DELETE "http://localhost:${API_PORT}/tasks/TASK_ID" \
  -H "Authorization: Bearer $API_TOKEN"
```

| Metot | Yol | Sonuç |
| --- | --- | --- |
| GET | `/tasks?limit=50&offset=0` | Görev listesi; limit en çok 100 |
| POST | `/tasks` | `{ "title": "..." }` ile oluştur, 201 |
| GET | `/tasks/:id` | Tek görevi oku |
| PATCH | `/tasks/:id` | Başlığı ve/veya `completed` alanını değiştir |
| DELETE | `/tasks/:id` | Görevi sil, 204 |
| GET | `/metrics` | Prometheus metrikleri |

Görev ve metrik uçları `Authorization: Bearer TOKEN` ister. Başlık 1–200 karakter olmalıdır. Hatalar JSON döner: 400 geçersiz girdi, 401 yetkisiz, 404 bulunamadı, 413 büyük istek, 500 sunucu hatası. Hazır olmayan veritabanında readiness 503 döner.

## Nasıl çalışır?

```mermaid
flowchart LR
    Client[curl / Postman] --> API[Node.js API :3080]
    API --> DB[(PostgreSQL)]
    Prom[Prometheus :9095] -->|token ile /metrics| API
    Git[GitHub push / PR] --> Tests[Testler + Docker smoke]
    Tests --> Image[GHCR sürüm imajı]
    Image -->|CD etkinse| Host[Docker sunucusu]
    Host --> Health[Sağlık kontrolü]
    Health -->|başarısızsa| Previous[Önceki imaja dön]
```

API başlangıcında mevcut veriyi koruyan ilk şema oluşturulur. Konteyner root olmayan kullanıcıyla çalışır, dosya sistemi salt okunurdur. PostgreSQL verileri volume’de tutulur. `docker compose down` verileri korur; `down -v` volume’leri ve içlerindeki verileri siler.

## Geliştirme ve test

Yalnızca veritabanını Docker’da, API’yi bilgisayarında çalıştırmak için:

```bash
docker compose stop api
docker compose -f compose.yaml -f compose.dev.yaml up -d --wait db
npm run dev
```

Veritabanı geliştirme modunda `127.0.0.1:5435` adresinden erişilir. `.env` dosyasındaki `DATABASE_URL` bu porta ayarlıdır.

```bash
npm run check
npm test
npm run smoke
```

`npm test` HTTP sözleşmesini, doğrulamayı, token kontrolünü, hata yanıtlarını ve metrikleri test eder. `npm run smoke` çalışan sistemde geçici bir görev oluşturup siler. Gerçek PostgreSQL testi için ayrı test veritabanı kullan:

```bash
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" task_api_test'
set -a
source .env
set +a
TEST_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5435/task_api_test" npm run test:integration
```

Test veritabanı zaten varsa `createdb` adımını atla. Entegrasyon testi kendi UUID’siyle oluşturduğu satırı temizler; diğer satırları silmez.

Çalışan yerel Compose ortamında `npm run test:backup` gerçek bir görevle yedek/restore turunu ve var olan hedefin üzerine yazılmadığını doğrular. Test sonunda kendi görevini, yedeğini ve geçici restore veritabanını temizler.

## İzleme

```bash
docker compose ps
docker compose logs --tail=100 -f api
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

Loglar JSON biçimindedir: istek kimliği, metot, rota, durum kodu ve süre. Token ve görev başlıkları loglanmaz. Metriklerde her UUID için ayrı seri oluşturulmaz.

Prometheus’ta denenecek sorgular:

```promql
up{job="task-api"}
app_database_ready
sum(rate(http_requests_total[5m])) by (status)
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

`monitoring/alerts.yml` üç alarm içerir: API erişilemiyor, veritabanı erişilemiyor, 5xx hata oranı %5’i aşıyor. Durumlar Prometheus **Alerts** ekranında görünür. E-posta/Slack bildirimi için henüz bir alıcı bağlanmadı; sonraki aşamada Alertmanager eklenebilir.

## Yedekleme, geri yükleme ve sürüm geri alma

```bash
bash scripts/backup.sh
bash scripts/restore.sh backups/KOMUTUN_DONDURDUGU_DOSYA devops_restore_drill
```

Yedek, `pg_dump` custom formatındadır. Geri yükleme yalnızca `devops_restore_` önekiyle **yeni** bir veritabanı oluşturur; var olan hedefin üzerine yazmaz ve API’yi otomatik olarak o veritabanına geçirmez. Başarısız bir restore boş bir hedef veritabanı bırakabilir; sonraki denemede yeni bir isim kullan. Gerçek kurtarma geçişi için [operasyon rehberini](docs/operations.md) izle.

Dağıtım ve imaj geri alma:

```bash
bash scripts/deploy.sh ghcr.io/OWNER/REPO@sha256:DIGEST
bash scripts/rollback.sh
```

Dağıtım yeni imajı indirir, servisi başlatır ve readiness kontrolünü bekler. Başarısızsa önceki yerel imaj kimliğiyle yeniden başlatır. Başarılı dağıtımın ardından `rollback.sh` önceki sürüme dönebilir. Bu tek sunuculu akış kısa kesinti içerebilir; veritabanı şemasını geri almaz. Yıkıcı şema değişikliklerinden önce ayrı migration planı gerekir.

## GitHub CI/CD’yi bağla

GitHub deposu: [asdakif/devops-lab](https://github.com/asdakif/devops-lab) (özel). `.github/workflows/ci.yml` şu akışı çalıştırır:

1. PR ve `main` push’larında HTTP + PostgreSQL testleri ve Docker smoke testi.
2. Başarılı `main` çalışmasında GHCR’ye commit etiketiyle imaj yükleme.
3. `DEPLOY_ENABLED=true` ise `production` ortamı üzerinden sunucuya digest ile dağıtım.

Sunucu kurulumu, GitHub değişkenleri ve SSH secret’ları [dağıtım rehberinde](docs/deployment.md). Railway için Dockerfile ve readiness ayarları `railway.toml` dosyasındadır; canlı bağlantı adımları aynı rehberde açıklanır.

## Öğrenme sırası

- [ ] Bir görev oluştur, tamamla ve sil; HTTP durum kodlarını incele.
- [ ] Başlık kuralını değiştir, test ekle, yerelde çalıştır.
- [ ] Konteyneri yeniden başlat ve verinin korunduğunu gör.
- [ ] Pull request açıp başarısız bir testi CI’da gözlemle ve düzelt.
- [ ] Prometheus’ta istek hızını ve gecikmeyi sorgula.
- [ ] `docs/operations.md` ile veritabanı arızası ve yedekten kurtarma denemesi yap.
- [ ] GitHub ve sunucunu bağla; bir sürüm yayımla, önceki sürüme dön.

## Başvurular

- [Docker Compose başlangıç ve sağlık kontrolü sırası](https://docs.docker.com/compose/how-tos/startup-order/)
- [Prometheus alarm kuralları](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Resmî Prometheus Node.js istemcisi](https://github.com/prometheus/client_js)
