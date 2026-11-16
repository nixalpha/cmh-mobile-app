import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { ALERT_COOLDOWN, LOCATION_TTL } from './lib/friendLocations';
import { befriend, setup, signUp, type Test } from './test.setup';

type Person = Awaited<ReturnType<typeof signUp>>;
const firstPage = { numItems: 30, cursor: null };
const paris = { lat: 48.8566, lng: 2.3522, accuracy: 20, city: 'Paris', countryCode: 'FR' };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function enable(person: Person) { await person.as.mutation(api.friendLocations.updateSettings, { enabled: true }); }
async function publish(person: Person, point = paris) {
  await person.as.mutation(api.friendLocations.updateLocation, point);
}
async function share(owner: Person, viewer: Person) {
  await owner.as.mutation(api.friendLocations.setSharing, { friendId: viewer.id, enabled: true });
}
async function friendsOf(person: Person, now = Date.now()) {
  return (await person.as.query(api.friendLocations.friends, { now, paginationOpts: firstPage })).page;
}
async function alertsOf(person: Person) {
  return (await person.as.query(api.friendLocations.alerts, { now: Date.now(), paginationOpts: firstPage })).page;
}
async function evaluate(t: Test, person: Person) {
  await t.mutation(internal.friendLocations.evaluateFriends, { userId: person.id, cursor: null });
}
async function seedCity(t: Test, name = 'Paris', lat = paris.lat, lng = paris.lng) {
  return t.run(ctx => ctx.db.insert('destinations', { wikidataId: `test-${name}`, kind: 'city', name, searchText: name.toLowerCase(),
    countryCode: 'FR', countryName: 'France', lat, lng, popularity: 1, tier: 1, landmarkCount: 0, status: 'active', importedAt: 1 }));
}
async function pair() {
  const t = setup(); const alice = await signUp(t, 'alice'); const bob = await signUp(t, 'bob');
  await befriend(alice, bob);
  return { t, alice, bob };
}

test('location APIs require authentication and sharing starts off', async () => {
  const { t, alice, bob } = await pair();
  expect(await alice.as.query(api.friendLocations.settings, { now: Date.now() })).toMatchObject({ enabled: false, location: null });
  await expect(publish(alice)).rejects.toThrow(/FORBIDDEN/);
  for (const call of [
    t.query(api.friendLocations.settings, { now: Date.now() }),
    t.query(api.friendLocations.friends, { now: Date.now(), paginationOpts: firstPage }),
    t.query(api.friendLocations.alerts, { now: Date.now(), paginationOpts: firstPage }),
    t.mutation(api.friendLocations.updateSettings, { enabled: true }),
    t.mutation(api.friendLocations.updateLocation, paris),
    t.mutation(api.friendLocations.setSharing, { friendId: bob.id, enabled: true }),
    t.mutation(api.friendLocations.registerPushToken, { token: 'ExpoPushToken[test]', enabled: true }),
  ]) await expect(call).rejects.toThrow(/UNAUTHENTICATED/);
});

test('precise coordinates are visible only to individually approved, accepted friends', async () => {
  const { t, alice, bob } = await pair(); const carol = await signUp(t, 'carol'); await befriend(alice, carol);
  await enable(alice); await publish(alice);
  expect((await friendsOf(bob))[0].location).toBeNull();
  await share(alice, bob);
  expect((await friendsOf(bob))[0].location).toMatchObject(paris);
  expect((await friendsOf(carol))[0].location).toBeNull();
  expect((await friendsOf(alice)).every(row => row.location === null)).toBe(true);
  const stranger = await signUp(t, 'stranger');
  await expect(share(alice, stranger)).rejects.toThrow(/FORBIDDEN/);
  expect(await friendsOf(stranger)).toEqual([]);
});

test('pausing deletes the stored location and refuses pending GPS writes', async () => {
  const { t, alice, bob } = await pair(); await enable(alice); await publish(alice); await share(alice, bob);
  await alice.as.mutation(api.friendLocations.updateSettings, { enabled: false });
  expect((await friendsOf(bob))[0].location).toBeNull();
  expect(await t.run(ctx => ctx.db.query('friendLocations').withIndex('by_userId', q => q.eq('userId', alice.id)).unique())).toBeNull();
  await expect(publish(alice)).rejects.toThrow(/FORBIDDEN/);
});

