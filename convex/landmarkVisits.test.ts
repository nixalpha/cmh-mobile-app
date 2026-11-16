import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ORPHAN_AFTER_MS } from "./landmarkVisits";
import { befriend, setup, signUp, type Test } from "./test.setup";

type Person = Awaited<ReturnType<typeof signUp>>;
const firstPage = { numItems: 50, cursor: null };

// Fushimi Inari, Kyoto.
const LANDMARK = { lat: 34.9671, lng: 135.7727 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const settle = async (t: Test) => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
};

async function seed(t: Test) {
  await t.mutation(internal.catalog.upsertDestinations, {
    importedAt: 1,
    rows: [
      {
        wikidataId: "Q1",
        kind: "city",
        name: "Kyoto",
        searchText: "kyoto",
        countryCode: "JP",
        countryName: "Japan",
        lat: 35,
        lng: 135.7,
        popularity: 0.9,
        tier: 1,
        landmarkCount: 2,
      },
    ],
  });
  await t.mutation(internal.catalog.upsertLandmarks, {
    importedAt: 1,
    rows: ["Fushimi Inari", "Kinkaku-ji"].map((name, i) => ({
      wikidataId: `L${i}`,
      destinationWikidataId: "Q1",
      name,
      searchText: name.toLowerCase(),
      category: "shrine",
      ...LANDMARK,
      notability: 9 - i,
      order: i + 1,
    })),
  });
  return await t.run(async (ctx) => {
    const kyoto = (await ctx.db.query("destinations").first())!;
    const landmarks = await ctx.db.query("landmarks").take(10);
    return {
      kyoto: kyoto._id,
      inari: landmarks.find((l) => l.name === "Fushimi Inari")!._id,
      kinkaku: landmarks.find((l) => l.name === "Kinkaku-ji")!._id,
    };
  });
}

async function upload(t: Test, type = "image/jpeg") {
  return await t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(64)], { type })));
}

const photo = (storageId: Id<"_storage">, extra: { lat?: number; lng?: number } = {}) => ({
  storageId,
  width: 2048,
  height: 1536,
  takenAt: Date.UTC(2026, 10, 3),
  ...extra,
});

const mineAt = async (person: Person, landmarkId: Id<"landmarks">) =>
  (await person.as.query(api.landmarkVisits.get, { landmarkId }))?.mine ?? null;

const blank = { companionIds: [], keepPhotoIds: [], newPhotos: [], stealth: false };

async function world() {
  const t = setup();
  const places = await seed(t);
  const ada = await signUp(t, "ada");
  const ben = await signUp(t, "benny");
  const cy = await signUp(t, "cyd");
  await befriend(ada, ben);
  await befriend(ada, cy);
  await ada.as.mutation(api.places.addVisit, { destinationId: places.kyoto });
  return { t, ...places, ada, ben, cy };
}

const tagsOf = async (person: Person) =>
  (await person.as.query(api.notifications.list, { paginationOpts: firstPage })).page.filter(
    (n) => n.type === "tagged",
  );

test("save collects the landmark with companions, notes, photos, and date", async () => {
  const { t, inari, kyoto, ada, ben } = await world();
  const storageId = await upload(t);

  await ada.as.mutation(api.landmarkVisits.save, {
    ...blank,
    landmarkId: inari,
    visitedOn: "2026-11-03",
    note: "  Climbed to the summit at dawn.  ",
    companionIds: [ben.id],
    newPhotos: [photo(storageId)],
  });
  await settle(t);

  const mine = await mineAt(ada, inari);
  expect(mine).toMatchObject({
    visitedOn: "2026-11-03",
    note: "Climbed to the summit at dawn.",
    companions: [{ _id: ben.id }],
    verification: "self_reported",
    stealth: false,
  });
  expect(mine?.photos).toHaveLength(1);
  expect(mine?.photos[0]).not.toHaveProperty("storageId");

  const progress = await ada.as.query(api.places.landmarkProgress, { destinationId: kyoto });
  expect(progress.find((p) => p.landmark._id === inari)).toMatchObject({ unlocked: true, photoCount: 1 });
  expect(progress.find((p) => p.landmark._id === inari)?.coverUrl).toEqual(expect.any(String));

  // The undated visit picks up its year and month from the landmark visit.
  const detail = await ada.as.query(api.places.destination, { destinationId: kyoto });
  expect(detail.viewer.visit).toMatchObject({ year: 2026, month: 11, unlockCount: 1 });

  const feed = (await ben.as.query(api.feed.friends, { paginationOpts: firstPage })).page;
  expect(feed).toHaveLength(1);
  expect(feed[0].visit).toMatchObject({
    note: "Climbed to the summit at dawn.",
    companions: [{ _id: ben.id }],
    photoCount: 1,
  });

  expect(await tagsOf(ben)).toMatchObject([
    { type: "tagged", actor: { _id: ada.id }, landmark: { _id: inari }, activityId: feed[0]._id },
  ]);
});

