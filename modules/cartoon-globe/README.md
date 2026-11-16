# Embedded cartoon globe

Source: [andrewwbuilds/3d-globe](https://github.com/andrewwbuilds/3d-globe), pulled at commit `12d9ac0` (2026-11-15), including the region-scale water seam fix.

Discover → Map uses the reference Three.js renderer and its globe-to-street controls, locked to cartoon mode. Native uses `react-native-webview`; web uses an iframe. The renderer, worker, and font are bundled in `src/generated/cartoon-globe-html.ts`; no reference dev server is needed. Imagery, terrain, and vector tiles still require internet access. Attribution is displayed inside the map.

## Rebuild

```sh
bun run globe:build
bun run lint
bun run typecheck
bun run test
```

Rebuild after changing the embed, HTML, or vendor sources. Commit the generated HTML module along with those changes so normal Expo builds do not require a separate globe build step.

## Integration files

- `src/embed.ts`: validated place selection / focus / activity bridge and map controls.
- `src/template.html`: map UI, touch targets, and attribution.
- `../../src/components/globe.tsx`: native wrapper, app activity, error handling, and reload.
- `../../src/components/globe.web.tsx`: browser wrapper and message source validation.
- `../../src/lib/globe-bridge.ts`: shared bridge types and validation.

The vendored code differs from upstream in three files: `cartoon/client.ts` embeds its worker; `globe/globe.ts` removes photoreal/export wiring, caps pixel density, projects place pins, pauses rendering, and disposes resources; `globe/terrain.ts` cancels and disposes its tile tree on teardown. Preserve these adaptations when updating the vendor directory. Renderer tests are included in the app's Vitest run.

Manual checks: drag and pinch/scroll zoom, select a place to fly to its cartoon buildings, toggle tilt, reset north, return to world, switch Map/List, navigate away/back, search, and reload after a graphics failure. Native bundle exports verify packaging; rendering and gestures also need an iOS/Android device check.
