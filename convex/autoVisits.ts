import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireUser } from './lib/auth';
import { fail } from './lib/errors';
import { distanceKm, toPoint } from './lib/geo';
import { scheduleRecompute } from './lib/recommendations';
import { checkDay, createUnlock, ensureVisit, getVisit, MAX_PHOTOS, postUnlock, unlockPhotos } from './lib/visits';

type Ctx = QueryCtx | MutationCtx;
const pointArgs = { lat: v.number(), lng: v.number() };
const secretArgs = { secret: v.string() };
const RADIUS_KM = 0.15;
const MAX_AGE = 24 * 60 * 60 * 1000;

// A device credential can only collect visits/photos. It cannot read account data,
// publish posts, or edit/delete existing details. It survives short-lived login JWTs.
async function deviceFor(ctx: Ctx, secret: string) {
  if (!/^[a-f0-9-]{72}$/.test(secret)) fail('UNAUTHENTICATED', 'Automatic collection is off.');
  const device = await ctx.db.query('autoVisitDevices').withIndex('by_secret', q => q.eq('secret', secret)).unique();
  if (!device || !(await ctx.db.get('users', device.userId))) fail('UNAUTHENTICATED', 'Automatic collection is off.');
  return device;
}

async function candidates(ctx: Ctx, lat: number, lng: number, radiusKm: number) {
  if (!toPoint(lat, lng)) fail('INVALID', 'Invalid location.');
  const delta = radiusKm / 110;
  const rows = await ctx.db.query('landmarks').withIndex('by_status_and_lat', q =>
    q.eq('status', 'active').gte('lat', Math.max(-90, lat - delta)).lte('lat', Math.min(90, lat + delta))).take(2000);
  return rows.map(landmark => ({ landmark, distance: distanceKm({ lat, lng }, landmark) }))
    .filter(item => item.distance <= radiusKm).sort((a, b) => a.distance - b.distance);
}

async function match(ctx: Ctx, lat: number, lng: number, accuracy = 0) {
  const rows = await candidates(ctx, lat, lng, RADIUS_KM);
  const first = rows[0];
  if (!first || first.distance + accuracy / 1000 > RADIUS_KM) return null;
  // Dense clusters are ambiguous: don't assign someone's photo to an arbitrary site.
  if (rows[1] && rows[1].distance - first.distance < 0.04) return null;
  const destination = await ctx.db.get('destinations', first.landmark.destinationId);
  return destination?.status === 'active' ? { landmark: first.landmark, destination } : null;
}

export const enable = mutation({
  args: { ...secretArgs, photos: v.boolean() }, returns: v.number(),
  handler: async (ctx, { secret, photos }) => {
    const user = await requireUser(ctx);
    if (!/^[a-f0-9-]{72}$/.test(secret)) fail('INVALID', 'Invalid device credential.');
    const previous = await ctx.db.query('autoVisitDevices').withIndex('by_secret', q => q.eq('secret', secret)).unique();
    if (previous) {
      if (previous.userId !== user._id) fail('FORBIDDEN', 'This device belongs to another account.');
      await ctx.db.patch('autoVisitDevices', previous._id, { photos });
      return previous.enabledAt;
    }
    const devices = await ctx.db.query('autoVisitDevices').withIndex('by_userId', q => q.eq('userId', user._id)).take(10);
    if (devices.length >= 10) fail('LIMIT_REACHED', 'Turn off automatic collection on another device first.');
    const enabledAt = Date.now();
    await ctx.db.insert('autoVisitDevices', { userId: user._id, secret, photos, enabledAt });
    return enabledAt;
  },
});

export const disable = mutation({
  args: secretArgs, returns: v.null(),
  handler: async (ctx, { secret }) => {
    const user = await requireUser(ctx);
    const device = await ctx.db.query('autoVisitDevices').withIndex('by_secret', q => q.eq('secret', secret)).unique();
    if (device?.userId === user._id) await ctx.db.delete('autoVisitDevices', device._id);
    return null;
  },
});

export const nearby = query({
  args: { ...secretArgs, ...pointArgs },
  returns: v.array(v.object({ id: v.id('landmarks'), lat: v.number(), lng: v.number() })),
  handler: async (ctx, { secret, lat, lng }) => {
    const device = await deviceFor(ctx, secret);
    const result = [];
    for (const { landmark } of (await candidates(ctx, lat, lng, 15)).slice(0, 80)) {
      const unlock = await ctx.db.query('landmarkUnlocks').withIndex('by_userId_and_landmarkId', q =>
        q.eq('userId', device.userId).eq('landmarkId', landmark._id)).unique();
      if (!unlock) result.push({ id: landmark._id, lat: landmark.lat, lng: landmark.lng });
      if (result.length === 19) break;
    }
    return result;
  },
});

