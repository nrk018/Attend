# Install Attend on iOS (TestFlight, no public App Store)

iOS will not sideload an APK-style file for other people. You need the **Apple Developer Program** (~$99/year).

Until that account is approved, ship Android only.

## Accounts

1. Enroll at https://developer.apple.com/programs/
2. In App Store Connect, create app **Attend** with bundle id `club.builditmuj.attend`
3. `eas login` (same Expo account as Android)

## Build and submit

Set `EXPO_PUBLIC_API_URL` in [apps/mobile/eas.json](../apps/mobile/eas.json) `preview-ios` is already `https://api.builditmuj.club`.

```bash
cd apps/mobile
eas credentials   # let EAS manage the iOS distribution cert + profile
eas build --platform ios --profile preview-ios
eas submit --platform ios --profile preview-ios
```

Add testers by email in App Store Connect → TestFlight. They install the **TestFlight** app, then Attend.

## Gate

A second iPhone (not the developer’s) installs from TestFlight and logs in with **Wi-Fi off**.
