import { ConvexHttpClient } from 'convex/browser';
import type { ConvexReactClient } from 'convex/react';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { api, type Id } from '@/lib/backend';

const TASK = 'travi-friend-location';
const KEY = 'travi.friendLocationDevice';
type Device = { secret: string; userId: Id<'users'> };
export const friendBackgroundSupported = Constants.executionEnvironment !== 'storeClient';
async function device(): Promise<Device | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Device>;
    return typeof value.secret === 'string' && typeof value.userId === 'string' ? value as Device : null;
  } catch { return null; }
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const credential = await device();
  const url = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!credential || !url) return;
  const position = data.locations[data.locations.length - 1];
  if (position.coords.accuracy === null || Date.now() - position.timestamp > 120000) return;
  try {
    await new ConvexHttpClient(url).mutation(api.friendLocations.updateFromDevice, {
      secret: credential.secret, lat: position.coords.latitude, lng: position.coords.longitude,
      accuracy: position.coords.accuracy, capturedAt: position.timestamp,
    });
  } catch (cause) {
    // Never retain stale coordinates for later replay. A future fresh update retries.
    const message = cause instanceof Error ? cause.message : '';
    if (message.includes('UNAUTHENTICATED') || message.includes('FORBIDDEN')) await stopFriendBackground();
  }
});

export async function backgroundSharingActive(userId?: Id<'users'>): Promise<boolean> {
  if (!friendBackgroundSupported) return false;
  const credential = await device();
  if (credential && userId && credential.userId !== userId) { await stopFriendBackground(); return false; }
  return !!credential && await Location.hasStartedLocationUpdatesAsync(TASK)
    && (await Location.getBackgroundPermissionsAsync()).granted;
}

export async function startFriendBackground(client: ConvexReactClient, userId: Id<'users'>): Promise<void> {
  if (!friendBackgroundSupported || !(await TaskManager.isAvailableAsync())) {
    throw new Error('Background sharing is unavailable in this build. Your location can still update while Travi is open.');
  }
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Allow location access to enable background sharing.');
  // Called only after the explicit settings switch; Android may open system settings.
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) throw new Error('Allow background location access in device settings to use this option.');
  const previous = await device();
  if (previous && previous.userId !== userId) await stopFriendBackground();
  const credential: Device = previous?.userId === userId ? previous : { userId, secret: Crypto.randomUUID() + Crypto.randomUUID() };
  await client.mutation(api.friendLocations.registerBackgroundDevice, { secret: credential.secret, enabled: true });
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(credential));
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Balanced, distanceInterval: 500, timeInterval: 5 * 60000,
      deferredUpdatesDistance: 500, deferredUpdatesInterval: 5 * 60000,
      pausesUpdatesAutomatically: true, showsBackgroundLocationIndicator: true,
      ...(Platform.OS === 'android' ? { foregroundService: { notificationTitle: 'Travi location sharing',
        notificationBody: 'Sharing with the friends you chose. Pause anytime in Travi.', notificationColor: '#909DC3' } } : {}),
    });
  } catch (cause) {
    await client.mutation(api.friendLocations.registerBackgroundDevice, { secret: credential.secret, enabled: false });
    await stopFriendBackground();
    throw cause;
  }
}

export async function stopFriendBackground(client?: ConvexReactClient): Promise<void> {
  if (!friendBackgroundSupported) return;
  const credential = await device();
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  if (credential && client) await client.mutation(api.friendLocations.registerBackgroundDevice, { secret: credential.secret, enabled: false });
  await SecureStore.deleteItemAsync(KEY);
}
