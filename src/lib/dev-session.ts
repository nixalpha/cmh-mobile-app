import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

type DevCredentials = { username: string; password: string };

// Keep test accounts separate when switching between Convex deployments.
const storageKey = `travi.dev-session.${(process.env.EXPO_PUBLIC_CONVEX_URL ?? 'local').replace(/[^a-zA-Z0-9._-]/g, '_')}`;

export async function getDevCredentials(): Promise<DevCredentials> {
  if (!__DEV__) throw new Error('Dev sessions are only available in development builds.');
  const saved = Platform.OS === 'web'
    ? window.localStorage.getItem(storageKey)
    : await SecureStore.getItemAsync(storageKey);
  if (saved) {
    try {
      const value = JSON.parse(saved);
      if (typeof value.username === 'string' && typeof value.password === 'string') return value;
    } catch { /* Replace invalid local development data. */ }
  }
  const credentials = {
    username: `dev_${Crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    password: Crypto.randomUUID(),
  };
  const serialized = JSON.stringify(credentials);
  if (Platform.OS === 'web') window.localStorage.setItem(storageKey, serialized);
  else await SecureStore.setItemAsync(storageKey, serialized);
  return credentials;
}
