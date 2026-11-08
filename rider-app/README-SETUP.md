# Rider app — setup

Android-first React Native app for the delivery riders.

## 1. Install

```bash
cd rider-app
npm install
```

Node 22+ is recommended (React Native 0.88 declares it); the TypeScript and Jest
tooling also runs on Node 20 with an `EBADENGINE` warning.

## 2. Point the app at the API

`src/config.ts` holds the single `API_BASE_URL` switch:

- `http://10.0.2.2:4000` — the Android emulator's route to your machine's
  localhost, used automatically in debug builds.
- Release builds use the production constant. Change `DEFAULT_API_BASE_URL` once
  you know the host (Cloudflare Tunnel hostname, or the Render URL).

A rider can also override the address from the login screen (tap the
`Server: …` line). The value is stored on the device, which is how you move a
single handset to a new host without a rebuild.

## 3. Google Maps key

The map on the Add Customer screen needs a Maps SDK for Android key.

1. Create one in Google Cloud → **APIs & Services → Credentials**, enabling
   **Maps SDK for Android**. Restrict it to the app's package name
   (`in.durgeshamlajuice.rider`) and your debug/release signing certificates.
2. Put it in `android/local.properties` (git-ignored):

   ```properties
   MAPS_API_KEY=AIza...
   ```

   Or export `MAPS_API_KEY` in the environment for CI builds.

The build works without a key — the map simply renders blank, while everything
else (including Navigate, which hands off to the Google Maps app) still works.

## 4. Run

```bash
npm start              # Metro
npm run android        # debug build on a device or emulator
```

Release APK:

```bash
cd android && ./gradlew assembleRelease
```

## 5. Permissions

Only foreground location (`ACCESS_FINE_LOCATION`) is requested, at first launch
of the route screen. There is no background location, so no extra Play Store
declaration is needed. The `<queries>` block in the manifest is what lets the
Call and Navigate buttons see the dialler and Google Maps on Android 11+.

## 6. Offline behaviour

- The route and the customer list are cached on the device after every
  successful fetch and shown when a request fails.
- Delivered / Skip / Not home, payments and new customers are appended to a
  persistent queue (`src/store/queue.ts`) and flushed when connectivity returns,
  with deliveries sent in one batch to `POST /deliveries/sync`.
- The sync strip at the top of the route screen tells the rider what has not
  reached the server yet, and lets them retry by hand.
- Logging out clears the session and caches but **not** the queue, so unsent
  work is never lost.

## 7. Tests

```bash
npm test
```

Covers the on-device nearest-first ordering (`src/lib/geo.ts`), which mirrors
`backend/src/domain/geo.ts`. The subscription and route rules are tested in the
backend package.
