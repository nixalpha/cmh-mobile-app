import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { befriend, setup, signUp, type Test } from "./test.setup";

type Person = Awaited<ReturnType<typeof signUp>>;
const NAMES = ["Lisbon", "Porto", "Kyoto", "Paris", "Rome", "Seoul", "Lima", "Cairo"];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function seedCatalog(t: Test) {
  await t.mutation(internal.catalog.upsertDestinations, {
    importedAt: 1,
    rows: NAMES.map((name, i) => ({
      wikidataId: `Q${i}`,
      kind: "city" as const,
      name,
      searchText: name.toLowerCase(),
      countryCode: `C${i}`,
      countryName: `Country ${i}`,
      lat: i,
      lng: i,
      popularity: 0.9 - i / 100,
      tier: 1,
      landmarkCount: 0,
    })),
  });
  await t.mutation(internal.catalog.replaceNeighbors, {
    rows: [{ destinationWikidataId: "Q0", neighbors: [{ wikidataId: "Q1", similarity: 0.8, basis: "nearby" as const }] }],
  });
  const docs = await t.run((ctx) => ctx.db.query("destinations").take(20));
  return Object.fromEntries(docs.map((doc) => [doc.name, doc._id])) as Record<string, Id<"destinations">>;
}

const settle = (t: Test) => t.finishAllScheduledFunctions(vi.runAllTimers);

async function rank(person: Person, itemId: Id<"destinations">) {
  const { version, size } = await person.as.query(api.rankings.session, { list: "destinations" });
  const answers = [];
  for (let range = { lo: 0, hi: size }; range.lo < range.hi; ) {
    const mid = Math.floor((range.lo + range.hi) / 2);
    const [opponent] = await person.as.query(api.rankings.opponents, { list: "destinations", ranks: [mid + 1] });
    answers.push({ opponentId: opponent.itemId, outcome: "existing" as const });
    range = { lo: mid + 1, hi: range.hi };
  }
  await person.as.mutation(api.rankings.place, { list: "destinations", itemId, answers, version, visit: { year: 2025 } });
}

const picks = async (person: Person) =>
  (await person.as.query(api.recommendations.forYou, {})).items.map((item) => [item.destination.name, item.reason.kind]);

test("a new user gets popular places, most popular first, once they ask", async () => {
  const t = setup();
  await seedCatalog(t);
  const sam = await signUp(t, "sam");
  expect(await sam.as.query(api.recommendations.forYou, {})).toEqual({ computedAt: null, basedOn: 0, items: [] });

  expect(await sam.as.mutation(api.recommendations.refresh, {})).toBe(true);
  expect(await sam.as.mutation(api.recommendations.refresh, {})).toBe(false);
  await settle(t);
  expect(await picks(sam)).toEqual(NAMES.map((name) => [name, "popular"]));
  expect(await sam.as.mutation(api.recommendations.refresh, {})).toBe(false);

  vi.advanceTimersByTime(13 * 60 * 60 * 1000);
  expect(await sam.as.mutation(api.recommendations.refresh, {})).toBe(true);
  await settle(t);
});

test("without visit history, friends' picks and saves supplement popular places", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  const sam = await signUp(t, "sam");
  const maya = await signUp(t, "maya");
  const theo = await signUp(t, "theo");
  const stranger = await signUp(t, "stranger");
  await befriend(sam, maya);
  await befriend(sam, theo);

  await rank(maya, ids.Kyoto);
  await rank(theo, ids.Kyoto);
  await rank(stranger, ids.Cairo);
  await theo.as.mutation(api.places.save, { destinationId: ids.Rome, post: false });
  await sam.as.mutation(api.recommendations.refresh, {});
  await settle(t);

  const result = await sam.as.query(api.recommendations.forYou, {});
  expect(result.basedOn).toBe(0);
  expect(result.items.slice(0, 2).map((item) => [item.destination.name, item.reason.kind])).toEqual([
    ["Kyoto", "friends_top"],
    ["Rome", "friends_want"],
  ]);
  const [kyoto, rome] = result.items;
  expect(kyoto.reason).toMatchObject({ count: 2 });
  expect(kyoto.reason.kind === "friends_top" && kyoto.reason.friends.map((f) => f.handle).sort()).toEqual(["maya", "theo"]);
  expect(rome.reason).toMatchObject({ count: 1 });
  expect(result.items.find((item) => item.destination.name === "Cairo")?.reason.kind).toBe("popular");
});

