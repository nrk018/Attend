# Install Attend Admin (Windows, no Microsoft Store)

Build only after the Android APK talks to the public HTTPS API.

## Production API URL

Copy the example env and set the real host:

```bash
cd apps/admin-desktop
cp .env.production.example .env.production
```

`.env.production`:

```
VITE_API_URL=https://api.builditmuj.club
```

Do not commit `.env.production`.

## Build

```bash
cd apps/admin-desktop
npm run build:electron:prod:win
```

On macOS without Wine this Windows target may fail. Use a Windows PC, or `npm run build:electron:prod` to produce a Mac build for your own test only. College admins get the NSIS `.exe`.

Installer is in `apps/admin-desktop/release/` (NSIS `.exe`).

Share the `.exe` the same way as the APK. Windows SmartScreen may warn because the binary is unsigned: More info → Run anyway.

## Gate

Install on a PC that is **not** running `npm run dev` / local uvicorn. Log in and open the dashboard. If it fails, the `.exe` is still pointed at localhost — rebuild with `VITE_API_URL`.
