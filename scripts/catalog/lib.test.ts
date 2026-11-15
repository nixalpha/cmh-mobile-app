import { expect, test } from "vitest";

import {
  assignLandmarks,
  assignTiers,
  computeNeighbors,
  Grid,
  haversineKm,
  searchText,
  seeListings,
  TIER_1_SIZE,
  type Candidate,
  type Destination,
} from "./lib";

const destination = (overrides: Partial<Destination> & Pick<Destination, "wikidataId" | "lat" | "lng">): Destination => ({
  kind: "city",
  name: overrides.wikidataId,
  altNames: [],
  countryCode: "FR",
  countryName: "France",
  population: 2_000_000,
  sitelinks: 100,
  pageviews: 1000,
  voyageViews: 500,
  hasWikivoyage: true,
  popularity: 0.5,
  tier: 1,
  ...overrides,
});

const candidate = (overrides: Partial<Candidate> & Pick<Candidate, "wikidataId" | "lat" | "lng">): Candidate => ({
  name: overrides.wikidataId,
  category: "museum",
  sitelinks: 50,
  unesco: false,
  ...overrides,
});

test("haversine distance between Paris and London is about 344 km", () => {
  expect(haversineKm(48.8566, 2.3522, 51.5074, -0.1278)).toBeGreaterThan(340);
  expect(haversineKm(48.8566, 2.3522, 51.5074, -0.1278)).toBeLessThan(348);
});

test("the grid returns only points inside the radius, across cell borders", () => {
  const grid = new Grid(0.5, [
    { id: "near", lat: 48.99, lng: 2.01 },
    { id: "far", lat: 50.5, lng: 2.0 },
  ]);
  expect(grid.near(49.01, 1.99, 10).map((n) => n.item.id)).toEqual(["near"]);
});

test("search text folds accents, drops duplicates, and respects the length cap", () => {
  expect(searchText(["Reykjavík", "Reykjavik", "Iceland"])).toBe("reykjavik iceland");
  expect(searchText(["a".repeat(200), "b".repeat(200)], 300)).toBe("a".repeat(200));
});

test("tiers follow popularity", () => {
  const all = Array.from({ length: TIER_1_SIZE + 2 }, (_, i) =>
    destination({ wikidataId: `Q${i}`, lat: 0, lng: 0, sitelinks: i + 1, pageviews: i }),
  );
  assignTiers(all);
  expect(all[0].wikidataId).toBe(`Q${TIER_1_SIZE + 1}`);
  expect(all[0].tier).toBe(1);
  expect(all[all.length - 1].tier).toBe(2);
});

test("a landmark near two cities goes to the more popular one", () => {
  const paris = destination({ wikidataId: "paris", lat: 48.8566, lng: 2.3522, popularity: 0.9 });
  const suburb = destination({ wikidataId: "suburb", lat: 48.9362, lng: 2.3574, popularity: 0.3, population: 100_000 });
  const result = assignLandmarks([paris, suburb], [candidate({ wikidataId: "basilica", lat: 48.9355, lng: 2.3598 })], new Map());
  expect(result.get("paris")?.map((l) => l.wikidataId)).toEqual(["basilica"]);
  expect(result.has("suburb")).toBe(false);
});

test("a See listing beats popularity", () => {
  const paris = destination({ wikidataId: "paris", lat: 48.8566, lng: 2.3522, popularity: 0.9 });
  const versailles = destination({ wikidataId: "versailles", lat: 48.8049, lng: 2.1204, popularity: 0.4, population: 85_000 });
  const palace = candidate({ wikidataId: "palace", lat: 48.8049, lng: 2.1204, sitelinks: 3 });
  const result = assignLandmarks(
    [paris, versailles],
    [palace],
    new Map([
      ["paris", new Set(["palace"])],
      ["versailles", new Set(["palace"])],
    ]),
  );
  expect(result.get("versailles")?.[0]).toMatchObject({ wikidataId: "palace", seeListed: true, order: 1 });
});