test('revoking a share hides the map location, alert, and queued push', async () => {
  const { t, alice, bob } = await pair(); await enable(alice); await enable(bob);
  await publish(alice); await publish(bob); await share(alice, bob); await evaluate(t, alice);
  const [alert] = await alertsOf(bob); expect(alert.kind).toBe('nearby');
  await alice.as.mutation(api.friendLocations.setSharing, { friendId: bob.id, enabled: false });
  expect((await friendsOf(bob))[0].location).toBeNull(); expect(await alertsOf(bob)).toEqual([]);
  expect(await t.query(internal.locationPush.payload, { alertId: alert._id, eventTime: alert.eventTime, now: Date.now() })).toBeNull();
});

test('unfriending and re-friending never restore a former sharing grant', async () => {
  const { alice, bob } = await pair(); await enable(alice); await publish(alice); await share(alice, bob); await share(bob, alice);
  await alice.as.mutation(api.friends.unfriend, { userId: bob.id });
  expect(await friendsOf(bob)).toEqual([]);
  await befriend(alice, bob);
  expect((await friendsOf(bob))[0]).toMatchObject({ sharingWith: false, location: null });
  expect((await friendsOf(alice))[0].sharingWith).toBe(false);
});

test('blocking immediately hides coordinates and clears both sharing grants', async () => {
  const { t, alice, bob } = await pair(); await enable(alice); await publish(alice); await share(alice, bob);
  await bob.as.mutation(api.friends.block, { userId: alice.id });
  expect(await friendsOf(bob)).toEqual([]);
  expect(await t.run(ctx => ctx.db.query('locationShares').take(10))).toEqual([]);
});

test('expired locations disappear on reads and scheduled cleanup preserves newer updates', async () => {
  const { t, alice, bob } = await pair(); await enable(alice); await publish(alice); await share(alice, bob);
  const oldTime = (await alice.as.query(api.friendLocations.settings, { now: Date.now() })).location!.updatedAt;
  expect((await friendsOf(bob, oldTime + LOCATION_TTL))[0].location).toBeNull();
  vi.setSystemTime(oldTime + 60000); await publish(alice);
  await t.mutation(internal.friendLocations.expire, { userId: alice.id, updatedAt: oldTime });
  expect((await friendsOf(bob))[0].location).not.toBeNull();
  const latest = (await alice.as.query(api.friendLocations.settings, { now: Date.now() })).location!.updatedAt;
  await t.mutation(internal.friendLocations.expire, { userId: alice.id, updatedAt: latest });
  expect((await friendsOf(bob))[0].location).toBeNull();
});

test('nearby alerts are deduplicated and respect both preferences and GPS uncertainty', async () => {
  const { t, alice, bob } = await pair(); await enable(alice); await enable(bob); await share(alice, bob);
  await publish(alice); await publish(bob); await evaluate(t, alice); await evaluate(t, bob);
  expect(await alertsOf(bob)).toHaveLength(1); expect(await alertsOf(alice)).toHaveLength(0);
  const first = (await alertsOf(bob))[0];
  vi.setSystemTime(Date.now() + 60000); await publish(alice); await evaluate(t, alice);
  expect((await alertsOf(bob))[0].eventTime).toBe(first.eventTime);
  await bob.as.mutation(api.friendLocations.updateSettings, { nearbyAlerts: false });
  expect(await alertsOf(bob)).toEqual([]);
  await bob.as.mutation(api.friendLocations.updateSettings, { nearbyAlerts: true });
  vi.setSystemTime(Date.now() + ALERT_COOLDOWN); await publish(alice); await publish(bob, { ...paris, accuracy: 2000 }); await evaluate(t, alice);
  expect(await alertsOf(bob)).toEqual([]);
});

