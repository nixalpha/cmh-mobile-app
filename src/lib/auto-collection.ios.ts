import { ConvexHttpClient } from 'convex/browser';
import type { ConvexReactClient } from 'convex/react';
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { api, type Id } from '@/lib/backend';
import { localDay } from '@/lib/exif';
import { preparePhoto, uploadPhoto } from '@/lib/photo-upload';
import type { AutoCollectionStatus } from './auto-collection';

export type { AutoCollectionStatus } from './auto-collection';
export const autoCollectionSupported = true;
const STATE_KEY = 'travi.autoCollect.v1';
const QUEUE_KEY = 'travi.autoCollect.locations';
const MESSAGE_KEY = 'travi.autoCollect.status';
const LOCATION_TASK = 'travi-auto-visits';
const GEOFENCE_TASK = 'travi-auto-landmarks';
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
type State = { secret: string; userId: Id<'users'>; enabledAt: number; offset: number; photoAfter?: number; fenceLat?: number; fenceLng?: number; highPrecision?: boolean; precisionStartedAt?: number };
type Sample = { lat: number; lng: number; accuracy: number; timestamp: number; speed?: number; day: string };
let operations: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation, operation);
  operations = result.catch(() => {});
  return result;
}
const load = async (): Promise<State | null> => {
  const value = await SecureStore.getItemAsync(STATE_KEY);
  return value ? JSON.parse(value) as State : null;
};
const save = (state: State) => SecureStore.setItemAsync(STATE_KEY, JSON.stringify(state), STORE_OPTIONS);
function backend() {
  const url = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!url) throw new Error('Connect Travi before enabling automatic collection.');
  return new ConvexHttpClient(url);
}

export async function autoCollectionStatus(): Promise<AutoCollectionStatus> {
  const state = await load();
  if (!state) return { enabled: false, message: 'Automatic collection is off.' };
  const [location, photos, message] = await Promise.all([
    Location.getBackgroundPermissionsAsync(), MediaLibrary.getPermissionsAsync(false, ['photo']),
    SecureStore.getItemAsync(MESSAGE_KEY),
  ]);
  return { enabled: true, message: !location.granted ? 'Allow Always location access in Settings to resume automatic visits.'
    : !photos.granted ? 'Photo access is off. Allow Photos access in Settings to resume uploads.'
    : photos.accessPrivileges === 'limited' ? 'Only selected photos can upload. Allow Full Access in Settings to include new photos automatically.'
    : message ?? 'Collecting visits and matching new photos automatically.' };
}

async function stopTasks() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}

export async function disableAutoCollection(client?: ConvexReactClient) {
  const state = await load();
  // Revoke first, so already-running uploads cannot commit after this returns.
  if (state && client) await client.mutation(api.autoVisits.disable, { secret: state.secret });
  await serial(async () => {
    await SecureStore.deleteItemAsync(STATE_KEY);
    await SecureStore.deleteItemAsync(QUEUE_KEY);
    await SecureStore.deleteItemAsync(MESSAGE_KEY);
    await stopTasks();
  });
}

async function startTasks(highPrecision = false, reconfigure = false) {
  if (reconfigure || !(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: highPrecision ? Location.Accuracy.High : Location.Accuracy.Balanced,
      distanceInterval: highPrecision ? 0 : 250,
      deferredUpdatesInterval: highPrecision ? 30000 : 60000,
      pausesUpdatesAutomatically: !highPrecision,
      activityType: Location.ActivityType.OtherNavigation,
      showsBackgroundLocationIndicator: true,
    });
  }
}

export async function enableAutoCollection(client: ConvexReactClient, userId: Id<'users'>) {
  if (!(await TaskManager.isAvailableAsync()) || !(await Location.isBackgroundLocationAvailableAsync())) {
    throw new Error('Automatic collection needs a new iOS development or production build.');
  }
  if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Allow location access to detect landmark visits.');
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) throw new Error('Choose Always for location access in Settings, then try again.');
  if (!(await MediaLibrary.requestPermissionsAsync(false, ['photo'])).granted) throw new Error('Allow Photos access to upload matching landmark photos.');
  await serial(async () => {
    const previous = await load();
    if (previous && previous.userId !== userId) throw new Error('Sign out and back in before enabling automatic collection.');
    const secret = previous?.secret ?? randomUUID() + randomUUID();
    const enabledAt = await client.mutation(api.autoVisits.enable, { secret, photos: true });
    try {
      await save(previous ?? { secret, userId, enabledAt, offset: 0 });
      await startTasks();
    } catch (error) {
      await client.mutation(api.autoVisits.disable, { secret });
      await SecureStore.deleteItemAsync(STATE_KEY);
      await stopTasks();
      throw error;
    }
  });
}

async function queueLocations(locations: Location.LocationObject[]) {
  const state = await load();
  if (!state) return;
  const stored = await SecureStore.getItemAsync(QUEUE_KEY);
  const queue: Sample[] = stored ? JSON.parse(stored) : [];
  for (const position of locations.sort((a, b) => a.timestamp - b.timestamp)) {
    if (position.coords.accuracy === null || position.timestamp < state.enabledAt) continue;
    if (queue.length && position.timestamp - queue[queue.length - 1].timestamp < 30000) continue;
    queue.push({ lat: +position.coords.latitude.toFixed(6), lng: +position.coords.longitude.toFixed(6),
      accuracy: Math.round(position.coords.accuracy), timestamp: Math.round(position.timestamp),
      speed: position.coords.speed !== null && position.coords.speed >= 0 ? position.coords.speed : undefined,
      day: localDay(new Date(position.timestamp)) });
  }
  await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue.slice(-8)), STORE_OPTIONS);
}