test("visited and saved places drop out at once, before the next recompute", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.recommendations.refresh, {});
  await settle(t);

  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lisbon });
  await sam.as.mutation(api.places.save, { destinationId: ids.Porto, post: false });
  const before = (await picks(sam)).map(([name]) => name);
  expect(before).not.toContain("Lisbon");
  expect(before).not.toContain("Porto");
  expect(before).toContain("Kyoto");

  await settle(t);
  expect((await picks(sam)).map(([name]) => name)).toEqual(["Kyoto", "Paris", "Rome", "Seoul", "Lima", "Cairo"]);
});

test("signed-out callers get no recommendations", async () => {
  const t = setup();
  await expect(t.query(api.recommendations.forYou, {})).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.recommendations.refresh, {})).rejects.toThrow(/UNAUTHENTICATED/);
});

test("unfriending and blocking clear cached social reasons before recomputation", async () => {
  for (const action of [api.friends.unfriend, api.friends.block]) {
    const t = setup();
    const ids = await seedCatalog(t);
    const sam = await signUp(t, "sam");
    const maya = await signUp(t, "maya");
    await befriend(sam, maya);
    await rank(maya, ids.Kyoto);
    await settle(t);
    expect(await picks(sam)).toContainEqual(["Kyoto", "friends_top"]);
    await sam.as.mutation(action, { userId: maya.id });
    expect(await picks(sam)).toEqual([]);
    await settle(t);
    expect(await picks(sam)).toContainEqual(["Kyoto", "popular"]);
  }
});

test("retired destinations disappear from cached recommendations immediately", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.recommendations.refresh, {});
  await settle(t);
  await t.run((ctx) => ctx.db.patch("destinations", ids.Lisbon, { status: "retired" }));
  expect((await picks(sam)).map(([name]) => name)).not.toContain("Lisbon");
});


test("ordinary, unranked visits personalize For You without friends or ratings", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lisbon });
  await settle(t);

  const result = await sam.as.query(api.recommendations.forYou, {});
  expect(result.basedOn).toBe(1);
  expect(result.items[0]).toMatchObject({
    destination: { name: "Porto" },
    reason: { kind: "visited_similar", source: { name: "Lisbon" }, sourceCount: 1, basis: "nearby" },
  });
  expect(result.items.map((item) => item.destination.name)).not.toContain("Lisbon");
  expect((await sam.as.query(api.rankings.session, { list: "destinations" })).size).toBe(0);
});

test("users with different histories get different picks, and personal matches outrank social popularity", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  await t.mutation(internal.catalog.replaceNeighbors, {
    rows: [{ destinationWikidataId: "Q2", neighbors: [{ wikidataId: "Q5", similarity: 0.8, basis: "similar" }] }],
  });
  const sam = await signUp(t, "sam");
  const maya = await signUp(t, "maya");
  const theo = await signUp(t, "theo");
  await befriend(sam, theo);
  await rank(theo, ids.Paris);
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lisbon });
  await maya.as.mutation(api.places.addVisit, { destinationId: ids.Kyoto });
  await settle(t);

  const samPicks = await sam.as.query(api.recommendations.forYou, {});
  const mayaPicks = await maya.as.query(api.recommendations.forYou, {});
  expect(samPicks.items[0].destination.name).toBe("Porto");
  expect(mayaPicks.items[0].destination.name).toBe("Seoul");
  expect(samPicks.items[0].score).toBeGreaterThan(samPicks.items.find((item) => item.destination.name === "Paris")!.score);
  for (const item of mayaPicks.items) {
    if (item.reason.kind === "visited_similar") expect(item.reason.source._id).toBe(ids.Kyoto);
  }
});

test("matching several visits beats a slightly stronger match to only one", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  await t.mutation(internal.catalog.replaceNeighbors, {
    rows: [
      { destinationWikidataId: "Q0", neighbors: [
        { wikidataId: "Q2", similarity: 0.8, basis: "similar" },
        { wikidataId: "Q3", similarity: 0.9, basis: "similar" },
      ] },
      { destinationWikidataId: "Q1", neighbors: [{ wikidataId: "Q2", similarity: 0.8, basis: "similar" }] },
    ],
  });
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lisbon });
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Porto });
  await settle(t);
  const result = await sam.as.query(api.recommendations.forYou, {});
  expect(result.basedOn).toBe(2);
  expect(result.items[0]).toMatchObject({ destination: { name: "Kyoto" }, reason: { sourceCount: 2 } });
});

