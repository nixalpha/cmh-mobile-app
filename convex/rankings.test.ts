import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { answer, isPlaced, maxPicks, opponentIndex, startRange, type Outcome } from "./lib/ranking";
import { befriend, setup, signUp, type Test } from "./test.setup";

type Actor = Awaited<ReturnType<typeof signUp>>["as"];
type ItemId = Id<"destinations"> | Id<"landmarks">;
const firstPage = { numItems: 50, cursor: null };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function seedCatalog(t: Test, count = 8) {
  await t.mutation(internal.catalog.upsertDestinations, {
    importedAt: 1,
    rows: Array.from({ length: count }, (_, i) => ({
      wikidataId: `Q${i}`,
      kind: "city" as const,
      name: `City ${i}`,
      searchText: `city ${i}`,
      countryCode: i < 2 ? "AA" : "BB",
      countryName: i < 2 ? "Aland" : "Bland",
      lat: i,
      lng: i,
      popularity: 1 - i / 100,
      tier: 1,
      landmarkCount: i === 0 ? 2 : 0,
    })),
  });
  await t.mutation(internal.catalog.upsertLandmarks, {
    importedAt: 1,
    rows: [1, 2].map((order) => ({
      wikidataId: `L${order}`,
      destinationWikidataId: "Q0",
      name: `Landmark ${order}`,
      searchText: `landmark ${order}`,
      category: "museum",
      lat: 0,
      lng: 0,
      notability: 10 - order,
      order,
    })),
  });
  return await t.run(async (ctx) => {
    const cities = await ctx.db.query("destinations").take(100);
    const landmarks = await ctx.db.query("landmarks").take(100);
    cities.sort((a, b) => a.lat - b.lat);
    landmarks.sort((a, b) => a.order - b.order);
    return { cities: cities.map((c) => c._id), landmarks: landmarks.map((l) => l._id) };
  });
}

async function collectAnswers(as: Actor, list: "destinations" | "landmarks", decide: (opponent: ItemId) => Outcome) {
  const { size, version } = await as.query(api.rankings.session, { list });
  const answers: { opponentId: ItemId; outcome: Outcome }[] = [];
  let range = startRange(size);
  while (!isPlaced(range)) {
    const [opponent] = await as.query(api.rankings.opponents, { list, ranks: [opponentIndex(range) + 1] });
    const outcome = decide(opponent.itemId);
    answers.push({ opponentId: opponent.itemId, outcome });
    range = answer(range, outcome);
  }
  return { answers, version, size };
}

async function rankCity(as: Actor, cities: Id<"destinations">[], city: Id<"destinations">) {
  const preference = (id: ItemId) => cities.indexOf(id as Id<"destinations">);
  const { answers, version, size } = await collectAnswers(as, "destinations", (opponent) =>
    preference(city) < preference(opponent) ? "new" : "existing",
  );
  expect(answers.length).toBeLessThanOrEqual(maxPicks(size));
  return await as.mutation(api.rankings.place, {
    list: "destinations",
    itemId: city,
    answers,
    version,
    visit: { year: 2024, month: 6 },
  });
}

async function ranked(as: Actor, userId?: Id<"users">) {
  const { page } = await as.query(api.rankings.list, { list: "destinations", userId, paginationOpts: firstPage });
  return page;
}

