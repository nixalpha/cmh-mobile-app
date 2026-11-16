import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { requireUser } from './lib/auth';
import { fail } from './lib/errors';
import { ALERT_COOLDOWN, fresh, inCity, LOCATION_TTL, locationFor, nearby, settingsFor, shareFor, visibleLocation } from './lib/friendLocations';
import { distanceKm, toPoint } from './lib/geo';
import { areFriends, isBlockedEitherWay } from './lib/social';
import { toSummary, userSummaryValidator } from './users';

const point = v.object({ lat: v.number(), lng: v.number(), accuracy: v.number(),
  city: v.union(v.string(), v.null()), countryCode: v.union(v.string(), v.null()), updatedAt: v.number() });
const citySummary = v.object({ _id: v.id('destinations'), name: v.string(), countryName: v.string() });
const present = (p: NonNullable<Awaited<ReturnType<typeof locationFor>>>) => ({
  lat: p.lat, lng: p.lng, accuracy: p.accuracy, city: p.city ?? null, countryCode: p.countryCode ?? null, updatedAt: p.updatedAt,
});

export const settings = query({
  args: { now: v.number() },
  returns: v.object({ enabled: v.boolean(), nearbyAlerts: v.boolean(), cityAlerts: v.boolean(),
    visitingCity: v.union(citySummary, v.null()), location: v.union(point, v.null()) }),
  handler: async (ctx, { now }) => {
    const me = await requireUser(ctx);
    const [settings, location] = await Promise.all([settingsFor(ctx, me._id), locationFor(ctx, me._id)]);
    const city = settings?.visitingDestinationId ? await ctx.db.get('destinations', settings.visitingDestinationId) : null;
    return { enabled: settings?.enabled ?? false, nearbyAlerts: settings?.nearbyAlerts ?? true,
      cityAlerts: settings?.cityAlerts ?? true,
      visitingCity: city ? { _id: city._id, name: city.name, countryName: city.countryName } : null,
      location: settings?.enabled && location && fresh(location, now) ? present(location) : null };
  },
});