test('visiting-city alerts work without the visitor sharing their own location', async () => {
  const { t, alice, bob } = await pair(); const city = await seedCity(t);
  await bob.as.mutation(api.friendLocations.updateSettings, { visitingDestinationId: city });
  await enable(alice); await publish(alice); await share(alice, bob); await evaluate(t, alice);
  expect(await alertsOf(bob)).toMatchObject([{ kind: 'city', cityName: 'Paris' }]);
  expect((await friendsOf(bob))[0]).toMatchObject({ distance: null, inVisitingCity: true });
  await bob.as.mutation(api.friendLocations.updateSettings, { cityAlerts: false });
  expect(await alertsOf(bob)).toEqual([]);
});

test('changing visiting city invalidates old city alerts and rejects non-city destinations', async () => {
  const { t, alice, bob } = await pair(); const city = await seedCity(t); const other = await seedCity(t, 'Lyon', 45.764, 4.8357);
  await bob.as.mutation(api.friendLocations.updateSettings, { visitingDestinationId: city });
  await enable(alice); await publish(alice); await share(alice, bob); await evaluate(t, alice);
  const [alert] = await alertsOf(bob);
  await bob.as.mutation(api.friendLocations.updateSettings, { visitingDestinationId: other });
  expect(await alertsOf(bob)).toEqual([]);
  expect(await t.query(internal.locationPush.payload, { alertId: alert._id, eventTime: alert.eventTime, now: Date.now() })).toBeNull();
  await t.run(ctx => ctx.db.patch('destinations', city, { kind: 'region' }));
  await expect(bob.as.mutation(api.friendLocations.updateSettings, { visitingDestinationId: city })).rejects.toThrow(/INVALID/);
});

test('a shared city name cannot create an alert across the globe', async () => {
  const { t, alice, bob } = await pair(); const city = await seedCity(t);
  await bob.as.mutation(api.friendLocations.updateSettings, { visitingDestinationId: city });
  await enable(alice); await publish(alice, { ...paris, lat: -33.87, lng: 151.2 }); await share(alice, bob); await evaluate(t, alice);
  expect(await alertsOf(bob)).toEqual([]);
});

test('invalid coordinates and accuracy are rejected; rapid device updates are bounded', async () => {
  const { t, alice } = await pair(); await enable(alice);
  for (const data of [{ ...paris, lat: 91 }, { ...paris, lng: -181 }, { ...paris, accuracy: -1 }, { ...paris, accuracy: Infinity }]) {
    await expect(alice.as.mutation(api.friendLocations.updateLocation, data)).rejects.toThrow(/INVALID/);
  }
  await publish(alice); await publish(alice, { ...paris, lat: 0 });
  const location = await t.run(ctx => ctx.db.query('friendLocations').withIndex('by_userId', q => q.eq('userId', alice.id)).unique());
  expect(location?.lat).toBe(paris.lat);
});

test('alert read state belongs to its recipient and suppresses queued push delivery', async () => {
  const { t, alice, bob } = await pair(); await enable(alice); await enable(bob); await publish(alice); await publish(bob); await share(alice, bob); await evaluate(t, alice);
  const [alert] = await alertsOf(bob);
  await expect(alice.as.mutation(api.friendLocations.markAlertRead, { alertId: alert._id })).rejects.toThrow(/NOT_FOUND/);
  await bob.as.mutation(api.friendLocations.markAlertRead, { alertId: alert._id });
  expect((await alertsOf(bob))[0].read).toBe(true);
  expect(await t.query(internal.locationPush.payload, { alertId: alert._id, eventTime: alert.eventTime, now: Date.now() })).toBeNull();
});

test('device tokens transfer on account change and one account cannot unregister another', async () => {
  const { t, alice, bob } = await pair(); const token = 'ExpoPushToken[test-device]';
  await alice.as.mutation(api.friendLocations.registerPushToken, { token, enabled: true });
  await bob.as.mutation(api.friendLocations.registerPushToken, { token, enabled: true });
  await alice.as.mutation(api.friendLocations.registerPushToken, { token, enabled: false });
  expect(await t.run(ctx => ctx.db.query('locationPushTokens').take(10))).toMatchObject([{ userId: bob.id, token }]);
  await bob.as.mutation(api.friendLocations.registerPushToken, { token, enabled: false });
  expect(await t.run(ctx => ctx.db.query('locationPushTokens').take(10))).toEqual([]);
  await expect(alice.as.mutation(api.friendLocations.registerPushToken, { token: 'invalid', enabled: true })).rejects.toThrow(/INVALID/);
});

