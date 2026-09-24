# Attend – Production deployment

Hosting: a VPS (DigitalOcean / Hetzner / Lightsail) + Docker + nginx + Let’s Encrypt.
Phones and the Windows admin app talk to **`https://api.builditmuj.club`**. Supabase stays in the cloud.

DNS for **builditmuj.club**: [BUY_AND_DNS.md](BUY_AND_DNS.md).

## Backend (production)

On the VPS, as root (or a docker-capable user):

```bash
git clone <repo-url> /opt/attend && cd /opt/attend

cp deploy/attend.env.example deploy/attend.env
# ATTEND_API_HOST=api.builditmuj.club (already in the example)
# CERTBOT_EMAIL=an inbox you can read

cp apps/backend/.env.example apps/backend/.env
# fill SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET (same as local)
# APP_BASE_URL=https://api.builditmuj.club
# FACE_EXECUTION_PROVIDER=cpu
# DEBUG=false
# CORS_ORIGINS=null
# RESEND_FROM_EMAIL="Attend <noreply@buildit.club>"

chmod +x scripts/vps-up.sh scripts/vps-issue-cert.sh scripts/verify-production.sh

./scripts/vps-up.sh
./scripts/vps-issue-cert.sh
./scripts/verify-production.sh https://api.builditmuj.club
```

**Gate (phone, Wi-Fi off / cellular):**

1. `https://api.builditmuj.club/health` → `{"status":"ok"}`
2. `https://api.builditmuj.club/docs` loads
3. Login with an existing teacher
4. One enroll or recognize photo

Do not build the Android APK until this gate passes.

nginx allows 25 MB uploads and 120 s proxy timeouts. Port 8000 is not published; only 80/443.

Renew certificates (cron monthly):

```bash
cd /opt/attend
docker compose --env-file deploy/attend.env -f docker-compose.prod.yml run --rm certbot renew
docker compose --env-file deploy/attend.env -f docker-compose.prod.yml exec nginx nginx -s reload
```

## GPU (optional later)

If CPU recognition is too slow, use [apps/backend/Dockerfile.gpu](../apps/backend/Dockerfile.gpu) on a GPU VPS with `FACE_EXECUTION_PROVIDER=cuda`.

## Mobile (Android APK, no Play Store)

See [install-android.md](install-android.md). `eas.json` already points at `https://api.builditmuj.club`.

```bash
cd apps/mobile
eas login
eas build --platform android --profile preview
```

## iOS (TestFlight)

See [install-ios.md](install-ios.md). Requires Apple Developer Program.

## Student registration site

1. Apply `apps/backend/migrations/004_student_roster_enrollment.sql` in the Supabase SQL Editor.
2. Set `STUDENT_WEB_URL=https://register.builditmuj.club` on the API.
3. Build and copy the static app:

```bash
npm run build --workspace=student-web
# copy apps/student-web/dist to /var/www/student-web
```

4. Use [deploy/nginx/student-web.conf](../deploy/nginx/student-web.conf) and add the origin to `CORS_ORIGINS`.

## Admin desktop (Windows)

See [install-desktop.md](install-desktop.md).

```bash
cd apps/admin-desktop
cp .env.production.example .env.production
npm run build:electron:prod:win
```