test("far and duplicate candidates are dropped, and tier limits apply", () => {
  const paris = destination({ wikidataId: "paris", lat: 48.8566, lng: 2.3522, tier: 2 });
  const many = Array.from({ length: 12 }, (_, i) =>
    candidate({ wikidataId: `m${i}`, name: `Museum number ${i}`, lat: 48.85 + i * 0.005, lng: 2.35, sitelinks: 20 + i }),
  );
  const result = assignLandmarks(
    [paris],
    [
      ...many,
      candidate({ wikidataId: "louvre", name: "Louvre Museum", lat: 48.8606, lng: 2.3376, sitelinks: 170 }),
      candidate({ wikidataId: "pyramid", name: "Louvre Pyramid", lat: 48.861, lng: 2.3358, sitelinks: 60 }),
      candidate({ wikidataId: "far", lat: 45.76, lng: 4.83, sitelinks: 90 }),
      candidate({ wikidataId: "paris", lat: 48.8566, lng: 2.3522, sitelinks: 300 }),
    ],
    new Map(),
  );
  const ids = result.get("paris")!.map((l) => l.wikidataId);
  expect(ids).toHaveLength(8);
  expect(ids[0]).toBe("louvre");
  expect(ids).not.toContain("pyramid");
  expect(ids).not.toContain("far");
  expect(ids).not.toContain("paris");
  expect(result.get("paris")!.map((l) => l.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test("a landmark inside a region and a less popular town goes to the region", () => {
  const cappadocia = destination({ wikidataId: "cappadocia", kind: "region", lat: 38.67, lng: 34.84, popularity: 0.7, population: undefined });
  const town = destination({ wikidataId: "town", lat: 38.63, lng: 34.72, popularity: 0.4, population: 20_000 });
  const result = assignLandmarks([cappadocia, town], [candidate({ wikidataId: "castle", lat: 38.63, lng: 34.8 })], new Map());
  expect(result.get("cappadocia")?.map((l) => l.wikidataId)).toEqual(["castle"]);
});

test("a mountain reaches a town twice as far away as a museum does", () => {
  const zermatt = destination({ wikidataId: "zermatt", lat: 46.0207, lng: 7.7491, population: 5_800 });
  const peak = { lat: 45.9763, lng: 7.6586 };
  const result = assignLandmarks(
    [zermatt],
    [candidate({ wikidataId: "matterhorn", category: "nature", ...peak }), candidate({ wikidataId: "hut", ...peak })],
    new Map(),
  );
  expect(result.get("zermatt")?.map((l) => l.wikidataId)).toEqual(["matterhorn"]);
});

test("See listings are read through nested templates, and other listing types are ignored", () => {
  const text = [
    "* {{see | name=Louvre | price={{EUR|22}} | wikidata=Q19675 | content=Text with {{convert|1|km}}.}}",
    "* {{listing | type=see | name=Tower | wikidata=Q243}}",
    "* {{marker|type=see|name=Bridge|wikidata=Q1}} and {{marker|type=eat|name=Cafe|wikidata=Q2}}",
    "* {{eat | name=Bistro | wikidata=Q3}}",
    "* {{see | name=No ID}}",
  ].join("\n");
  expect(seeListings(text)).toEqual(["Q19675", "Q243", "Q1"]);
});

test("a pinned landmark is forced into its destination at the top", () => {
  const paris = destination({ wikidataId: "paris", lat: 48.8566, lng: 2.3522 });
  const result = assignLandmarks(
    [paris],
    [
      candidate({ wikidataId: "famous", lat: 48.86, lng: 2.34, sitelinks: 190 }),
      candidate({ wikidataId: "pinned", lat: 48.87, lng: 2.33, sitelinks: 2 }),
    ],
    new Map(),
    new Map([["pinned", { destinationId: "paris", rank: 0 }]]),
  );
  expect(result.get("paris")!.map((l) => l.wikidataId)).toEqual(["pinned", "famous"]);
});

test("neighbors are nearby places first, then similar ones farther away", () => {
  const lisbon = destination({ wikidataId: "lisbon", lat: 38.72, lng: -9.14, countryCode: "PT" });
  const porto = destination({ wikidataId: "porto", lat: 41.15, lng: -8.61, countryCode: "PT" });
  const kyoto = destination({ wikidataId: "kyoto", lat: 35.01, lng: 135.77, countryCode: "JP" });
  const minor = destination({ wikidataId: "minor", lat: 38.8, lng: -9.2, countryCode: "PT", tier: 3 });
  const neighbors = computeNeighbors([lisbon, porto, kyoto, minor], new Map());
  expect(neighbors.get("lisbon")).toMatchObject([
    { wikidataId: "porto", basis: "nearby" },
    { wikidataId: "kyoto", basis: "similar" },
  ]);
  expect(neighbors.has("minor")).toBe(false);
});
