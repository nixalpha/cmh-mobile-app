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

test("friends' top picks, friends' saves, and similar places outrank popular ones and carry their reason", async () => {
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
  await rank(sam, ids.Lisbon);
  await settle(t);

  const result = await sam.as.query(api.recommendations.forYou, {});
  expect(result.basedOn).toBe(1);
  expect(result.items.slice(0, 3).map((item) => [item.destination.name, item.reason.kind])).toEqual([
    ["Kyoto", "friends_top"],
    ["Porto", "similar_to"],
    ["Rome", "friends_want"],
  ]);
  const [kyoto, porto, rome] = result.items;
  expect(kyoto.reason).toMatchObject({ count: 2 });
  expect(kyoto.reason.kind === "friends_top" && kyoto.reason.friends.map((f) => f.handle).sort()).toEqual(["maya", "theo"]);
  expect(porto.reason).toMatchObject({ source: { name: "Lisbon" }, sourceRank: 1, basis: "nearby" });
  expect(rome.reason).toMatchObject({ count: 1 });
  const names = result.items.map((item) => item.destination.name);
  expect(names).not.toContain("Lisbon");
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