test("editing keeps listed photos, deletes the rest, and only notifies newly tagged friends", async () => {
  const { t, inari, ada, ben, cy } = await world();
  const [first, second, third] = [await upload(t), await upload(t), await upload(t)];
  await ada.as.mutation(api.landmarkVisits.save, {
    ...blank,
    landmarkId: inari,
    companionIds: [ben.id],
    newPhotos: [photo(first), photo(second)],
  });
  const before = await mineAt(ada, inari);

  await ada.as.mutation(api.landmarkVisits.save, {
    ...blank,
    landmarkId: inari,
    companionIds: [ben.id, cy.id],
    keepPhotoIds: [before!.photos[1]._id],
    newPhotos: [photo(third)],
  });

  const after = await mineAt(ada, inari);
  expect(after?.photos.map((p) => p._id)[0]).toBe(before!.photos[1]._id);
  expect(after?.photos).toHaveLength(2);
  expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", first))).toBeNull();
  expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", second))).not.toBeNull();

  expect(await tagsOf(ben)).toHaveLength(1);
  expect(await tagsOf(cy)).toMatchObject([{ type: "tagged" }]);

  // Editing doesn't count the landmark twice.
  const detail = await ada.as.query(api.places.landmarkProgress, { destinationId: (await seedIds(t)).kyoto });
  expect(detail.filter((p) => p.unlocked)).toHaveLength(1);
});

async function seedIds(t: Test) {
  return await t.run(async (ctx) => ({ kyoto: (await ctx.db.query("destinations").first())!._id }));
}

test("save rejects bad input", async () => {
  const { t, inari, ada } = await world();
  const stranger = await signUp(t, "stranger");
  const save = (args: Partial<Parameters<typeof ada.as.mutation<typeof api.landmarkVisits.save>>[1]>) =>
    ada.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: inari, ...args });

  await expect(save({ companionIds: [stranger.id] })).rejects.toThrow(/only tag friends/);
  await expect(save({ companionIds: [ada.id] })).rejects.toThrow(/tag yourself/);
  await expect(save({ visitedOn: "2026-12-01" })).rejects.toThrow(/future/);
  await expect(save({ visitedOn: "2026-02-30" })).rejects.toThrow(/isn't valid/);
  await expect(save({ note: "x".repeat(1001) })).rejects.toThrow(/1000 characters/);

  const many = await Promise.all(Array.from({ length: 11 }, () => upload(t)));
  await expect(save({ newPhotos: many.map((id) => photo(id)) })).rejects.toThrow(/up to 10 photos/);

  await expect(save({ newPhotos: [photo(await upload(t, "text/plain"))] })).rejects.toThrow(/Only images/);

  const gone = await upload(t);
  await t.run(async (ctx) => await ctx.storage.delete(gone));
  await expect(save({ newPhotos: [photo(gone)] })).rejects.toThrow(/expired/);

  const shared = await upload(t);
  await save({ newPhotos: [photo(shared)] });
  const { kinkaku } = await t.run(async (ctx) => ({
    kinkaku: (await ctx.db.query("landmarks").take(10)).find((l) => l.name === "Kinkaku-ji")!._id,
  }));
  await expect(
    ada.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: kinkaku, newPhotos: [photo(shared)] }),
  ).rejects.toThrow(/already attached/);

  // Nothing from the rejected calls was half-written.
  expect(await mineAt(ada, kinkaku)).toBeNull();
});