export const updateSettings = mutation({
  args: { enabled: v.optional(v.boolean()), nearbyAlerts: v.optional(v.boolean()), cityAlerts: v.optional(v.boolean()),
    visitingDestinationId: v.optional(v.union(v.id('destinations'), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (args.visitingDestinationId) {
      const city = await ctx.db.get('destinations', args.visitingDestinationId);
      if (!city || city.kind !== 'city' || city.status !== 'active') fail('INVALID', 'Choose an active city.');
    }
    const existing = await settingsFor(ctx, me._id);
    const value = { userId: me._id, enabled: args.enabled ?? existing?.enabled ?? false,
      nearbyAlerts: args.nearbyAlerts ?? existing?.nearbyAlerts ?? true,
      cityAlerts: args.cityAlerts ?? existing?.cityAlerts ?? true,
      visitingDestinationId: args.visitingDestinationId === null ? undefined : args.visitingDestinationId ?? existing?.visitingDestinationId };
    if (existing) await ctx.db.replace('locationSettings', existing._id, value);
    else await ctx.db.insert('locationSettings', value);
    if (!value.enabled) {
      const location = await locationFor(ctx, me._id);
      if (location) await ctx.db.delete('friendLocations', location._id);
      const devices = await ctx.db.query('locationDevices').withIndex('by_userId', q => q.eq('userId', me._id)).take(10);
      for (const device of devices) await ctx.db.delete('locationDevices', device._id);
    }
    await ctx.scheduler.runAfter(0, internal.friendLocations.evaluateFriends, { userId: me._id, cursor: null });
    return null;
  },
});

export const setSharing = mutation({
  args: { friendId: v.id('users'), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { friendId, enabled }) => {
    const me = await requireUser(ctx);
    if (!(await areFriends(ctx, me._id, friendId)) || await isBlockedEitherWay(ctx, me._id, friendId)) {
      fail('FORBIDDEN', 'You can only share with an accepted friend.');
    }
    const share = await shareFor(ctx, me._id, friendId);
    if (enabled && !share) await ctx.db.insert('locationShares', { userId: me._id, friendId });
    if (!enabled && share) await ctx.db.delete('locationShares', share._id);
    if (enabled) await ctx.scheduler.runAfter(0, internal.friendLocations.evaluateFriends, { userId: me._id, cursor: null });
    return null;
  },
});

const locationArgs = { lat: v.number(), lng: v.number(), accuracy: v.number(), city: v.optional(v.string()), countryCode: v.optional(v.string()) };
async function persistLocation(ctx: MutationCtx, userId: Id<'users'>, args: {
  lat: number; lng: number; accuracy: number; city?: string; countryCode?: string;
}) {
  if (!(await settingsFor(ctx, userId))?.enabled) fail('FORBIDDEN', 'Enable location sharing first.');
  if (!toPoint(args.lat, args.lng) || !Number.isFinite(args.accuracy) || args.accuracy < 0 || args.accuracy > 100000) {
    fail('INVALID', 'Could not use that location.');
  }
  const previous = await locationFor(ctx, userId);
  const updatedAt = Date.now();
  if (previous && updatedAt - previous.updatedAt < 30000) return null;
  const value = { userId, ...args, city: args.city?.trim().slice(0, 100) || undefined,
    countryCode: args.countryCode?.trim().toUpperCase().slice(0, 2) || undefined, updatedAt };
  if (previous) await ctx.db.replace('friendLocations', previous._id, value);
  else await ctx.db.insert('friendLocations', value);
  await ctx.scheduler.runAfter(LOCATION_TTL, internal.friendLocations.expire, { userId, updatedAt });
  await ctx.scheduler.runAfter(0, internal.friendLocations.evaluateFriends, { userId, cursor: null });
  return null;
}

export const updateLocation = mutation({
  args: locationArgs, returns: v.null(),
  handler: async (ctx, args) => persistLocation(ctx, (await requireUser(ctx))._id, args),
});

// Scoped device credentials allow background GPS writes after a login JWT expires.
// They cannot read locations, change sharing grants, or call other account APIs.
export const registerBackgroundDevice = mutation({
  args: { secret: v.string(), enabled: v.boolean() }, returns: v.null(),
  handler: async (ctx, { secret, enabled }) => {
    const me = await requireUser(ctx);
    if (!/^[a-f0-9-]{72}$/.test(secret)) fail('INVALID', 'Invalid device credential.');
    const existing = await ctx.db.query('locationDevices').withIndex('by_secret', q => q.eq('secret', secret)).unique();
    if (existing && existing.userId !== me._id) fail('FORBIDDEN', 'This device belongs to another account.');
    if (!enabled) {
      if (existing) await ctx.db.delete('locationDevices', existing._id);
      return null;
    }
    if (!(await settingsFor(ctx, me._id))?.enabled) fail('FORBIDDEN', 'Enable location sharing first.');
    if (existing) return null;
    const devices = await ctx.db.query('locationDevices').withIndex('by_userId', q => q.eq('userId', me._id)).take(10);
    if (devices.length >= 10) fail('LIMIT_REACHED', 'Turn off background sharing on another device first.');
    await ctx.db.insert('locationDevices', { userId: me._id, secret });
    return null;
  },
});

export const updateFromDevice = mutation({
  args: { secret: v.string(), lat: v.number(), lng: v.number(), accuracy: v.number(), capturedAt: v.number() }, returns: v.null(),
  handler: async (ctx, { secret, capturedAt, ...point }) => {
    if (!/^[a-f0-9-]{72}$/.test(secret)) fail('UNAUTHENTICATED', 'Background sharing is off.');
    const device = await ctx.db.query('locationDevices').withIndex('by_secret', q => q.eq('secret', secret)).unique();
    if (!device || !(await ctx.db.get('users', device.userId))) fail('UNAUTHENTICATED', 'Background sharing is off.');
    if (!Number.isFinite(capturedAt) || capturedAt < Date.now() - 120000 || capturedAt > Date.now() + 30000) {
      fail('INVALID', 'That location is no longer current.');
    }
    return persistLocation(ctx, device.userId, point);
  },
});

export const expire = internalMutation({
  args: { userId: v.id('users'), updatedAt: v.number() }, returns: v.null(),
  handler: async (ctx, { userId, updatedAt }) => {
    const location = await locationFor(ctx, userId);
    if (location?.updatedAt === updatedAt) await ctx.db.delete('friendLocations', location._id);
    return null;
  },
});

export const friends = query({
  args: { now: v.number(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ user: userSummaryValidator, sharingWith: v.boolean(),
    location: v.union(point, v.null()), distance: v.union(v.number(), v.null()), inVisitingCity: v.boolean() })),
  handler: async (ctx, { now, paginationOpts }) => {
    const me = await requireUser(ctx);
    const [own, settings, result] = await Promise.all([locationFor(ctx, me._id), settingsFor(ctx, me._id),
      ctx.db.query('friendships').withIndex('by_userId_and_friendId', q => q.eq('userId', me._id)).paginate(paginationOpts)]);
    const city = settings?.visitingDestinationId ? await ctx.db.get('destinations', settings.visitingDestinationId) : null;
    const page = [];
    for (const friendship of result.page) {
      const user = await ctx.db.get('users', friendship.friendId);
      if (!user || await isBlockedEitherWay(ctx, me._id, user._id)) continue;
      const [location, share] = await Promise.all([visibleLocation(ctx, user._id, me._id, now), shareFor(ctx, me._id, user._id)]);
      page.push({ user: toSummary(user), sharingWith: !!share, location: location ? present(location) : null,
        distance: location && own && settings?.enabled && fresh(own, now) ? distanceKm(own, location) : null,
        inVisitingCity: !!(location && city && inCity(location, city)) });
    }
    return { ...result, page };
  },
});

export const evaluateFriends = internalMutation({
  args: { userId: v.id('users'), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, { userId, cursor }) => {
    const result = await ctx.db.query('friendships').withIndex('by_userId_and_friendId', q => q.eq('userId', userId))
      .paginate({ numItems: 20, cursor });
    const now = Date.now();
    for (const friend of result.page) {
      for (const [viewerId, actorId] of [[userId, friend.friendId], [friend.friendId, userId]]) {
        const settings = await settingsFor(ctx, viewerId);
        if (!settings) continue;
        const location = await visibleLocation(ctx, actorId, viewerId, now);
        if (!location) continue;
        const own = settings.enabled ? await locationFor(ctx, viewerId) : null;
        const city = settings.visitingDestinationId ? await ctx.db.get('destinations', settings.visitingDestinationId) : null;
        const kind: 'nearby' | 'city' | null = settings.nearbyAlerts && own && fresh(own, now) && nearby(own, location) ? 'nearby'
          : settings.cityAlerts && city && inCity(location, city) ? 'city' : null;
        if (!kind) continue;
        const existing = await ctx.db.query('locationAlerts').withIndex('by_userId_and_actorId_and_kind',
          q => q.eq('userId', viewerId).eq('actorId', actorId).eq('kind', kind)).unique();
        const destinationId = kind === 'city' ? city!._id : undefined;
        if (existing && existing.destinationId === destinationId && now - existing.eventTime < ALERT_COOLDOWN) continue;
        const value = { userId: viewerId, actorId, kind, destinationId, eventTime: now, read: false };
        const alertId: Id<'locationAlerts'> = existing ? existing._id : await ctx.db.insert('locationAlerts', value);
        if (existing) await ctx.db.replace('locationAlerts', alertId, value);
        await ctx.scheduler.runAfter(0, internal.locationPush.send, { alertId, eventTime: now, attempt: 0 });
      }
    }
    if (!result.isDone) await ctx.scheduler.runAfter(0, internal.friendLocations.evaluateFriends, { userId, cursor: result.continueCursor });
    return null;
  },
});

export const alerts = query({
  args: { now: v.number(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ _id: v.id('locationAlerts'), actor: userSummaryValidator,
    kind: v.union(v.literal('nearby'), v.literal('city')), cityName: v.union(v.string(), v.null()),
    eventTime: v.number(), read: v.boolean() })),
  handler: async (ctx, { now, paginationOpts }) => {
    const me = await requireUser(ctx);
    const settings = await settingsFor(ctx, me._id);
    const result = await ctx.db.query('locationAlerts').withIndex('by_userId_and_eventTime', q => q.eq('userId', me._id))
      .order('desc').paginate(paginationOpts);
    const page = [];
    for (const alert of result.page) {
      if (alert.eventTime <= now - LOCATION_TTL || !settings) continue;
      if (alert.kind === 'nearby' ? !settings.nearbyAlerts : !settings.cityAlerts || alert.destinationId !== settings.visitingDestinationId) continue;
      if (!(await visibleLocation(ctx, alert.actorId, me._id, now))) continue;
      const actor = await ctx.db.get('users', alert.actorId);
      const city = alert.destinationId ? await ctx.db.get('destinations', alert.destinationId) : null;
      if (actor) page.push({ _id: alert._id, actor: toSummary(actor), kind: alert.kind, cityName: city?.name ?? null, eventTime: alert.eventTime, read: alert.read });
    }
    return { ...result, page };
  },
});

