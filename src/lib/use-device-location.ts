import * as Location from 'expo-location';
import { openSettings } from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { DevicePosition } from '@/lib/globe-bridge';

const toPosition = ({ coords }: Location.LocationObject): DevicePosition =>
  ({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });

/**
 * The device's own position for drawing "you" on a map. Reads GPS only on this device
 * and never uploads it; friend sharing has its own opt-in watcher. Watches only while
 * `active` and the app is in the foreground, and never prompts until `locate` is called.
 */
export function useDeviceLocation(active: boolean) {
  const [position, setPosition] = useState<DevicePosition>();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [revision, setRevision] = useState(0);
  // Runs once on the next fix after `locate`, so the map can fly to it.
  const onFix = useRef<(() => void) | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active || !foreground) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;
    function receive(next: Location.LocationObject) {
      if (cancelled) return;
      setPosition(toPosition(next));
      const callback = onFix.current;
      onFix.current = null;
      callback?.();
    }
    async function start() {
      const current = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (!current.granted) return;
      // Show a fix straight away while GPS warms up. On web, expo-location's watch can
      // route updates to the wrong subscriber, so ask for one position directly there.
      const last = Platform.OS === 'web'
        ? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null)
        : await Location.getLastKnownPositionAsync({ maxAge: 10 * 60000 }).catch(() => null);
      if (cancelled) return;
      if (last) receive(last);
      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
        receive);
      if (cancelled) subscription.remove();
    }
    void start().catch(() => {});
    return () => { cancelled = true; subscription?.remove(); };
  }, [active, foreground, revision]);

  /**
   * Asks for location access if needed and calls `onReady` with the next fix.
   * Opens Settings when the user already said no.
   */
  const locate = useCallback(async (onReady?: () => void) => {
    onFix.current = null;
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) { onFix.current = onReady ?? null; setRevision(value => value + 1); return true; }
    if (!current.canAskAgain) {
      if (Platform.OS !== 'web') await openSettings();
      return false;
    }
    const result = await Location.requestForegroundPermissionsAsync();
    if (result.granted) { onFix.current = onReady ?? null; setRevision(value => value + 1); }
    return result.granted;
  }, []);

  return { position, locate };
}
