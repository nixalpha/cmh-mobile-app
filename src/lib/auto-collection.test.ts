import { beforeEach, expect, test, vi } from 'vitest';
import { anyApi, getFunctionName } from 'convex/server';
import type { ConvexReactClient } from 'convex/react';
import type { Id } from '../../convex/_generated/dataModel';
import { disableAutoCollection, enableAutoCollection, syncAutoCollection } from './auto-collection.ios';

const mock = vi.hoisted(() => {
  const store = new Map<string, string>();
  const position = { coords: { latitude: 35, longitude: 135.7, accuracy: 10, speed: 0 }, timestamp: Date.now() };
  return { store, position, handlers: new Map<string, (body: unknown) => Promise<void>>(),
    mutation: vi.fn(), query: vi.fn(), start: vi.fn(), stop: vi.fn(), fences: vi.fn(), stopFences: vi.fn(),
    metadata: vi.fn(), getLocation: vi.fn(), getInfo: vi.fn(), prepare: vi.fn(), upload: vi.fn(),
    gte: vi.fn(), offset: vi.fn() };
});
vi.mock('@/lib/backend', () => ({ api: anyApi }));
vi.mock('@/lib/exif', () => ({ localDay: (date: Date) => date.toISOString().slice(0, 10) }));
vi.mock('@/lib/photo-upload', () => ({ preparePhoto: mock.prepare, uploadPhoto: mock.upload }));
vi.mock('convex/browser', () => ({ ConvexHttpClient: class { mutation = mock.mutation; query = mock.query; } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111',
  digestStringAsync: async () => 'a'.repeat(64), CryptoDigestAlgorithm: { SHA256: 'SHA256' } }));
vi.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-unlock',
  getItemAsync: async (key: string) => mock.store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mock.store.set(key, value); },
  deleteItemAsync: async (key: string) => { mock.store.delete(key); } }));
vi.mock('expo-task-manager', () => ({ isAvailableAsync: async () => true,
  defineTask: (name: string, handler: (body: unknown) => Promise<void>) => mock.handlers.set(name, handler) }));
vi.mock('expo-location', () => ({
  Accuracy: { High: 6, Balanced: 3 }, ActivityType: { OtherNavigation: 4 },
  isBackgroundLocationAvailableAsync: async () => true,
  requestForegroundPermissionsAsync: async () => ({ granted: true }),
  requestBackgroundPermissionsAsync: async () => ({ granted: true }),
  getBackgroundPermissionsAsync: async () => ({ granted: true }),
  getCurrentPositionAsync: async () => mock.position,
  hasStartedLocationUpdatesAsync: async () => true, hasStartedGeofencingAsync: async () => false,
  startLocationUpdatesAsync: mock.start, stopLocationUpdatesAsync: mock.stop,
  startGeofencingAsync: mock.fences, stopGeofencingAsync: mock.stopFences,
}));
vi.mock('expo-media-library', () => ({
  AssetField: { MEDIA_TYPE: 'mediaType', CREATION_TIME: 'creationTime' }, MediaType: { IMAGE: 'image' },
  getPermissionsAsync: async () => ({ granted: true, accessPrivileges: 'all' }),
  requestPermissionsAsync: async () => ({ granted: true, accessPrivileges: 'all' }), addListener: () => ({ remove() {} }),
  Asset: class { getLocation = mock.getLocation; getInfo = mock.getInfo; },
  Query: class {
    eq() { return this; } orderBy() { return this; } limit() { return this; }
    gte(...args: unknown[]) { mock.gte(...args); return this; }
    offset(value: number) { mock.offset(value); return this; }
    exeForMetadata = mock.metadata;
  },
}));

const userId = 'user-1' as Id<'users'>;
const client = { mutation: mock.mutation } as unknown as ConvexReactClient;
const name = (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref);

beforeEach(() => {
  vi.clearAllMocks();
  mock.store.clear();
  process.env.EXPO_PUBLIC_CONVEX_URL = 'https://test.convex.cloud';
  mock.position.timestamp = Date.now();
  mock.mutation.mockImplementation(async ref => name(ref) === 'autoVisits:enable' ? Date.now() - 1000 : null);
  mock.query.mockResolvedValue([]);
  mock.metadata.mockResolvedValue([]);
  mock.getLocation.mockResolvedValue({ latitude: 35, longitude: 135.7 });
  mock.getInfo.mockResolvedValue({ uri: 'file://photo.heic', width: 3000, height: 2000 });
  mock.prepare.mockResolvedValue({ uri: 'file://resized.jpg', width: 2048, height: 1365 });
  mock.upload.mockResolvedValue('storage-1');
});

