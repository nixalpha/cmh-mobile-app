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

In development, tap **Dev mode — skip onboarding** on the welcome or sign-in screen (or open `/dev` on web) to go straight to Discover. The shortcut creates a test account for this device/browser, completes its profile, and reuses it on later visits. It uses the configured Convex deployment and the usual authenticated APIs. Sign out from Profile to return to sign-in. The shortcut and `/dev` are disabled in production builds.

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

Open **Discover → Find my friends** (also available from Profile). In **Sharing**, enable location access and choose individual accepted friends who can see your precise location. Sharing is off by default. A friend must separately opt in to share back. Removing or blocking a friend clears both grants; pausing sharing deletes the current location and revokes background device credentials.

The globe shows shared locations with accuracy and update times. Nearby alerts use a 10 km radius and account for GPS uncertainty. Choose a visiting city for city alerts (25 km from its center, or up to 50 km when the device's geocoded city and country match). Alerts are limited to one per friend/type/city each day, appear in-app, and can also arrive via push. Locations expire and are deleted after 24 hours without a new update.

Foreground updates work on iOS, Android, and web. The optional **Update while Travi is closed** switch requires background permission in an installed native build; device power management and force-quitting can stop updates. Background tasks use a scoped device credential stored in SecureStore, never a long-lived login token. Signing out stops that device's task and unregisters its push token.

Native changes require a new development build (`bunx eas-cli build --profile development`). Remote push also requires an EAS project ID in `expo.extra.eas.projectId` and APNs/FCM credentials configured for that project. This repository does not currently include that project ID, so push registration reports unavailable while in-app alerts remain usable. See [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) for the project and credentials steps. Physical-device background and push delivery should be verified in the new build.

This feature uses locations shared directly in Travi; it does not import Apple Find My data.