async function collect(ctx: MutationCtx, device: Doc<'autoVisitDevices'>,
  found: NonNullable<Awaited<ReturnType<typeof match>>>, day: string, verification: 'check_in' | 'photo') {
  const { landmark, destination } = found;
  const existing = await ctx.db.query('landmarkUnlocks').withIndex('by_userId_and_landmarkId', q =>
    q.eq('userId', device.userId).eq('landmarkId', landmark._id)).unique();
  if (existing) return existing._id;
  const when = checkDay(day);
  const previousVisit = await getVisit(ctx, device.userId, destination._id);
  await ensureVisit(ctx, device.userId, destination, previousVisit ? undefined : when);
  const visit = (await getVisit(ctx, device.userId, destination._id))!;
  if (!previousVisit) await ctx.db.patch('visits', visit._id, { source: verification });
  const created = await createUnlock(ctx, visit, landmark);
  await ctx.db.patch('landmarkUnlocks', created.unlockId, { verification, visitedOn: day });
  await postUnlock(ctx, { actorId: device.userId, landmark, unlockedCount: created.unlockedCount,
    visibility: 'private', standalone: true });
  await scheduleRecompute(ctx, device.userId);
  return created.unlockId;
}

export const record = mutation({
  args: { ...secretArgs, ...pointArgs, accuracy: v.number(), speed: v.optional(v.number()), timestamp: v.number(), day: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const device = await deviceFor(ctx, args.secret);
    checkDay(args.day);
    if (!Number.isFinite(args.timestamp) || args.timestamp < device.enabledAt || args.timestamp < Date.now() - MAX_AGE
      || args.timestamp > Date.now() + 60000) return false;
    if (device.candidate && args.timestamp <= device.candidate.lastAt) return false;
    const found = Number.isFinite(args.accuracy) && args.accuracy >= 0 && args.accuracy <= 75
      && (args.speed === undefined || (Number.isFinite(args.speed) && args.speed <= 2.5))
      ? await match(ctx, args.lat, args.lng, args.accuracy) : null;
    if (!found) { await ctx.db.patch('autoVisitDevices', device._id, { candidate: undefined }); return false; }
    const previous = device.candidate;
    const since = previous?.landmarkId === found.landmark._id && args.timestamp - previous.lastAt <= 5 * 60000
      ? previous.since : args.timestamp;
    await ctx.db.patch('autoVisitDevices', device._id, { candidate: { landmarkId: found.landmark._id, since, lastAt: args.timestamp } });
    if (args.timestamp - since < 60000) return false;
    await collect(ctx, device, found, args.day, 'check_in');
    return true;
  },
});

const photoArgs = { ...secretArgs, ...pointArgs, assetKey: v.string(), takenAt: v.number(), day: v.string() };
async function photoMatch(ctx: Ctx, args: { secret: string; lat: number; lng: number; assetKey: string; takenAt: number; day: string }) {
  const device = await deviceFor(ctx, args.secret);
  if (!device.photos) fail('FORBIDDEN', 'Automatic photo uploads are off.');
  if (!/^[a-f0-9]{64}$/.test(args.assetKey)) fail('INVALID', 'Invalid photo identifier.');
  checkDay(args.day);
  if (!Number.isFinite(args.takenAt) || args.takenAt < device.enabledAt || args.takenAt > Date.now() + 60000) return null;
  const receipt = await ctx.db.query('autoPhotoReceipts').withIndex('by_userId_and_assetKey', q =>
    q.eq('userId', device.userId).eq('assetKey', args.assetKey)).unique();
  if (receipt) return null;
  const found = await match(ctx, args.lat, args.lng);
  if (!found) return null;
  const unlock = await ctx.db.query('landmarkUnlocks').withIndex('by_userId_and_landmarkId', q =>
    q.eq('userId', device.userId).eq('landmarkId', found.landmark._id)).unique();
  if (unlock && (await unlockPhotos(ctx, unlock._id)).length >= MAX_PHOTOS) return null;
  return { device, found };
}

export const photoUpload = mutation({
  args: photoArgs, returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => (await photoMatch(ctx, args)) ? await ctx.storage.generateUploadUrl() : null,
});

export const attachPhoto = mutation({
  args: { ...photoArgs, storageId: v.id('_storage'), width: v.number(), height: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await photoMatch(ctx, args);
    if (!result) return null; // Idempotent retry after an interrupted upload response.
    const file = await ctx.db.system.get('_storage', args.storageId);
    if (!file || file.contentType !== 'image/jpeg' || file.size > 10 * 1024 * 1024
      || ![args.width, args.height].every(n => Number.isFinite(n) && n > 0 && n <= 2048)) fail('INVALID', 'Invalid photo upload.');
    const used = await ctx.db.query('landmarkPhotos').withIndex('by_storageId', q => q.eq('storageId', args.storageId)).unique();
    if (used) fail('CONFLICT', 'This photo is already attached.');
    const unlockId = await collect(ctx, result.device, result.found, args.day, 'photo');
    const photos = await unlockPhotos(ctx, unlockId);
    if (photos.length < MAX_PHOTOS) {
      await ctx.db.insert('landmarkPhotos', { userId: result.device.userId, unlockId,
        landmarkId: result.found.landmark._id, destinationId: result.found.destination._id,
        storageId: args.storageId, width: args.width, height: args.height, takenAt: args.takenAt, order: photos.length });
      const unlock = (await ctx.db.get('landmarkUnlocks', unlockId))!;
      if (unlock.verification !== 'check_in') await ctx.db.patch('landmarkUnlocks', unlockId, { verification: 'photo' });
    }
    await ctx.db.insert('autoPhotoReceipts', { userId: result.device.userId, assetKey: args.assetKey });
    return null;
  },
});