const deviceSecret = 'a'.repeat(72);
const devicePoint = { lat: paris.lat, lng: paris.lng, accuracy: paris.accuracy };
test('background credentials can only update their owner and cannot access private reads', async () => {
  const { t, alice, bob } = await pair(); await enable(alice); await share(alice, bob);
  await alice.as.mutation(api.friendLocations.registerBackgroundDevice, { secret: deviceSecret, enabled: true });
  await t.mutation(api.friendLocations.updateFromDevice, { secret: deviceSecret, ...devicePoint, capturedAt: Date.now() });
  expect((await friendsOf(bob))[0].location).toMatchObject({ lat: paris.lat });
  await expect(bob.as.mutation(api.friendLocations.registerBackgroundDevice, { secret: deviceSecret, enabled: true })).rejects.toThrow(/FORBIDDEN/);
  await expect(t.query(api.friendLocations.get, { friendId: alice.id, now: Date.now() })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.friendLocations.updateFromDevice, { secret: 'b'.repeat(72), ...devicePoint, capturedAt: Date.now() })).rejects.toThrow(/UNAUTHENTICATED/);
});

test('pausing location revokes every background credential permanently, including after resume', async () => {
  const { t, alice } = await pair(); await enable(alice);
  await alice.as.mutation(api.friendLocations.registerBackgroundDevice, { secret: deviceSecret, enabled: true });
  await alice.as.mutation(api.friendLocations.updateSettings, { enabled: false });
  await enable(alice);
  await expect(t.mutation(api.friendLocations.updateFromDevice, { secret: deviceSecret, ...devicePoint, capturedAt: Date.now() })).rejects.toThrow(/UNAUTHENTICATED/);
  expect(await t.run(ctx => ctx.db.query('locationDevices').take(10))).toEqual([]);
});

test('background writes reject stale or future positions and stop after device sign-out', async () => {
  const { t, alice } = await pair(); await enable(alice);
  await alice.as.mutation(api.friendLocations.registerBackgroundDevice, { secret: deviceSecret, enabled: true });
  for (const capturedAt of [Date.now() - 180000, Date.now() + 60000, Infinity]) {
    await expect(t.mutation(api.friendLocations.updateFromDevice, { secret: deviceSecret, ...devicePoint, capturedAt })).rejects.toThrow(/INVALID/);
  }
  await alice.as.mutation(api.friendLocations.registerBackgroundDevice, { secret: deviceSecret, enabled: false });
  await expect(t.mutation(api.friendLocations.updateFromDevice, { secret: deviceSecret, ...devicePoint, capturedAt: Date.now() })).rejects.toThrow(/UNAUTHENTICATED/);
});

test('selecting a friend from a later map page still checks their current sharing grant', async () => {
  const { t, alice, bob } = await pair(); const stranger = await signUp(t, 'stranger');
  await enable(alice); await publish(alice);
  expect(await bob.as.query(api.friendLocations.get, { friendId: alice.id, now: Date.now() })).toBeNull();
  await share(alice, bob);
  expect(await bob.as.query(api.friendLocations.get, { friendId: alice.id, now: Date.now() })).toMatchObject({ user: { _id: alice.id }, location: paris });
  expect(await stranger.as.query(api.friendLocations.get, { friendId: alice.id, now: Date.now() })).toBeNull();
});

test('publishing a location sets the visiting city from the geocoded name', async () => {
  const { t, alice } = await pair(); await seedCity(t); await seedCity(t, 'Lyon', 45.764, 4.8357);
  await enable(alice); await publish(alice);
  expect((await alice.as.query(api.friendLocations.settings, { now: Date.now() })).visitingCity).toMatchObject({ name: 'Paris' });
  vi.setSystemTime(Date.now() + 60000);
  await publish(alice, { lat: -33.87, lng: 151.2, accuracy: 20, city: 'Paris', countryCode: 'FR' });
  expect((await alice.as.query(api.friendLocations.settings, { now: Date.now() })).visitingCity).toBeNull();
});
