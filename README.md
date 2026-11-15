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
