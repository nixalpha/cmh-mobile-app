import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getDevCredentials } from './dev-session';

vi.mock('expo-crypto', () => ({ randomUUID: vi.fn() }));
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('development account storage', () => {
  afterEach(() => vi.unstubAllGlobals());
  let saved: string | null;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('__DEV__', true);
    saved = null;
    Platform.OS = 'web';
    vi.stubGlobal('window', { localStorage: {
      getItem: vi.fn(() => saved),
      setItem: vi.fn((_: string, value: string) => { saved = value; }),
    } });
    vi.mocked(Crypto.randomUUID).mockReturnValueOnce('12345678-1234-4234-8234-123456789abc')
      .mockReturnValueOnce('87654321-4321-4321-8321-cba987654321');
  });

  it('creates a valid unique handle and reuses credentials on later visits', async () => {
    const first = await getDevCredentials();
    expect(first.username).toMatch(/^dev_[a-f0-9]{16}$/);
    expect(first.password).toBe('87654321-4321-4321-8321-cba987654321');
    expect(await getDevCredentials()).toEqual(first);
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(2);
  });

  it('replaces corrupt development data', async () => {
    saved = '{bad json';
    expect((await getDevCredentials()).username).toMatch(/^dev_/);
    expect(JSON.parse(saved!).password).toBeTruthy();
  });

  it('stores native credentials in SecureStore', async () => {
    Platform.OS = 'ios';
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    const credentials = await getDevCredentials();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringMatching(/^travi\.dev-session\./), JSON.stringify(credentials));
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('refuses production access before reading or creating credentials', async () => {
    vi.stubGlobal('__DEV__', false);
    await expect(getDevCredentials()).rejects.toThrow('only available in development');
    expect(window.localStorage.getItem).not.toHaveBeenCalled();
    expect(Crypto.randomUUID).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });
});