test('headless tasks are registered and nearby monitoring uses at most twenty regions', async () => {
  expect([...mock.handlers.keys()]).toEqual(['travi-auto-visits', 'travi-auto-landmarks']);
  await enableAutoCollection(client, userId);
  mock.query.mockResolvedValue(Array.from({ length: 19 }, (_, i) => ({ id: String(i), lat: 35, lng: 135.7 })));
  await syncAutoCollection(userId);
  expect(mock.fences.mock.calls[0][1]).toHaveLength(20);
});

test('failed location sync persists work and retries it on the next foreground run', async () => {
  await enableAutoCollection(client, userId);
  mock.mutation.mockRejectedValueOnce(new Error('offline'));
  await expect(syncAutoCollection(userId)).rejects.toThrow('offline');
  expect(JSON.parse(mock.store.get('travi.autoCollect.locations')!)).toHaveLength(1);
  await syncAutoCollection(userId);
  expect(JSON.parse(mock.store.get('travi.autoCollect.locations')!)).toHaveLength(0);
});

test('uses precise stationary readings near a landmark and returns to lower power after collection', async () => {
  await enableAutoCollection(client, userId);
  mock.query.mockResolvedValue([{ id: 'landmark-1', lat: 35, lng: 135.7 }]);
  await syncAutoCollection(userId);
  expect(mock.start.mock.calls.at(-1)![1]).toMatchObject({ accuracy: 6, distanceInterval: 0, pausesUpdatesAutomatically: false });
  mock.query.mockResolvedValue([]);
  mock.position.timestamp += 60000;
  mock.mutation.mockImplementation(async ref => name(ref) === 'autoVisits:record' ? true : null);
  await syncAutoCollection(userId);
  expect(mock.start.mock.calls.at(-1)![1]).toMatchObject({ accuracy: 3, distanceInterval: 250, pausesUpdatesAutomatically: true });
});

test('matches metadata before decoding, resizes uploads, and checkpoints only after attachment succeeds', async () => {
  await enableAutoCollection(client, userId);
  const takenAt = Date.now();
  mock.metadata.mockResolvedValue([{ id: 'asset-1', creationTime: takenAt }]);
  mock.mutation.mockImplementation(async ref => {
    if (name(ref) === 'autoVisits:photoUpload') return 'https://upload.example';
    if (name(ref) === 'autoVisits:attachPhoto') throw new Error('offline');
    return null;
  });
  await expect(syncAutoCollection(userId)).rejects.toThrow('offline');
  expect(JSON.parse(mock.store.get('travi.autoCollect.v1')!).offset).toBe(0);
  mock.mutation.mockImplementation(async ref => name(ref) === 'autoVisits:photoUpload' ? 'https://upload.example' : null);
  await syncAutoCollection(userId);
  const calls = mock.mutation.mock.calls.filter(([ref]) => name(ref) === 'autoVisits:attachPhoto');
  expect(calls.at(-1)![1]).toMatchObject({ takenAt, width: 2048, height: 1365, storageId: 'storage-1' });
  const state = JSON.parse(mock.store.get('travi.autoCollect.v1')!);
  expect(state).toMatchObject({ photoAfter: takenAt, offset: 1 });
  expect(mock.upload).toHaveBeenCalledWith('https://upload.example', 'file://resized.jpg');
});

test('unmatched photos never decode or upload', async () => {
  await enableAutoCollection(client, userId);
  mock.metadata.mockResolvedValue([{ id: 'asset-1', creationTime: Date.now() }]);
  await syncAutoCollection(userId);
  expect(mock.getInfo).not.toHaveBeenCalled();
  expect(mock.upload).not.toHaveBeenCalled();
});

test('turning off collection revokes the credential and clears local background work', async () => {
  await enableAutoCollection(client, userId);
  await disableAutoCollection(client);
  expect(mock.mutation.mock.calls.some(([ref]) => name(ref) === 'autoVisits:disable')).toBe(true);
  expect(mock.store.has('travi.autoCollect.v1')).toBe(false);
  expect(mock.stop).toHaveBeenCalled();
  mock.mutation.mockClear();
  await syncAutoCollection(userId);
  expect(mock.mutation).not.toHaveBeenCalled();
});
