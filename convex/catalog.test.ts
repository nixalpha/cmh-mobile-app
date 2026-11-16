import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { setup, signUp, type Test } from "./test.setup";

const place = (wikidataId: string, name: string, tier: number, popularity: number) => ({
  wikidataId,
  kind: "city" as const,
  name,
  searchText: name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
  countryCode: "XX",
  countryName: "Testland",
  lat: 1,
  lng: 2,
  popularity,
  tier,
  landmarkCount: 0,
});

const landmark = (wikidataId: string, destinationWikidataId: string, name: string, order: number) => ({
  wikidataId,
  destinationWikidataId,
  name,
  searchText: name.toLowerCase(),
  category: "museum",
  lat: 1,
  lng: 2,
  notability: 10 - order,
  order,
});

async function seed(t: Test) {
  await t.mutation(internal.catalog.upsertDestinations, {
    importedAt: 1,
    rows: [
      place("Q1", "Parma", 2, 0.5),
      place("Q2", "Paris", 1, 0.9),
      place("Q3", "Reykjavík", 1, 0.7),
      place("Q4", "Paradise", 1, 0.95),
    ],
  });
  await t.mutation(internal.catalog.upsertLandmarks, {
    importedAt: 1,
    rows: [landmark("L2", "Q2", "Louvre", 2), landmark("L1", "Q2", "Eiffel Tower", 1), landmark("L9", "Q404", "Orphan", 1)],
  });
}

test("signed-out callers cannot read the catalog", async () => {
  const t = setup();
  await seed(t);
  const paris = await t.run((ctx) => ctx.db.query("destinations").withIndex("by_wikidataId", (q) => q.eq("wikidataId", "Q2")).unique());
  await expect(t.query(api.destinations.search, { query: "par" })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.query(api.destinations.popular, {})).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.query(api.destinations.get, { destinationId: paris!._id })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.query(api.landmarks.search, { query: "louvre" })).rejects.toThrow(/UNAUTHENTICATED/);
});

test("search ranks higher tiers first, prefers name prefixes, and folds accents", async () => {
  const t = setup();
  await seed(t);
  const { as } = await signUp(t, "alice");
  const names = async (query: string) => (await as.query(api.destinations.search, { query })).map((d) => d.name);
  expect(await names("par")).toEqual(["Paradise", "Paris", "Parma"]);
  expect(await names("REYKJAVIK")).toEqual(["Reykjavík"]);
  expect(await names("   ")).toEqual([]);
});

test("popular lists tier 1 by popularity", async () => {
  const t = setup();
  await seed(t);
  const { as } = await signUp(t, "alice");
  expect((await as.query(api.destinations.popular, {})).map((d) => d.name)).toEqual(["Paradise", "Paris", "Reykjavík"]);
});

test("re-importing updates in place, and retiring hides what the new import dropped", async () => {
  const t = setup();
  await seed(t);
  const { as } = await signUp(t, "alice");
  const [paris] = await as.query(api.destinations.search, { query: "paris" });
  const before = await as.query(api.destinations.get, { destinationId: paris._id });
  expect(before?.landmarks.map((l) => l.name)).toEqual(["Eiffel Tower", "Louvre"]);

  const result = await t.mutation(internal.catalog.upsertDestinations, {
    importedAt: 2,
    rows: [{ ...place("Q2", "Paris", 1, 0.9), landmarkCount: 1 }],
  });
  expect(result).toEqual({ inserted: 0, updated: 1 });
  await t.mutation(internal.catalog.upsertLandmarks, { importedAt: 2, rows: [landmark("L1", "Q2", "Eiffel Tower", 1)] });
  for (const table of ["landmarks", "destinations"] as const) {
    expect(await t.mutation(internal.catalog.retireStale, { table, importedBefore: 2 })).toMatchObject({ done: true });
  }

  const after = await as.query(api.destinations.get, { destinationId: paris._id });
  expect(after?.destination).toMatchObject({ _id: paris._id, landmarkCount: 1 });
  expect(after?.landmarks.map((l) => l.name)).toEqual(["Eiffel Tower"]);
  expect((await as.query(api.destinations.search, { query: "par" })).map((d) => d.name)).toEqual(["Paris"]);
  expect((await as.query(api.landmarks.search, { query: "louvre" }))).toEqual([]);
  expect((await as.query(api.landmarks.search, { query: "eiffel" }))[0]).toMatchObject({
    landmark: { name: "Eiffel Tower" },
    destination: { name: "Paris" },
  });
});

test("destination photos are stored, returned, and cleared by a re-import without one", async () => {
  const t = setup();
  const image = {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Paris.jpg/1280px-Paris.jpg",
    width: 1280,
    height: 853,
    credit: "Jane Doe",
    license: "CC BY-SA 4.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Paris.jpg",
  };
  await t.mutation(internal.catalog.upsertDestinations, { importedAt: 1, rows: [{ ...place("Q2", "Paris", 1, 0.9), image }] });
  const { as } = await signUp(t, "alice");
  const [paris] = await as.query(api.destinations.search, { query: "paris" });
  expect(paris.image).toEqual(image);
  expect((await as.query(api.destinations.get, { destinationId: paris._id }))?.destination.image).toEqual(image);

  await t.mutation(internal.catalog.upsertDestinations, { importedAt: 2, rows: [place("Q2", "Paris", 1, 0.9)] });
  expect((await as.query(api.destinations.get, { destinationId: paris._id }))?.destination.image).toBeNull();
});

test("neighbors are replaced on each import", async () => {
  const t = setup();
  await seed(t);
  const rows = (ids: string[]) => [
    { destinationWikidataId: "Q2", neighbors: ids.map((wikidataId, i) => ({ wikidataId, similarity: 1 - i / 10, basis: "nearby" as const })) },
  ];
  await t.mutation(internal.catalog.replaceNeighbors, { rows: rows(["Q1", "Q3"]) });
  await t.mutation(internal.catalog.replaceNeighbors, { rows: rows(["Q4", "Q404"]) });
  const stored = await t.run(async (ctx) => {
    const docs = await ctx.db.query("destinationNeighbors").take(10);
    return await Promise.all(docs.map(async (doc) => (await ctx.db.get("destinations", doc.neighborId))?.name));
  });
  expect(stored).toEqual(["Paradise"]);
});