test("ranking a visited place as a favorite strengthens its recommendations", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  await t.mutation(internal.catalog.replaceNeighbors, {
    rows: [
      { destinationWikidataId: "Q0", neighbors: [{ wikidataId: "Q2", similarity: 0.7, basis: "similar" }] },
      { destinationWikidataId: "Q1", neighbors: [{ wikidataId: "Q3", similarity: 0.9, basis: "similar" }] },
    ],
  });
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lisbon });
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Porto });
  await settle(t);
  expect((await picks(sam))[0][0]).toBe("Paris");
  await rank(sam, ids.Lisbon);
  await settle(t);
  expect((await picks(sam))[0][0]).toBe("Kyoto");
});

test("recent trips carry more weight than old trips even when the old trip is logged last", async () => {
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  const t = setup();
  const ids = await seedCatalog(t);
  await t.mutation(internal.catalog.replaceNeighbors, {
    rows: [
      { destinationWikidataId: "Q0", neighbors: [{ wikidataId: "Q2", similarity: 0.8, basis: "similar" }] },
      { destinationWikidataId: "Q1", neighbors: [{ wikidataId: "Q3", similarity: 0.8, basis: "similar" }] },
    ],
  });
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lisbon, year: 2026, month: 10 });
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Porto, year: 2000, month: 1 });
  await settle(t);
  expect((await picks(sam))[0][0]).toBe("Kyoto");
});

test("places without catalog neighbors still get recommendations matching their type", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  await t.run(async (ctx) => {
    await ctx.db.patch("destinations", ids.Lima, { kind: "park", lat: 50, lng: 50, popularity: 0.1, tier: 3 });
    await ctx.db.patch("destinations", ids.Cairo, { kind: "park", lat: -40, lng: -40, popularity: 0.05, tier: 2 });
  });
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lima });
  await settle(t);
  expect((await sam.as.query(api.recommendations.forYou, {})).items[0]).toMatchObject({
    destination: { name: "Cairo" }, reason: { kind: "visited_similar", source: { name: "Lima" } },
  });
});

test("removing a visit immediately hides explanations based on it and resets personalization", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lisbon });
  await settle(t);
  expect((await picks(sam))[0]).toEqual(["Porto", "visited_similar"]);
  await sam.as.mutation(api.places.removeVisit, { destinationId: ids.Lisbon });
  const immediate = await sam.as.query(api.recommendations.forYou, {});
  expect(immediate.basedOn).toBe(0);
  expect(immediate.items.some((item) => item.reason.kind === "visited_similar")).toBe(false);
  await settle(t);
  expect(await picks(sam)).toEqual(NAMES.map((name) => [name, "popular"]));
});

test("recommendations remain diverse across countries and stay sorted by the displayed score", async () => {
  const t = setup();
  const ids = await seedCatalog(t);
  await t.run(async (ctx) => {
    for (const name of NAMES.slice(1, 6)) await ctx.db.patch("destinations", ids[name], { countryCode: "PT" });
  });
  const sam = await signUp(t, "sam");
  await sam.as.mutation(api.places.addVisit, { destinationId: ids.Lisbon });
  await settle(t);
  const result = await sam.as.query(api.recommendations.forYou, {});
  expect(result.items.filter((item) => item.destination.countryCode === "PT")).toHaveLength(4);
  expect(result.items.some((item) => item.destination.name === "Lima")).toBe(true);
  expect(new Set(result.items.map((item) => item.destination._id)).size).toBe(result.items.length);
  const scores = result.items.map((item) => item.score);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
});

test("refresh replaces a fresh cache from an older algorithm", async () => {
  const t = setup();
  await seedCatalog(t);
  const sam = await signUp(t, "sam");
  await t.run((ctx) => ctx.db.insert("recommendationState", { userId: sam.id, computedAt: Date.now(), pending: false }));
  expect(await sam.as.mutation(api.recommendations.refresh, {})).toBe(true);
  await settle(t);
  expect(await sam.as.mutation(api.recommendations.refresh, {})).toBe(false);
  expect(await picks(sam)).toHaveLength(8);
});
