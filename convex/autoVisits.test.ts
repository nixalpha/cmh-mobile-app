import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import { setup, signUp, type Test } from './test.setup';

const secret = '11111111-1111-4111-8111-11111111111122222222-2222-4222-8222-222222222222';
const point = { lat: 35, lng: 135.7 };
const day = '2026-11-15';
const assetKey = 'a'.repeat(64);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z')); });
afterEach(() => vi.useRealTimers());

async function world() {
  const t = setup();
  const ada = await signUp(t, 'ada');
  const ben = await signUp(t, 'benny');
  const ids = await t.run(async ctx => {
    const destinationId = await ctx.db.insert('destinations', {
      wikidataId: 'Q1', kind: 'city', name: 'Kyoto', searchText: 'kyoto', countryCode: 'JP', countryName: 'Japan',
      ...point, popularity: 1, tier: 1, landmarkCount: 1, status: 'active', importedAt: 1,
    });
    const landmarkId = await ctx.db.insert('landmarks', { wikidataId: 'L1', destinationId, name: 'Shrine', searchText: 'shrine',
      category: 'shrine', ...point, notability: 1, order: 1, status: 'active', importedAt: 1 });
    return { destinationId, landmarkId };
  });
  await ada.as.mutation(api.autoVisits.enable, { secret, photos: true });
  vi.advanceTimersByTime(1000);
  const sample = { secret, ...point, accuracy: 10, speed: 0, timestamp: Date.now(), day };
  return { t, ada, ben, ...ids, sample };
}

const advance = () => vi.advanceTimersByTime(60000);
const stored = (t: Test) => t.run(async ctx => ({
  visits: await ctx.db.query('visits').take(10), unlocks: await ctx.db.query('landmarkUnlocks').take(10),
  photos: await ctx.db.query('landmarkPhotos').take(20), activities: await ctx.db.query('activities').take(10),
}));

test('requires a dwell, creates the destination visit, and collects privately exactly once', async () => {
  const { t, ada, sample } = await world();
  expect(await t.mutation(api.autoVisits.record, sample)).toBe(false);
  advance();
  expect(await t.mutation(api.autoVisits.record, { ...sample, timestamp: Date.now() })).toBe(true);
  advance();
  await t.mutation(api.autoVisits.record, { ...sample, timestamp: Date.now() });
  const state = await stored(t);
  expect(state.visits).toHaveLength(1);
  expect(state.visits[0]).toMatchObject({ userId: ada.id, source: 'check_in', unlockCount: 1 });
  expect(state.unlocks).toHaveLength(1);
  expect(state.unlocks[0]).toMatchObject({ verification: 'check_in', visitedOn: day });
  expect(state.activities).toHaveLength(1);
  expect(state.activities[0].visibility).toBe('private');
});

test.each([
  { accuracy: 200 }, { accuracy: -1 }, { speed: 12 }, { lat: 36 }, { timestamp: 1 },
])('does not collect an unreliable, passing, distant, or stale fix: %j', async extra => {
  const { t, sample } = await world();
  await t.mutation(api.autoVisits.record, sample);
  advance();
  expect(await t.mutation(api.autoVisits.record, { ...sample, timestamp: Date.now(), ...extra })).toBe(false);
  expect((await stored(t)).unlocks).toHaveLength(0);
});

test('leaving the landmark and gaps in observations restart the dwell', async () => {
  const { t, sample } = await world();
  await t.mutation(api.autoVisits.record, sample);
  advance();
  await t.mutation(api.autoVisits.record, { ...sample, lat: 36, timestamp: Date.now() });
  advance();
  expect(await t.mutation(api.autoVisits.record, { ...sample, timestamp: Date.now() })).toBe(false);
  vi.advanceTimersByTime(6 * 60000);
  expect(await t.mutation(api.autoVisits.record, { ...sample, timestamp: Date.now() })).toBe(false);
  expect((await stored(t)).unlocks).toHaveLength(0);
});

test('ambiguous clusters and retired destinations do not collect', async () => {
  const { t, landmarkId, destinationId, sample } = await world();
  const duplicate = await t.run(async ctx => {
    const landmark = (await ctx.db.get('landmarks', landmarkId))!;
    const { _id, _creationTime, ...fields } = landmark;
    return ctx.db.insert('landmarks', { ...fields, wikidataId: 'L2' });
  });
  expect(await t.mutation(api.autoVisits.photoUpload, { secret, ...point, assetKey, takenAt: Date.now(), day })).toBeNull();
  await t.run(async ctx => { await ctx.db.delete('landmarks', duplicate); await ctx.db.patch('destinations', destinationId, { status: 'retired' }); });
  await t.mutation(api.autoVisits.record, sample);
  advance();
  expect(await t.mutation(api.autoVisits.record, { ...sample, timestamp: Date.now() })).toBe(false);
});