export const markAlertRead = mutation({
  args: { alertId: v.id('locationAlerts') }, returns: v.null(),
  handler: async (ctx, { alertId }) => {
    const me = await requireUser(ctx);
    const alert = await ctx.db.get('locationAlerts', alertId);
    if (!alert || alert.userId !== me._id) fail('NOT_FOUND', 'That alert is unavailable.');
    await ctx.db.patch('locationAlerts', alertId, { read: true });
    return null;
  },
});

export const registerPushToken = mutation({
  args: { token: v.string(), enabled: v.boolean() }, returns: v.null(),
  handler: async (ctx, { token, enabled }) => {
    const me = await requireUser(ctx);
    if (!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token) || token.length > 200) fail('INVALID', 'Invalid push token.');
    const previous = await ctx.db.query('locationPushTokens').withIndex('by_token', q => q.eq('token', token)).unique();
    if (previous && (enabled || previous.userId === me._id)) await ctx.db.delete('locationPushTokens', previous._id);
    if (enabled) {
      const tokens = await ctx.db.query('locationPushTokens').withIndex('by_userId', q => q.eq('userId', me._id)).take(10);
      if (tokens.length >= 10) await ctx.db.delete('locationPushTokens', tokens[0]._id);
      await ctx.db.insert('locationPushTokens', { userId: me._id, token });
    }
    return null;
  },
});

// Used only by the push action, never exposed to clients.
export const deletePushToken = internalMutation({
  args: { tokenId: v.id('locationPushTokens') }, returns: v.null(),
  handler: async (ctx, { tokenId }) => { await ctx.db.delete('locationPushTokens', tokenId); return null; },
});


export const get = query({
  args: { friendId: v.id('users'), now: v.number() },
  returns: v.union(v.null(), v.object({ user: userSummaryValidator, location: point })),
  handler: async (ctx, { friendId, now }) => {
    const me = await requireUser(ctx);
    const location = await visibleLocation(ctx, friendId, me._id, now);
    if (!location) return null;
    const user = await ctx.db.get('users', friendId);
    return user ? { user: toSummary(user), location: present(location) } : null;
  },
});
