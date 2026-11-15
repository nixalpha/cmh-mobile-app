# travi brand assets

Use `BrandLogo` from `src/components/brand-logo.tsx` for the supplied artwork. Full logos stay at 24–28 px high in the app; use the symbol in small placeholders. The text in the tile is the first t in travi, so do not add a typeset t outside it.

- `logo-{color,white,dark}.svg`: scalable outlined logos, no font dependency.
- `mark-{color,white,dark}.svg`: standalone symbol variants.
- `glyph-white.svg`: script t for native icon layers.
- Matching PNGs are optimized for bundled mobile UI.
- `tokens.json`: official periwinkle, wordmark, readable accent text, and neutral colors.
- `source/reference.png`: supplied source, preserved unchanged.
- `source/extracted-master.png`: transparent extraction from the built-in image editing tool.
- `geometry.json`: simplified contours used to render both SVG and PNG assets consistently.

Nunito is the closest rounded UI companion to the supplied custom wordmark. It replaces the previous font across text and form fields. The script t stays as artwork. Periwinkle `#909DC3` is the button/selected-state fill, paired with ink foregrounds. The deeper `#57648E` supports readable text links.

Run from the repo root on macOS:

```sh
sh scripts/branding/build-brand-assets.sh
```

This regenerates app icons, splash artwork, logo exports, social graphics, and `public/press-kit/travi-press-kit.zip`. It uses the checked-in master, Core Graphics, and the installed Nunito font package; it makes no AI or network calls.

The complete kit is served at `/press-kit/index.html`. See `source/README.md` for the extraction prompt and provenance.