test('device credentials require sign-in to enable and cannot be claimed or revoked by another user', async () => {
  const { t, ada, ben, sample } = await world();
  await expect(t.mutation(api.autoVisits.enable, { secret, photos: true })).rejects.toThrow();
  await expect(ben.as.mutation(api.autoVisits.enable, { secret, photos: true })).rejects.toThrow();
  await ben.as.mutation(api.autoVisits.disable, { secret });
  expect(await t.query(api.autoVisits.nearby, { secret, ...point })).toHaveLength(1);
  await ada.as.mutation(api.autoVisits.disable, { secret });
  await expect(t.mutation(api.autoVisits.record, sample)).rejects.toThrow();
  await expect(t.query(api.autoVisits.nearby, { secret, ...point })).rejects.toThrow();
});

test('photos establish a visit, append without replacing details, and deduplicate retries', async () => {
  const { t, ada, landmarkId, destinationId } = await world();
  await ada.as.mutation(api.places.addVisit, { destinationId });
  await ada.as.mutation(api.landmarkVisits.save, { landmarkId, visitedOn: '2026-11-01', note: 'Keep this note',
    companionIds: [], keepPhotoIds: [], newPhotos: [], stealth: true });
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' })));
  const args = { secret, ...point, assetKey, takenAt: Date.now(), day, storageId, width: 1000, height: 750 };
  expect(await t.mutation(api.autoVisits.photoUpload, { secret, ...point, assetKey, takenAt: Date.now(), day })).toEqual(expect.any(String));
  await t.mutation(api.autoVisits.attachPhoto, args);
  await t.mutation(api.autoVisits.attachPhoto, args);
  const state = await stored(t);
  expect(state.photos).toHaveLength(1);
  expect(state.photos[0].userId).toBe(ada.id);
  expect(state.unlocks[0]).toMatchObject({ note: 'Keep this note', visitedOn: '2026-11-01', verification: 'photo' });
  expect(await t.mutation(api.autoVisits.photoUpload, { secret, ...point, assetKey, takenAt: Date.now(), day })).toBeNull();
});

test('photo-only detection creates a private visit without a manual destination check-in', async () => {
  const { t } = await world();
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' })));
  await t.mutation(api.autoVisits.attachPhoto, { secret, ...point, assetKey, takenAt: Date.now(), day, storageId, width: 1000, height: 750 });
  const state = await stored(t);
  expect(state.visits[0].source).toBe('photo');
  expect(state.unlocks[0].verification).toBe('photo');
  expect(state.activities[0].visibility).toBe('private');
});

test('photos before opt-in, distant photos, revoked access, and invalid files are refused', async () => {
  const { t, ada } = await world();
  const args = { secret, ...point, assetKey, takenAt: Date.now(), day };
  expect(await t.mutation(api.autoVisits.photoUpload, { ...args, takenAt: Date.now() - 2000 })).toBeNull();
  expect(await t.mutation(api.autoVisits.photoUpload, { ...args, lat: 36 })).toBeNull();
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(['text'], { type: 'text/plain' })));
  await expect(t.mutation(api.autoVisits.attachPhoto, { ...args, storageId, width: 1000, height: 750 })).rejects.toThrow();
  await ada.as.mutation(api.autoVisits.enable, { secret, photos: false });
  await expect(t.mutation(api.autoVisits.photoUpload, args)).rejects.toThrow();
  await expect(t.mutation(api.autoVisits.attachPhoto, { ...args, storageId, width: 1000, height: 750 })).rejects.toThrow();
  expect((await stored(t)).visits).toHaveLength(0);
});

test('stops offering photo uploads when the landmark has ten photos', async () => {
  const { t } = await world();
  for (let i = 0; i < 10; i++) {
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' })));
    await t.mutation(api.autoVisits.attachPhoto, { secret, ...point, assetKey: i.toString(16).padStart(64, '0'),
      takenAt: Date.now(), day, storageId, width: 1000, height: 750 });
  }
  expect(await t.mutation(api.autoVisits.photoUpload, { secret, ...point, assetKey, takenAt: Date.now(), day })).toBeNull();
  expect((await stored(t)).photos).toHaveLength(10);
});
