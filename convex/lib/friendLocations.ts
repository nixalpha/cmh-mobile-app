import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { distanceKm } from './geo';
import { fold } from './text';
import { areFriends, isBlockedEitherWay } from './social';

export const LOCATION_TTL = 24 * 60 * 60 * 1000;
export const NEARBY_KM = 10;
export const CITY_RADIUS_KM = 25;
export const ALERT_COOLDOWN = 24 * 60 * 60 * 1000;
type Ctx = QueryCtx | MutationCtx;

export const settingsFor = (ctx: Ctx, userId: Id<'users'>) => ctx.db.query('locationSettings')
  .withIndex('by_userId', q => q.eq('userId', userId)).unique();
export const locationFor = (ctx: Ctx, userId: Id<'users'>) => ctx.db.query('friendLocations')
  .withIndex('by_userId', q => q.eq('userId', userId)).unique();
export const shareFor = (ctx: Ctx, userId: Id<'users'>, friendId: Id<'users'>) => ctx.db.query('locationShares')
  .withIndex('by_userId_and_friendId', q => q.eq('userId', userId).eq('friendId', friendId)).unique();

export function fresh(location: Doc<'friendLocations'> | null, now: number) {
  return location !== null && location.updatedAt > now - LOCATION_TTL;
}

// Every read and queued delivery rechecks the owner's current consent.
export async function visibleLocation(ctx: Ctx, ownerId: Id<'users'>, viewerId: Id<'users'>, now: number) {
  const [settings, share, friends, blocked, location] = await Promise.all([
    settingsFor(ctx, ownerId), shareFor(ctx, ownerId, viewerId),
    areFriends(ctx, ownerId, viewerId), isBlockedEitherWay(ctx, ownerId, viewerId), locationFor(ctx, ownerId),
  ]);
  return settings?.enabled && share && friends && !blocked && fresh(location, now) ? location : null;
}

export function inCity(location: Doc<'friendLocations'>, city: Doc<'destinations'>) {
  if (location.accuracy > 5000) return false;
  const nameMatches = location.city?.toLocaleLowerCase() === city.name.toLocaleLowerCase()
    && location.countryCode === city.countryCode;
  // A geocoded name must still be geographically plausible (duplicate city names).
  return distanceKm(location, city) + location.accuracy / 1000 <= (nameMatches ? 50 : CITY_RADIUS_KM);
}

export function nearby(a: Doc<'friendLocations'>, b: Doc<'friendLocations'>) {
  return a.accuracy <= 1000 && b.accuracy <= 1000
    && distanceKm(a, b) + (a.accuracy + b.accuracy) / 1000 <= NEARBY_KM;
}

export async function clearLocationShares(ctx: MutationCtx, a: Id<'users'>, b: Id<'users'>) {
  for (const [owner, viewer] of [[a, b], [b, a]]) {
    const share = await shareFor(ctx, owner, viewer);
    if (share) await ctx.db.delete('locationShares', share._id);
    for (const kind of ['nearby', 'city'] as const) {
      const alert = await ctx.db.query('locationAlerts').withIndex('by_userId_and_actorId_and_kind',
        q => q.eq('userId', viewer).eq('actorId', owner).eq('kind', kind)).unique();
      if (alert) await ctx.db.delete('locationAlerts', alert._id);
    }
  }
}

const DETECT_RADIUS_KM = 50;

// The catalog city a location falls in: the geocoded name first, then the city
// that owns the nearest landmark. Null when neither is close enough.
export async function detectCity(ctx: Ctx, at: { lat: number; lng: number; city?: string; countryCode?: string }) {
  const name = at.city ? fold(at.city) : '';
  if (name) {
    const matches = await ctx.db.query('destinations').withSearchIndex('search_searchText', q => q.search('searchText', name).eq('status', 'active'))
      .take(20);
    const best = matches.filter(city => city.kind === 'city' && (!at.countryCode || city.countryCode === at.countryCode))
      .map(city => ({ city, distance: distanceKm(at, city) })).filter(item => item.distance <= DETECT_RADIUS_KM)
      .sort((a, b) => a.distance - b.distance)[0];
    if (best) return best.city;
  }
  const delta = CITY_RADIUS_KM / 110;
  const landmarks = await ctx.db.query('landmarks').withIndex('by_status_and_lat', q =>
    q.eq('status', 'active').gte('lat', at.lat - delta).lte('lat', at.lat + delta)).take(500);
  const nearest = landmarks.map(landmark => ({ landmark, distance: distanceKm(at, landmark) }))
    .filter(item => item.distance <= CITY_RADIUS_KM).sort((a, b) => a.distance - b.distance)[0];
  if (!nearest) return null;
  const city = await ctx.db.get('destinations', nearest.landmark.destinationId);
  return city?.kind === 'city' && city.status === 'active' ? city : null;
}
