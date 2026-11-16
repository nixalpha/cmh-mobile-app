import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ORPHAN_AFTER_MS } from "./landmarkVisits";
import { befriend, setup, signUp, type Test } from "./test.setup";

const firstPage = { numItems: 50, cursor: null };
const SHRINE = { lat: 34.9671, lng: 135.7727 };
const key = (n: number) => n.toString(16).padStart(64, "0");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const settle = (t: Test) => t.finishAllScheduledFunctions(vi.runAllTimers);
const upload = (t: Test) =>
  t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(64)], { type: "image/jpeg" })));

async function world() {
  const t = setup();
  const ada = await signUp(t, "ada");
  const ben = await signUp(t, "benny");
  await befriend(ada, ben);
  const ids = await t.run(async (ctx) => {
    const destinationId = await ctx.db.insert("destinations", {
      wikidataId: "Q1", kind: "city", name: "Kyoto", searchText: "kyoto", countryCode: "JP", countryName: "Japan",
      lat: 35, lng: 135.7, popularity: 1, tier: 1, landmarkCount: 2, status: "active", importedAt: 1,
    });
    const landmarkId = await ctx.db.insert("landmarks", {
      wikidataId: "L1", destinationId, name: "Fushimi Inari", searchText: "fushimi inari", category: "shrine",
      ...SHRINE, notability: 1, order: 1, status: "active", importedAt: 1,
    });
    return { destinationId, landmarkId };
  });
  return { t, ada, ben, ...ids };
}

const landmarkPhoto = (storageId: Id<"_storage">, n: number, extra: Partial<{ lat: number; lng: number; day: string }> = {}) => ({
  storageId, width: 800, height: 600, takenAt: Date.UTC(2023, 3, n), day: `2023-04-${String(n).padStart(2, "0")}`,
  ...SHRINE, assetKey: key(n), ...extra,
});

test("a post needs a visit, then shows its photos and their date to friends", async () => {
  const { t, ada, ben, destinationId } = await world();
  const storageId = await upload(t);
  const post = { destinationId, photos: [{ storageId, width: 800, height: 600 }], takenOn: "2023-04-02", note: " Rainy day " };
  await expect(ada.as.mutation(api.posts.create, post)).rejects.toThrow(/visits/);

  await ada.as.mutation(api.places.addVisit, { destinationId });
  await ada.as.mutation(api.posts.create, post);
  await settle(t);

  const feed = await ben.as.query(api.feed.friends, { paginationOpts: firstPage });
  expect(feed.page).toHaveLength(1);
  expect(feed.page[0]).toMatchObject({
    type: "posted",
    destination: { name: "Kyoto" },
    visit: { visitedOn: "2023-04-02", note: "Rainy day", photoCount: 1 },
  });
  expect(feed.page[0].visit!.photos[0].url).toEqual(expect.any(String));
  const detail = await ada.as.query(api.places.destination, { destinationId });
  expect(detail.viewer.visit).toMatchObject({ year: 2023, month: 4, photosImported: false });
});

test("post input is checked", async () => {
  const { t, ada, destinationId } = await world();
  await ada.as.mutation(api.places.addVisit, { destinationId });
  const storageId = await upload(t);
  const photo = { storageId, width: 800, height: 600 };
  await expect(ada.as.mutation(api.posts.create, { destinationId, photos: [] })).rejects.toThrow(/at least one/);
  await expect(ada.as.mutation(api.posts.create, { destinationId, photos: [photo, photo] })).rejects.toThrow(/twice/);
  await expect(ada.as.mutation(api.posts.create, { destinationId, photos: [photo], takenOn: "2999-01-01" })).rejects.toThrow(/future/);
  await ada.as.mutation(api.posts.create, { destinationId, photos: [photo] });
  await expect(ada.as.mutation(api.posts.create, { destinationId, photos: [photo] })).rejects.toThrow(/already attached/);
});

test("importing past photos collects the landmark, dates it, posts it, and skips repeats", async () => {
  const { t, ada, ben, destinationId, landmarkId } = await world();
  await ada.as.mutation(api.places.addVisit, { destinationId });
  const [a, b, far] = [await upload(t), await upload(t), await upload(t)];
  const attached = await ada.as.mutation(api.photoImport.importLandmark, {
    landmarkId,
    photos: [landmarkPhoto(b, 5), landmarkPhoto(a, 3), landmarkPhoto(far, 4, { lat: 35.2 })],
  });
  expect(attached).toBe(2);
  await settle(t);

  const landmarks = await ada.as.query(api.places.landmarkProgress, { destinationId });
  expect(landmarks[0]).toMatchObject({ unlocked: true, verification: "photo", photoCount: 2 });
  const sheet = await ada.as.query(api.landmarkVisits.get, { landmarkId });
  expect(sheet?.mine?.visitedOn).toBe("2023-04-03");
  const feed = await ben.as.query(api.feed.friends, { paginationOpts: firstPage });
  expect(feed.page).toHaveLength(1);
  expect(feed.page[0]).toMatchObject({ type: "unlocked", visit: { visitedOn: "2023-04-03", photoCount: 2 } });

  expect(await ada.as.query(api.photoImport.seen, { assetKeys: [key(3), key(4), key(5)] })).toEqual([key(3), key(5)]);
  const again = await ada.as.mutation(api.photoImport.importLandmark, { landmarkId, photos: [landmarkPhoto(await upload(t), 3)] });
  expect(again).toBe(0);
});

test("leftover city photos become one post, and finishing marks the place imported", async () => {
  const { t, ada, destinationId } = await world();
  await expect(ada.as.mutation(api.photoImport.finish, { destinationId })).rejects.toThrow();
  await ada.as.mutation(api.places.addVisit, { destinationId });
  const photos = [
    { storageId: await upload(t), width: 10, height: 10, takenAt: 1, assetKey: key(1) },
    { storageId: await upload(t), width: 10, height: 10, takenAt: 2, assetKey: key(2) },
  ];
  expect(await ada.as.mutation(api.photoImport.importCityPhotos, { destinationId, takenOn: "2023-04-01", photos })).toBe(2);
  const retry = photos.map((photo) => ({ ...photo, storageId: photo.storageId }));
  expect(await ada.as.mutation(api.photoImport.importCityPhotos, { destinationId, takenOn: "2023-04-01", photos: retry })).toBe(0);
  await ada.as.mutation(api.photoImport.finish, { destinationId });
  await settle(t);

  const mine = await ada.as.query(api.feed.byUser, { paginationOpts: firstPage });
  expect(mine.page.filter((post) => post.type === "posted")).toHaveLength(1);
  const detail = await ada.as.query(api.places.destination, { destinationId });
  expect(detail.viewer.visit?.photosImported).toBe(true);
});

test("removing the visit deletes post photos, and cleanup keeps attached ones", async () => {
  const { t, ada, destinationId } = await world();
  await ada.as.mutation(api.places.addVisit, { destinationId });
  const storageId = await upload(t);
  await ada.as.mutation(api.posts.create, { destinationId, photos: [{ storageId, width: 10, height: 10 }] });

  vi.advanceTimersByTime(ORPHAN_AFTER_MS + 1000);
  await t.mutation(internal.landmarkVisits.cleanOrphanUploads, { cursor: null });
  expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", storageId))).not.toBeNull();

  await ada.as.mutation(api.places.removeVisit, { destinationId });
  await settle(t);
  const left = await t.run(async (ctx) => ({
    photos: await ctx.db.query("postPhotos").take(10),
    file: await ctx.db.system.get("_storage", storageId),
  }));
  expect(left).toEqual({ photos: [], file: null });
});
