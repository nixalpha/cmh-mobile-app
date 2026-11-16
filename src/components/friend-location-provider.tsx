import { useConvex, useMutation, useQuery } from 'convex/react';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { api } from '@/lib/backend';
import { backgroundSharingActive, startFriendBackground, stopFriendBackground } from '@/lib/friend-background';
import { friendPushToken, listenForFriendNotifications, setFriendPushDisabled } from '@/lib/friend-notifications';

type Settings = NonNullable<ReturnType<typeof useQuery<typeof api.friendLocations.settings>>>;
type LocationContext = {
  now: number;
  settings: Settings | undefined;
  status: string;
  error: string;
  pushEnabled: boolean;
  pushMessage: string;
  backgroundEnabled: boolean;
  setBackground: (enabled: boolean) => Promise<void>;
  enable: () => Promise<void>;
  refresh: () => void;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
};
const Context = createContext<LocationContext | null>(null);

export function FriendLocationProvider({ children }: { children: ReactNode }) {
  const client = useConvex();
  const me = useQuery(api.users.me, {});
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const [now, setNow] = useState(Date.now);
  const settings = useQuery(api.friendLocations.settings, { now });
  const update = useMutation(api.friendLocations.updateLocation);
  const updateSettings = useMutation(api.friendLocations.updateSettings);
  const registerToken = useMutation(api.friendLocations.registerPushToken);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('Location sharing is off');
  const [error, setError] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const token = useRef<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state === 'active') setNow(Date.now());
    });
    const visibility = () => { setForeground(!document.hidden); if (!document.hidden) setNow(Date.now()); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); subscription.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!settings) return;
    const check = async () => {
      if (!settings.enabled) await stopFriendBackground(client);
      const active = await backgroundSharingActive(me?._id);
      if (!cancelled) setBackgroundEnabled(active);
    };
    void check().catch(() => {});
    return () => { cancelled = true; };
  }, [settings, foreground, client, me?._id]);

  useEffect(() => listenForFriendNotifications(() => router.push('/friends')), []);
  useEffect(() => {
    let cancelled = false;
    void friendPushToken(false).then(async value => {
      if (!value || cancelled) return;
      await registerToken({ token: value, enabled: true });
      if (!cancelled) { token.current = value; setPushEnabled(true); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [registerToken]);

  useEffect(() => {
    if (!settings?.enabled || !foreground) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let sending = false;
    let lastSent = 0;
    let address: { lat: number; lng: number; city?: string; countryCode?: string } | undefined;
    async function publish(position: Location.LocationObject) {
      if (cancelled || sending || Date.now() - lastSent < 60000) return;
      if (Date.now() - position.timestamp > 120000) return;
      sending = true;
      try {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        if (accuracy === null) { setError('Waiting for a location with a known accuracy.'); return; }
        if (Platform.OS !== 'web' && (!address || Math.abs(address.lat - lat) + Math.abs(address.lng - lng) > 0.02)) {
          try {
            const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            address = { lat, lng, city: result?.city ?? undefined, countryCode: result?.isoCountryCode ?? undefined };
          } catch { address = undefined; }
        }
        if (cancelled) return;
        await update({ lat, lng, accuracy, city: address?.city, countryCode: address?.countryCode });
        if (!cancelled) { lastSent = Date.now(); setNow(lastSent); setError(''); setStatus('Updating while Travi is open'); }
      } catch {
        if (!cancelled) setError('Could not update your location. Check your connection and try again.');
      } finally { sending = false; }
    }
    async function poll() {
      try { await publish(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })); }
      catch { if (!cancelled) setError('Could not find your location. Check location access in Settings.'); }
    }
    async function start() {
      setError(''); setStatus('Finding your location…');
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted) { setError('Location access is off. Enable location access to resume updates.'); return; }
        subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 250, timeInterval: 60000 },
          position => { void publish(position); }, () => { if (!cancelled) setError('Location is unavailable. Check location access and try again.'); });
        if (cancelled) { subscription.remove(); return; }
        void poll();
        timer = setInterval(() => { void poll(); }, 5 * 60000);
      } catch { if (!cancelled) setError('Could not start location updates. Check location access and try again.'); }
    }
    void start();
    return () => { cancelled = true; subscription?.remove(); if (timer) clearInterval(timer); };
  }, [settings?.enabled, foreground, revision, update]);

  const enable = useCallback(async () => {
    setError('');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) { setError('Location access was not granted. You can change this in your device or browser settings.'); return; }
    await updateSettings({ enabled: true });
    setRevision(value => value + 1);
  }, [updateSettings]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const enablePush = useCallback(async () => {
    const value = await friendPushToken(true);
    if (!value) { setPushMessage('Push alerts are unavailable or not allowed on this device. Your alerts are still available in Travi.'); return; }
    await registerToken({ token: value, enabled: true }); token.current = value;
    await setFriendPushDisabled(false);
    setPushEnabled(true); setPushMessage('Push alerts are on for this device.');
  }, [registerToken]);
  const setBackground = useCallback(async (enabled: boolean) => {
    if (enabled && me) await startFriendBackground(client, me._id);
    else await stopFriendBackground(client);
    setBackgroundEnabled(await backgroundSharingActive(me?._id));
  }, [client, me]);
  const disablePush = useCallback(async () => {
    const value = token.current ?? await friendPushToken(false);
    if (value) await registerToken({ token: value, enabled: false });
    await setFriendPushDisabled(true);
    token.current = null; setPushEnabled(false); setPushMessage('Push alerts are off for this device.');
  }, [registerToken]);

  return <Context.Provider value={{ now, settings, status: settings?.enabled ? backgroundEnabled ? 'Updates while open and in the background' : status : 'Location sharing is off', error, pushEnabled, pushMessage, backgroundEnabled, setBackground, enable, refresh, enablePush, disablePush }}>{children}</Context.Provider>;
}

export function useFriendLocation() {
  const value = useContext(Context);
  if (!value) throw new Error('Friend location provider is missing');
  return value;
}
