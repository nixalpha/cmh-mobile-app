# travi

Collect the places you love. Find your next favorite.

travi is an Expo / React Native travel app for iOS, Android, and the web, with Expo Router navigation and a Convex backend.

## Development

```sh
bun install
bunx convex dev
```

Configure `EXPO_PUBLIC_CONVEX_URL` in `.env.local` with your Convex deployment URL, then start the app in another terminal:

```sh
bunx expo start
```

Use `bun run web` for the web app. Native development builds can be created with `bunx eas-cli build --profile development`.

New accounts go through onboarding once: the app reads where your photos were taken (on device, nothing uploaded) to suggest the cities you've visited, then asks for each permission. Completion is stored on the account (`users.onboardedAt`).

While it reads, a 3x3 grid flips through thumbnails of the photos being checked; they are shown from the device and never leave it. Only first-run onboarding scans the camera roll for cities. The **+** on the Places tab opens the same picker without scanning.

The first time you open a city you've visited, the app reads photos taken within 25 km of it. A photo within 300 m of one of the city's landmarks collects that landmark with the photo, dated by the earliest one. Up to 10 of the remaining city photos become one post. Photos are resized and stripped of location data before upload, and hashed asset IDs (`autoPhotoReceipts`) stop the same photo importing twice. The visit's `photosImportedAt` makes this a one-time import per city. All imported landmarks and posts are visible to friends.

The **+** on the Profile tab posts photos from a place you've visited. It shows camera-roll photos taken in that place to choose from, and dates the post from the earliest one (`posted` activities, photos in `postPhotos`).

In development, tap **Dev mode — skip onboarding** on the welcome or sign-in screen (or open `/dev` on web) to go straight to Discover. The shortcut creates a test account for this device/browser, completes its profile, and reuses it on later visits. It uses the configured Convex deployment and the usual authenticated APIs. Sign out from Profile to return to sign-in. The shortcut and `/dev` are disabled in production builds.

### Mock users

`convex/seed.ts` fills a dev deployment with 12 mock travelers for one account (pass its handle). Each gets visits, a ranked list, landmark unlocks (some with photos), saves, feed posts with likes and comments, and a live location. Nine become friends with the account and share their location with it; the last three send it friend requests. A scheduled job moves their locations slightly every 6 hours so they never go stale, and stops once the mock users are gone. It needs the destination catalog imported first.

```sh
bunx convex run seed:run '{"target":"12345"}'
bunx convex run seed:clear '{"target":"12345"}'
```

## Checks

```sh
bun run lint
bun run typecheck
bun run test
```

Routes live in `src/app/`, shared UI in `src/components/`, and backend functions in `convex/`. See [AGENTS.md](AGENTS.md) for project conventions and [the catalog guide](scripts/catalog/README.md) for destination data tooling.

## Brand and press kit

The app uses the official travi artwork, compact header logos, Nunito typography, and the logo’s periwinkle accent.

- [Visual press kit](public/press-kit/index.html) — served at `/press-kit/index.html`.
- [Complete kit ZIP](public/press-kit/travi-press-kit.zip).
- [Brand asset guide](assets/brand/README.md) and [source / extraction prompt](assets/brand/source/README.md).

Rebuild the logo exports, icons, social graphics, and kit on macOS with `sh scripts/branding/build-brand-assets.sh`.

## Find my friends

Open **Discover → Find my friends** (also available from Profile). Open **Sharing and phone notifications** from the People panel to enable location access and choose individual accepted friends who can see your precise location. Sharing is off by default. A friend must separately opt in to share back. Removing or blocking a friend clears both grants; pausing sharing deletes the current location and revokes background device credentials.

Your own position shows on Discover and Find my friends from the device alone (tap the compass), even with sharing off; nothing is uploaded until you share. To share with someone, open them in the People panel and tap **Share my location**. The globe shows shared locations with accuracy and update times. Nearby alerts use a 10 km radius and account for GPS uncertainty. Your visiting city is set from each location update: the device's geocoded city name when it matches a catalog city within 50 km, otherwise the city that owns the nearest landmark within 25 km. City alerts fire for friends in that city. Alerts are limited to one per friend/type/city each day and delivered as phone push notifications. The map has one People view; sharing and notification controls live on a separate settings screen. Locations expire and are deleted after 24 hours without a new update.

Foreground updates work on iOS, Android, and web. The optional **Update while Travi is closed** switch requires background permission in an installed native build; device power management and force-quitting can stop updates. Background tasks use a scoped device credential stored in SecureStore, never a long-lived login token. Signing out stops that device's task and unregisters its push token.

Native changes require a new development build (`bunx eas-cli build --profile development`). Remote push also requires an EAS project ID in `expo.extra.eas.projectId` and APNs/FCM credentials configured for that project. This repository does not currently include that project ID, so push registration reports unavailable until a configured native build is installed. See [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) for the project and credentials steps. Physical-device background and push delivery should be verified in the new build.

**Find friends** can scan your contacts (iOS and Android). Phone numbers are reduced to their last 10 digits and SHA-256 hashed on the device; only hashes reach the server, which matches them against the hash each user saves from their own number. Numbers aren't verified by SMS, so a match is a hint, not proof of identity.

This feature uses locations shared directly in Travi; it does not import Apple Find My data.