test("ranking through the mutation rebuilds the user's true order with dense ranks and scores", async () => {
  const t = setup();
  const { cities } = await seedCatalog(t);
  const alice = await signUp(t, "alice");
  for (const index of [3, 0, 6, 1, 7, 4, 2, 5]) await rankCity(alice.as, cities, cities[index]);

  const list = await ranked(alice.as);
  expect(list.map((row) => row.itemId)).toEqual(cities);
  expect(list.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(list[0].score).toBe(10);
  expect(list[7].score).toBe(5);
  expect(list[0].destination?.name).toBe("City 0");
  expect(await alice.as.query(api.users.me, {})).toMatchObject({ stats: { cities: 8, countries: 2, landmarks: 0 } });
});

test("a ranking built on a stale list is rejected", async () => {
  const t = setup();
  const { cities } = await seedCatalog(t);
  const alice = await signUp(t, "alice");
  await rankCity(alice.as, cities, cities[2]);
  await rankCity(alice.as, cities, cities[4]);

  const stale = await collectAnswers(alice.as, "destinations", () => "new");
  await rankCity(alice.as, cities, cities[0]);
  await expect(
    alice.as.mutation(api.rankings.place, { list: "destinations", itemId: cities[1], answers: stale.answers, version: stale.version, visit: {} }),
  ).rejects.toThrow(/LIST_CHANGED/);

  const fresh = await alice.as.query(api.rankings.session, { list: "destinations" });
  const wrongOpponent = [{ opponentId: cities[4], outcome: "new" as const }, { opponentId: cities[0], outcome: "new" as const }];
  await expect(
    alice.as.mutation(api.rankings.place, { list: "destinations", itemId: cities[1], answers: wrongOpponent, version: fresh.version, visit: {} }),
  ).rejects.toThrow(/LIST_CHANGED/);
  await expect(
    alice.as.mutation(api.rankings.place, { list: "destinations", itemId: cities[1], answers: [], version: fresh.version, visit: {} }),
  ).rejects.toThrow(/INVALID/);
  expect((await ranked(alice.as)).map((row) => row.itemId)).toEqual([cities[0], cities[2], cities[4]]);
});

test("placing needs a visit date once and refuses duplicates", async () => {
  const t = setup();
  const { cities } = await seedCatalog(t);
  const alice = await signUp(t, "alice");
  await expect(
    alice.as.mutation(api.rankings.place, { list: "destinations", itemId: cities[0], answers: [], version: 0 }),
  ).rejects.toThrow(/INVALID/);
  await alice.as.mutation(api.places.addVisit, { destinationId: cities[0] });
  await alice.as.mutation(api.rankings.place, { list: "destinations", itemId: cities[0], answers: [], version: 0 });
  await expect(
    alice.as.mutation(api.rankings.place, { list: "destinations", itemId: cities[0], answers: [], version: 1 }),
  ).rejects.toThrow(/CONFLICT/);
  await expect(alice.as.mutation(api.places.addVisit, { destinationId: cities[1], year: 1800 })).rejects.toThrow(/INVALID/);
  await expect(alice.as.mutation(api.places.addVisit, { destinationId: cities[1], month: 5 })).rejects.toThrow(/INVALID/);
});

test("removing closes the gap and ranking again moves a place", async () => {
  const t = setup();
  const { cities } = await seedCatalog(t);
  const alice = await signUp(t, "alice");
  for (const index of [0, 1, 2, 3]) await rankCity(alice.as, cities, cities[index]);

  await alice.as.mutation(api.rankings.remove, { list: "destinations", itemId: cities[1] });
  const afterRemove = await ranked(alice.as);
  expect(afterRemove.map((row) => row.itemId)).toEqual([cities[0], cities[2], cities[3]]);
  expect(afterRemove.map((row) => row.rank)).toEqual([1, 2, 3]);
  await expect(alice.as.mutation(api.rankings.remove, { list: "destinations", itemId: cities[1] })).rejects.toThrow(/NOT_FOUND/);

  const { version } = await alice.as.query(api.rankings.session, { list: "destinations" });
  const moved = await alice.as.mutation(api.rankings.rerank, {
    list: "destinations",
    itemId: cities[0],
    answers: [{ opponentId: cities[3], outcome: "existing" }],
    version,
  });
  expect(moved).toEqual({ rank: 3, size: 3, score: 5 });
  expect((await ranked(alice.as)).map((row) => row.itemId)).toEqual([cities[2], cities[3], cities[0]]);
});

test("landmarks unlock only in visited places and rank only once unlocked", async () => {
  const t = setup();
  const { cities, landmarks } = await seedCatalog(t);
  const alice = await signUp(t, "alice");
  await expect(alice.as.mutation(api.places.unlockLandmark, { landmarkId: landmarks[0] })).rejects.toThrow(/INVALID/);
  await alice.as.mutation(api.places.addVisit, { destinationId: cities[0], year: 2023 });
  await expect(
    alice.as.mutation(api.rankings.place, { list: "landmarks", itemId: landmarks[0], answers: [], version: 0 }),
  ).rejects.toThrow(/FORBIDDEN/);
  await alice.as.mutation(api.places.unlockLandmark, { landmarkId: landmarks[0] });
  await alice.as.mutation(api.places.unlockLandmark, { landmarkId: landmarks[0] });
  await alice.as.mutation(api.rankings.place, { list: "landmarks", itemId: landmarks[0], answers: [], version: 0 });

  const progress = await alice.as.query(api.places.landmarkProgress, { destinationId: cities[0] });
  expect(progress.map((row) => [row.landmark.name, row.unlocked])).toEqual([["Landmark 1", true], ["Landmark 2", false]]);
  expect(await alice.as.query(api.users.me, {})).toMatchObject({ stats: { cities: 1, countries: 1, landmarks: 1 } });

  await alice.as.mutation(api.places.removeVisit, { destinationId: cities[0] });
  expect(await alice.as.query(api.users.me, {})).toMatchObject({ stats: { cities: 0, countries: 0, landmarks: 0 } });
  expect(await alice.as.query(api.rankings.session, { list: "landmarks" })).toMatchObject({ size: 0 });
});

test("lists and visits are visible to friends and refused to everyone else", async () => {
  const t = setup();
  const { cities } = await seedCatalog(t);
  const alice = await signUp(t, "alice");
  const bob = await signUp(t, "bob");
  const carol = await signUp(t, "carol");
  await befriend(alice, bob);
  await rankCity(alice.as, cities, cities[0]);

  expect((await ranked(bob.as, alice.id)).map((row) => row.itemId)).toEqual([cities[0]]);
  const visits = await bob.as.query(api.places.visits, { userId: alice.id, paginationOpts: firstPage });
  expect(visits.page[0]).toMatchObject({ year: 2024, month: 6, rank: 1, score: 10 });
  await expect(carol.as.query(api.rankings.list, { list: "destinations", userId: alice.id, paginationOpts: firstPage })).rejects.toThrow(/FORBIDDEN/);
  await expect(carol.as.query(api.places.visits, { userId: alice.id, paginationOpts: firstPage })).rejects.toThrow(/FORBIDDEN/);
  expect(await carol.as.query(api.users.profile, { userId: alice.id })).toMatchObject({ stats: null });
  expect(await bob.as.query(api.users.profile, { userId: alice.id })).toMatchObject({ stats: { cities: 1 } });
  expect(await ranked(carol.as)).toEqual([]);
});

test("the destination page reports the viewer's state and friends' scores, leaving out short lists", async () => {
  const t = setup();
  const { cities, landmarks } = await seedCatalog(t);
  const viewer = await signUp(t, "viewer");
  const maya = await signUp(t, "maya");
  const theo = await signUp(t, "theo");
  const stranger = await signUp(t, "stranger");
  await befriend(viewer, maya);
  await befriend(viewer, theo);

  for (const index of [0, 1, 2, 3, 4]) await rankCity(maya.as, cities, cities[index]);
  await rankCity(theo.as, cities, cities[1]);
  await theo.as.mutation(api.places.addVisit, { destinationId: cities[0] });
  await theo.as.mutation(api.places.unlockLandmark, { landmarkId: landmarks[1] });
  await rankCity(stranger.as, cities, cities[1]);
  await viewer.as.mutation(api.places.save, { destinationId: cities[1] });

  const page = await viewer.as.query(api.places.destination, { destinationId: cities[1] });
  expect(page.viewer).toEqual({ visit: null, rank: null, listSize: 0, score: null, saved: true });
  expect(page.friends.visitedCount).toBe(2);
  expect(page.friends.rankedCount).toBe(2);
  expect(page.friends.averageScore).toBe(8.8);
  expect(page.friends.best).toMatchObject({ user: { handle: "theo" }, rank: 1 });
  expect(page.friends.sample.map((user) => user.handle).sort()).toEqual(["maya", "theo"]);

  const progress = await viewer.as.query(api.places.landmarkProgress, { destinationId: cities[0] });
  expect(progress.map((row) => row.friendsUnlocked)).toEqual([0, 1]);

  await viewer.as.mutation(api.places.unsave, { destinationId: cities[1] });
  expect((await viewer.as.query(api.places.saved, { paginationOpts: firstPage })).page).toEqual([]);
});

test("signed-out callers are refused by every ranking and place function", async () => {
  const t = setup();
  const { cities, landmarks } = await seedCatalog(t);
  const destinationId = cities[0];
  const refused = [
    t.mutation(api.rankings.place, { list: "destinations", itemId: destinationId, answers: [], version: 0, visit: {} }),
    t.mutation(api.rankings.rerank, { list: "destinations", itemId: destinationId, answers: [], version: 0 }),
    t.mutation(api.rankings.remove, { list: "destinations", itemId: destinationId }),
    t.query(api.rankings.session, { list: "destinations" }),
    t.query(api.rankings.opponents, { list: "destinations", ranks: [1] }),
    t.query(api.rankings.list, { list: "destinations", paginationOpts: firstPage }),
    t.mutation(api.places.addVisit, { destinationId }),
    t.mutation(api.places.removeVisit, { destinationId }),
    t.query(api.places.visits, { paginationOpts: firstPage }),
    t.mutation(api.places.save, { destinationId }),
    t.mutation(api.places.unsave, { destinationId }),
    t.query(api.places.saved, { paginationOpts: firstPage }),
    t.mutation(api.places.unlockLandmark, { landmarkId: landmarks[0] }),
    t.mutation(api.places.lockLandmark, { landmarkId: landmarks[0] }),
    t.query(api.places.destination, { destinationId }),
    t.query(api.places.landmarkProgress, { destinationId }),
  ];
  for (const call of refused) await expect(call).rejects.toThrow(/UNAUTHENTICATED/);
});
