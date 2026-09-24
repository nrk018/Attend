# Install Attend on Android (no Play Store)

The app is a normal APK. Teachers do not install Expo Go.

## Before you build

1. Production API gate has passed (cellular `/health`). See [DEPLOYMENT.md](DEPLOYMENT.md).
2. [apps/mobile/eas.json](../apps/mobile/eas.json) already sets `EXPO_PUBLIC_API_URL` to `https://api.builditmuj.club`. Do not change it back to a laptop IP.
3. Keep `android.package` as `club.builditmuj.attend` after the first build.

## Build

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build:configure   # first time only; commit extra.eas.projectId
eas build --platform android --profile preview
```

Download the APK from the Expo build page. Share via Drive, WhatsApp, or the college LMS.

Each new APK: bump `expo.version` and `android.versionCode` in `apps/mobile/app.json`, then rebuild.

## Teacher install

1. Open the APK link on the phone (Chrome).
2. If asked, allow **Install unknown apps** for Chrome or Files.
3. Install. Ignore the “unsafe / not from Play Store” warning for this campus build.
4. Open **Attend** (not Expo Go).
5. Sign in on **cellular** (turn Wi-Fi off once) to confirm it is not using a laptop IP.

## Updates

Send a new APK with the same package name. Install over the old one. There is no auto-update until Play Store.
