# Place catalog pipeline

Builds the destination and landmark catalog from open data and loads it into Convex.

```bash
bun run catalog:build              # writes scripts/catalog/out/*.jsonl and report.md
bun run catalog:load               # upserts into the deployment in EXPO_PUBLIC_CONVEX_URL
bun run catalog:load -- --retire   # also retires places the new build dropped
bun run catalog:load -- --max-tier=2
```

`catalog:load` needs `CONVEX_DEPLOY_KEY` and `EXPO_PUBLIC_CONVEX_URL` (or `CONVEX_URL`). The build needs `unzip`, `bzcat`, `curl`, and `awk` on the path, and the first run takes 10 to 20 minutes because it streams a pageview dump. Downloads and query results are cached in `scripts/catalog/.cache`; delete that folder to refresh from the sources.

## Sources

| Source | Used for | Licence |
| --- | --- | --- |
| GeoNames `cities15000` | Cities over 15,000 people: coordinates, population, alternate names | CC BY 4.0, credit GeoNames in the app |
| Wikidata, through the QLever SPARQL endpoint | Canonical IDs, landmark candidates and their classes, sitelink counts, UNESCO status | CC0 |
| English Wikivoyage dump | Which places are travel destinations, their type, which city a district belongs to, and the Wikidata IDs of "See" listings. No article text is copied | CC BY-SA |
| Wikimedia Commons API | One landscape photo per destination: a 1280px thumbnail URL, its size, author, and licence. The app hotlinks the thumbnail and shows the credit on the place screen | Per file, mostly CC BY, CC BY-SA, or public domain |
| Wikimedia monthly pageview dump | Last month's English Wikivoyage and English Wikipedia views per destination. The dump is several GB and is streamed, not stored. `PAGEVIEWS_MONTH=2026-10` picks another month | CC0 |

## How places are chosen

- A destination is a GeoNames city with an English Wikipedia article, or a Wikivoyage city, rural area, park, island, or leaf region. Countries, continents, airports, and regions that are split into sub-regions are left out, unless the region is an island or `overrides.json` gives it a kind.
- A district of a large city is not a destination. Wikivoyage district pages (`Paris/Louvre`) and cities filed under another city (Manhattan under New York City) fold into the parent, and their "See" listings count for the parent.
- Popularity is half Wikivoyage views, a quarter Wikipedia views, and a quarter sitelinks, each on a log scale. The top 1,500 are tier 1, the next 8,500 tier 2, the rest tier 3.
- Landmark candidates are Wikidata items with coordinates, at least 5 sitelinks, and a class in `LANDMARK_CLASSES` (`build.ts`), plus anything a Wikivoyage article lists under "See". A listed item with no known class is kept as an `attraction` unless it is an organisation, a settlement, an administrative area, an event, or a person.
- A landmark goes to the nearest destination that lists it under "See". Otherwise it goes to the most popular destination whose radius covers it; mountains, lakes, and other natural features reach twice as far.
- Landmarks are ordered by sitelinks, with a boost for a "See" listing and for UNESCO status. Each destination keeps the top 8, or 12 in tier 1.
- Each tier 1 and tier 2 destination gets 8 nearby neighbours, weighted towards popular places, and 4 far-away tier 1 places with a similar mix of landmarks.

`out/report.md` lists the top destinations, the tier 1 places with few landmarks, and the landmark lists of about 35 well-known places. Read it after every build.

## How photos are chosen

- Candidates, in order: the destination's Wikidata image (P18), its night view (P3451), the image of its top landmark, then its Wikivoyage banner (P948).
- A photo must be a JPEG, PNG, or WebP at least 960 px wide with an aspect ratio between 1.2 and 3. Files named like maps, flags, coats of arms, montages, or satellite images, and images credited to satellite programmes, are skipped.
- Banners skip the shape check because they are about 7:1; they are a last resort since they look soft at card height. `out/report.md` counts photos, banners, and misses, and lists tier 1 places without a photo.
- Commons lookups are cached per file in `.cache/commons-imageinfo-1280.json`.

## Overrides

`overrides.json` is applied on every build, so manual fixes survive a rebuild. All IDs are Wikidata IDs.

```json
{
  "destinations": {
    "remove": ["Q123"],
    "rename": { "Q60": "New York City" },
    "kind": { "Q3125978": "island" }
  },
  "landmarks": {
    "remove": ["Q456"],
    "rename": { "Q19675": "Louvre" },
    "pin": { "Q90": ["Q243", "Q19675"] }
  }
}
```

`pin` forces landmarks into a destination, in the order given, ahead of everything else. A `kind` entry also keeps a region that would be dropped for having sub-regions, which is how Bali, Sicily, and Tuscany get in.

## Loading

The loader upserts by Wikidata ID, so document IDs stay stable and user data keeps pointing at the same places. It never replaces a table. With `--retire`, places absent from the new build are marked `retired`: they disappear from search but stay readable for people who already ranked them.
