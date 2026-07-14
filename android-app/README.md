# STS GeoFlow Android

This Capacitor app packages the existing GeoFlow field workspace for Android phones and tablets. The field interface and current workflow are shared with `geologger/field.html`; data stays on the device while offline and syncs directly to the Cloudflare Worker when connectivity returns.

## Development

```powershell
cd android-app
npm install
npm run android:sync
npm run android:open
```

After changing the field app, refresh the Android project with:

```powershell
npm run android:sync
```

Regenerate the checked-in Android launcher and splash resources after recreating the native project:

```powershell
npm run android:assets
```

Create a debug APK from a machine with Android Studio, JDK 21, and the Android SDK installed:

```powershell
npm run android:debug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Cloudflare sync

The native app uses `https://autosoillogger.poreddyjeevanreddy.workers.dev/api/v1/geologger/logs`. It does not use Vercel or a separate mobile backend. The Worker permits the Capacitor local origin and continues to serve the web app from the same deployment.