test("save requires visiting the destination first", async () => {
  const { t, inari, ben } = await world();
  expect(await ben.as.query(api.landmarkVisits.get, { landmarkId: inari })).toMatchObject({
    landmark: { name: "Fushimi Inari" },
    destinationName: "Kyoto",
    destinationVisited: false,
    mine: null,
  });
  await expect(ben.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: inari })).rejects.toThrow(
    /Add the place/,
  );
  expect(await t.run(async (ctx) => await ctx.db.query("landmarkUnlocks").first())).toBeNull();
});

test("a photo taken near the landmark verifies the unlock; a distant one does not", async () => {
  const { t, inari, kinkaku, ada } = await world();
  await ada.as.mutation(api.landmarkVisits.save, {
    ...blank,
    landmarkId: inari,
    newPhotos: [photo(await upload(t), { lat: LANDMARK.lat + 0.002, lng: LANDMARK.lng })],
  });
  await ada.as.mutation(api.landmarkVisits.save, {
    ...blank,
    landmarkId: kinkaku,
    newPhotos: [photo(await upload(t), { lat: 48.8584, lng: 2.2945 })],
  });
  expect((await mineAt(ada, inari))?.verification).toBe("photo");
  expect((await mineAt(ada, kinkaku))?.verification).toBe("self_reported");

  // Removing every photo drops photo verification again.
  await ada.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: inari });
  expect((await mineAt(ada, inari))?.verification).toBe("self_reported");
});

test("stealth mode keeps the visit out of the feed and skips tag notifications", async () => {
  const { t, inari, ada, ben } = await world();
  await ada.as.mutation(api.landmarkVisits.save, {
    ...blank,
    landmarkId: inari,
    companionIds: [ben.id],
    stealth: true,
  });
  await settle(t);

  expect((await ben.as.query(api.feed.friends, { paginationOpts: firstPage })).page).toHaveLength(0);
  expect(await tagsOf(ben)).toHaveLength(0);
  const own = (await ada.as.query(api.feed.byUser, { paginationOpts: firstPage })).page;
  expect(own).toMatchObject([{ type: "unlocked", visibility: "private" }]);
  expect((await mineAt(ada, inari))?.stealth).toBe(true);

  // Turning stealth off later publishes the existing post.
  await ada.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: inari, companionIds: [ben.id] });
  expect((await ben.as.query(api.feed.friends, { paginationOpts: firstPage })).page).toHaveLength(1);
});

test("a bare unlock does not fold into a post showing another landmark's photos", async () => {
  const { t, inari, kinkaku, ada, ben } = await world();
  await ada.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: inari, newPhotos: [photo(await upload(t))] });
  await ada.as.mutation(api.places.unlockLandmark, { landmarkId: kinkaku });
  await settle(t);
  const feed = (await ben.as.query(api.feed.friends, { paginationOpts: firstPage })).page;
  expect(feed.map((post) => post.landmark?._id).sort()).toEqual([inari, kinkaku].sort());
});

test("un-collecting a landmark or removing the visit deletes its photos", async () => {
  const { t, inari, kinkaku, kyoto, ada } = await world();
  const [a, b] = [await upload(t), await upload(t)];
  await ada.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: inari, newPhotos: [photo(a)] });
  await ada.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: kinkaku, newPhotos: [photo(b)] });

  await ada.as.mutation(api.places.lockLandmark, { landmarkId: inari });
  expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", a))).toBeNull();
  expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", b))).not.toBeNull();

  await ada.as.mutation(api.places.removeVisit, { destinationId: kyoto });
  expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", b))).toBeNull();
  expect(await t.run(async (ctx) => await ctx.db.query("landmarkPhotos").first())).toBeNull();
});

test("the cleanup job deletes old uploads that were never attached", async () => {
  const { t, inari, ada } = await world();
  const attached = await upload(t);
  const abandoned = await upload(t);
  await ada.as.mutation(api.landmarkVisits.save, { ...blank, landmarkId: inari, newPhotos: [photo(attached)] });

  vi.setSystemTime(Date.now() + ORPHAN_AFTER_MS + 1000);
  const fresh = await upload(t);
  await t.mutation(internal.landmarkVisits.cleanOrphanUploads, { cursor: null });
  await settle(t);

  const exists = async (id: Id<"_storage">) =>
    (await t.run(async (ctx) => await ctx.db.system.get("_storage", id))) !== null;
  expect(await exists(attached)).toBe(true);
  expect(await exists(abandoned)).toBe(false);
  expect(await exists(fresh)).toBe(true);
});