async function refreshFences(state: State, client: ConvexHttpClient, position: Location.LocationObject) {
  const { latitude: lat, longitude: lng } = position.coords;
  if (state.fenceLat !== undefined && state.fenceLng !== undefined
    && Math.abs(state.fenceLat - lat) + Math.abs(state.fenceLng - lng) < 0.001
    && (!state.highPrecision || Date.now() - (state.precisionStartedAt ?? 0) < 180000)
    && await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) return;
  const nearby = await client.query(api.autoVisits.nearby, { secret: state.secret, lat, lng });
  const close = nearby.some(landmark => {
    const north = (landmark.lat - lat) * 111000;
    const east = (landmark.lng - lng) * 111000 * Math.cos(lat * Math.PI / 180);
    return north * north + east * east < 500 * 500;
  });
  if (!close) state.precisionStartedAt = undefined;
  else state.precisionStartedAt ??= Date.now();
  const highPrecision = close && Date.now() - state.precisionStartedAt! < 180000;
  // Use repeated precise fixes only near an uncollected landmark, so a stationary
  // visitor can complete the dwell. Elsewhere, keep the lower-power travel mode.
  if (highPrecision !== !!state.highPrecision) await startTasks(highPrecision, true);
  state.highPrecision = highPrecision;
  // Nineteen landmarks + a travel region respect iOS's twenty-region limit.
  await Location.startGeofencingAsync(GEOFENCE_TASK, [
    ...nearby.map(landmark => ({ identifier: landmark.id, latitude: landmark.lat, longitude: landmark.lng,
      radius: 150, notifyOnEnter: true, notifyOnExit: false })),
    { identifier: 'travel', latitude: lat, longitude: lng, radius: 1500, notifyOnEnter: false, notifyOnExit: true },
  ]);
  state.fenceLat = lat; state.fenceLng = lng;
  await save(state);
}

async function syncPhotos(state: State, client: ConvexHttpClient) {
  if (!(await MediaLibrary.getPermissionsAsync(false, ['photo'])).granted) return;
  const deadline = Date.now() + 15000;
  // Metadata queries do not download or decode the rest of the library.
  const assets = await new MediaLibrary.Query().eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .gte(MediaLibrary.AssetField.CREATION_TIME, state.photoAfter ?? state.enabledAt).orderBy(MediaLibrary.AssetField.CREATION_TIME)
    .offset(state.offset).limit(10).exeForMetadata();
  for (const metadata of assets) {
    if (Date.now() > deadline) break;
    const asset = new MediaLibrary.Asset(metadata.id);
    const location = await asset.getLocation();
    if (location && metadata.creationTime !== null) {
      const args = { secret: state.secret, lat: location.latitude, lng: location.longitude,
        takenAt: metadata.creationTime, day: localDay(new Date(metadata.creationTime)),
        assetKey: await digestStringAsync(CryptoDigestAlgorithm.SHA256, metadata.id) };
      const uploadUrl = await client.mutation(api.autoVisits.photoUpload, args);
      if (uploadUrl) {
        const info = await asset.getInfo();
        const prepared = await preparePhoto({ uri: info.uri, width: info.width, height: info.height });
        const storageId = await uploadPhoto(uploadUrl, prepared.uri);
        await client.mutation(api.autoVisits.attachPhoto, { ...args, storageId, width: prepared.width, height: prepared.height });
      }
    }
    // Advance by capture time, retaining an offset only for equal timestamps. Deleting
    // an earlier photo from the library must not skip a later, unprocessed photo.
    if (metadata.creationTime !== null && metadata.creationTime !== state.photoAfter) {
      state.photoAfter = metadata.creationTime;
      state.offset = 1;
    } else state.offset += 1;
    await save(state); // Persist only after attach succeeds; failed uploads retry next run.
  }
}

async function sync(position?: Location.LocationObject) {
  const state = await load();
  if (!state) return;
  const client = backend();
  const stored = await SecureStore.getItemAsync(QUEUE_KEY);
  const queue: Sample[] = stored ? JSON.parse(stored) : [];
  while (queue.length) {
    const collected = await client.mutation(api.autoVisits.record, { secret: state.secret, ...queue[0] });
    if (collected) state.fenceLat = undefined;
    queue.shift();
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue), STORE_OPTIONS);
  }
  if (position) await refreshFences(state, client, position);
  await syncPhotos(state, client);
  await SecureStore.deleteItemAsync(MESSAGE_KEY);
}

export async function syncAutoCollection(userId: Id<'users'>) {
  return serial(async () => {
    const state = await load();
    if (!state) return;
    if (state.userId !== userId) {
      await SecureStore.deleteItemAsync(STATE_KEY);
      await SecureStore.deleteItemAsync(QUEUE_KEY);
      await stopTasks();
      return;
    }
    if (!(await Location.getBackgroundPermissionsAsync()).granted) return;
    await startTasks(state.highPrecision);
    let position: Location.LocationObject | undefined;
    try { position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); }
    catch { /* Photos can still establish a visit when a current fix is unavailable. */ }
    if (position) await queueLocations([position]);
    await sync(position);
  });
}

export function onAutoPhotoChange(listener: () => void) { return MediaLibrary.addListener(listener); }

async function background(locations?: Location.LocationObject[]) {
  try {
    await serial(async () => {
      if (!(await load())) return;
      const positions = locations ?? [await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })];
      await queueLocations(positions);
      await sync(positions.at(-1));
    });
  } catch {
    await SecureStore.setItemAsync(MESSAGE_KEY, 'Collection is waiting to retry. Open Travi with an internet connection to finish syncing.', STORE_OPTIONS);
  }
}

// Imported by the root layout: these handlers exist even on a headless iOS launch.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (!error && data) await background(data.locations);
});
TaskManager.defineTask(GEOFENCE_TASK, async ({ error }) => { if (!error) await background(); });
