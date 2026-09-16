# GitHub ve sunucu bağlantısı

[Proje tanıtımı](../README.md) · [Mimari kararlar](architecture.md) · [Yerel geliştirme](local-development.md)

GitHub deposu: [asdakif/devops-lab](https://github.com/asdakif/devops-lab) (özel).

## Railway ile dağıtım

Canlı API: [task-api-production-f53c.up.railway.app](https://task-api-production-f53c.up.railway.app)

Railway projesi: [devops-lab](https://railway.com/project/f15e3b08-abf4-4d86-9e58-6a9d26e599ec), ortam: `production`. API: `task-api`, veritabanı: `Postgres`. Railway’de API ve PostgreSQL ayrı servislerdir; yerel Compose dosyası otomatik olarak dağıtılmaz.

API mevcut Dockerfile ile build alır ve `/health/ready` yanıtını dağıtım sağlık kontrolü olarak kullanır. Servis ayarları ve CI bekleme koşulu `infra/` altında Railway API isteği olarak saklanır. Bu dosyalar mevcut servisi hedefler; proje veya veritabanını yeniden oluşturmaz. Oturum açtıktan sonra ayarları tekrar uygulamak için:

```bash
railway api --file infra/railway-production.graphql --variables @infra/railway-production.json
```

Bu ayar dosyaları mevcut servis ve ortam kimliklerini içerir. Başka bir Railway projesinde kullanılacaksa hedef kimlikler o projeden alınmalıdır. API token’ı ve veritabanı kimlik bilgileri dosyalara dahil değildir.

Canlı smoke testi (yalnızca bu bilgisayarda oluşturulan ve Git’e dahil edilmeyen `.env.production` ile):

```bash
node --env-file=.env.production scripts/smoke.mjs
```

`.env.production` canlı API token’ını ve adresini içerir. Bu dosyayı paylaşma veya GitHub’a gönderme. Başka bir makinede test için Railway’deki API token’ını güvenli biçimde yerel ortamına tanımla.

Yeni bir ortam kurmak için izlenen adımlar:

1. Railway hesabına giriş yap ve bu proje için proje/production ortamını seç.
2. PostgreSQL servisi oluştur, API servisindeki `DATABASE_URL` değişkenini bu servisin özel bağlantısına referansla: `${{Postgres.DATABASE_URL}}`.
3. API’ye en az 24 karakterlik, yerelden ayrı rastgele `API_TOKEN` ve `PORT=3000` tanımla.
4. API kaynağını `asdakif/devops-lab`, dalını `main` olarak bağla. Railway GitHub entegrasyonuna bu özel depo için erişim ver.
5. GitHub CI başarılı olmadan dağıtım başlamaması için **Wait for CI** ayarını etkinleştir.
6. Railway alan adını 3000 portuna bağla. Canlı `/health/ready` ve token ile CRUD/smoke testini doğrula.

Bu yolda GitHub’daki SSH `DEPLOY_ENABLED` değişkenini etkinleştirme; otomatik dağıtımı Railway GitHub bağlantısı yürütür. GHCR imajı ayrıca sürüm çıktısı olarak üretilir. Railway dağıtımları ve geri dönüşleri Railway panelinden yönetilir; `scripts/deploy.sh` ve `rollback.sh` aşağıdaki Linux/Compose yöntemi içindir. Prometheus ve yedekleme betikleri şu anda yerel Compose ortamına bağlıdır; Railway’de ayrıca kurulmaları gerekir.

Kaynak: [Railway GitHub otomatik dağıtımları](https://docs.railway.com/deployments/github-autodeploys), [Railway API](https://docs.railway.com/api).

## Linux sunucusu ile dağıtım

Yereldeki proje çalışır durumdayken bu rehberle uzak dağıtımı etkinleştir. Gerekenler: kendi GitHub depon, Docker Engine + Compose v2 kurulu bir Linux sunucusu ve SSH erişimi. İlk pipeline varsayılan olarak Linux amd64 imajı üretir; ARM sunucu için build workflow’una `platforms: linux/arm64` veya çoklu mimari yapılandırması ekle.

### Sunucuyu hazırla

1. Dağıtım kullanıcısı için `/opt/devops-task-api` klasörünü oluştur ve yazma izni ver.
2. Kullanıcının Docker çalıştırabildiğini doğrula. Docker erişiminin host üzerinde geniş yetki verdiğini hesaba katarak bu iş için ayrı kullanıcı kullan.
3. Projeyi bu klasöre kopyala. `.env` dosyasını sunucuda `node scripts/setup.mjs` ile üret (Node.js 24 gerekir). Bilgisayarındaki kimlik bilgileri sunucuya taşınmak zorunda değildir.
4. GHCR paketi private ise sunucudaki dağıtım kullanıcısı altında `docker login ghcr.io` ile yalnızca paket okuma yetkili kimlik bilgilerini tanımla. Public paketlerde giriş gerekmez.
5. API portu varsayılan olarak localhost:3080 üzerindedir. İnternete açmak için sunucudaki HTTPS reverse proxy’yi bu porta yönlendir. Prometheus’u yerel veya SSH tüneli üzerinden kullan.

SSH tüneliyle sunucudaki API’ye erişim örneği:

```bash
ssh -L 3080:127.0.0.1:3080 -L 9095:127.0.0.1:9095 USER@HOST
```

### GitHub ayarları

Repo **Settings → Environments** altında `production` oluştur. İstersen bu ortam için reviewer zorunluluğu ekle.

| Ayar | Tür | Değer |
| --- | --- | --- |
| `DEPLOY_ENABLED` | Repository Actions variable | Hazır olduğunda `true` |
| `DEPLOY_HOST` | production environment secret | Sunucu DNS adı veya IPv4; port ekleme |
| `DEPLOY_USER` | production environment secret | SSH kullanıcısı |
| `DEPLOY_SSH_KEY` | production environment secret | Bu kullanıcıya ait private key |
| `DEPLOY_KNOWN_HOSTS` | production environment secret | Doğrulanmış sunucu SSH host key satırı |

SSH 22 portu kullanılır. `DEPLOY_KNOWN_HOSTS` içeriğini sunucu sağlayıcısındaki veya konsolundaki fingerprint ile doğrula. Workflow host key kontrolünü kapatmaz. Uygulama token’ı ve veritabanı parolası sunucudaki `.env` dosyasında kalır.

### İlk sürüm

Kendi GitHub deponu remote olarak tanımlayıp `main` dalına gönder. Testler geçince GHCR paketi oluşur; dağıtım etkinse imaj digest’i sunucuya iletilir. `.env`, veriler ve önceki imaj bilgisi sunucuda korunur.

İlk API dağıtımından sonra sunucuda Prometheus’u başlat:

```bash
cd /opt/devops-task-api
API_IMAGE="$(cat .deploy-state/current-image)" docker compose --profile monitoring up -d --no-build --wait
```

İzleyen dağıtımlar API’yi yeniler. Prometheus yapılandırmasını değiştirdiğinde `docker compose restart prometheus` ile yeniden yükle.

Başarılı bir dağıtımı kontrol et:

```bash
curl -fsS http://127.0.0.1:3080/health/ready
docker compose ps
docker compose logs --tail=30 api
node scripts/smoke.mjs
```

Workflow başarısız olursa GitHub loglarından test, paketleme veya SSH/health-check aşamasını ayır. Uygulama sağlığı bozuksa `deploy.sh` önceki imajı çalıştırmayı dener ve CI’ı başarısız bırakır; önceki imajın da sağlıklı olacağı varsayılmaz.

### Geri dön

```bash
cd /opt/devops-task-api
bash scripts/rollback.sh
```

Önceki imaj rollback için yerelde tutulmalıdır; doğrulamadan `docker image prune -a` çalıştırma. Sunucuda doğrudan `docker compose up` kullanırken kayıtlı imajı `API_IMAGE` olarak geçir; aksi halde Compose varsayılan yerel geliştirme imajını seçer. İlk migration yalnızca tablo oluşturur. Gelecekteki şema değişikliklerinde eski ve yeni uygulama sürümlerinin aynı şemayla çalışabilmesini planla.
