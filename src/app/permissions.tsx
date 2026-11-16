import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useMutation } from 'convex/react';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useFriendLocation } from '@/components/friend-location-provider';
import { AsyncButton, Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { PageDots } from '@/components/ui/page-dots';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, space } from '@/constants/theme';
import { api } from '@/lib/backend';

const DONE_KEY = 'travi.permissionsAsked.v1';

type Permission = { granted: boolean; canAskAgain: boolean };
type Step = {
  key: string;
  icon: IconName;
  title: string;
  body: string;
  // True when the system prompt can still be shown for this step.
  askable: () => Promise<boolean>;
  request: () => Promise<unknown>;
};

const open = (permission: Permission) => !permission.granted && permission.canAskAgain;

function useSteps(enablePush: () => Promise<void>): Step[] {
  return [
    {
      key: 'location',
      icon: 'map',
      title: 'Share your location',
      body: 'See yourself on the map and log landmark visits.',
      askable: async () => open(await Location.getForegroundPermissionsAsync()),
      request: () => Location.requestForegroundPermissionsAsync(),
    },
    {
      key: 'locationAlways',
      icon: 'compass',
      title: 'Allow background location',
      body: Platform.OS === 'ios'
        ? 'Pick “Always Allow” to log visits while travi is closed.'
        : 'Pick “Allow all the time” to log visits while travi is closed.',
      askable: async () => (await Location.getForegroundPermissionsAsync()).granted
        && open(await Location.getBackgroundPermissionsAsync()),
      request: () => Location.requestBackgroundPermissionsAsync(),
    },
    {
      key: 'photos',
      icon: 'photo',
      title: 'Allow photos',
      body: 'Match your trip photos to landmarks.',
      askable: async () => open(await MediaLibrary.getPermissionsAsync(false, ['photo'])),
      request: () => MediaLibrary.requestPermissionsAsync(false, ['photo']),
    },
    {
      key: 'notifications',
      icon: 'bell',
      title: 'Turn on notifications',
      body: 'Hear when a friend is nearby.',
      askable: async () => open(await Notifications.getPermissionsAsync()),
      request: async () => {
        const permission = await Notifications.requestPermissionsAsync();
        // Registers this device's push token once permission is granted.
        if (permission.granted) await enablePush().catch(() => {});
      },
    },
    {
      key: 'contacts',
      icon: 'users',
      title: 'Find friends',
      body: 'See which contacts use travi. Numbers are hashed on your phone.',
      askable: async () => open(await Contacts.getPermissionsAsync()),
      request: () => Contacts.requestPermissionsAsync(),
    },
  ];
}

export default function PermissionsScreen() {
  const { enablePush } = useFriendLocation();
  const steps = useSteps(enablePush);
  const [index, setIndex] = useState<number | null>(null);
  const completeOnboarding = useMutation(api.users.completeOnboarding);

  // Finishing this step finishes onboarding, so the account goes to Feed from now on.
  const finish = async () => {
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(DONE_KEY, 'true').catch(() => {});
    await completeOnboarding({});
    router.replace('/feed');
  };

  // Moves to the first step at or after `from` that can still prompt.
  const advance = async (from: number) => {
    for (let next = from; next < steps.length; next += 1) {
      if (await steps[next].askable().catch(() => false)) { setIndex(next); return; }
    }
    await finish();
  };

  useEffect(() => {
    if (Platform.OS === 'web') { void finish(); return; }
    void SecureStore.getItemAsync(DONE_KEY).then((done) => (done === 'true' ? finish() : advance(0)));
    // Runs once on mount; `advance` reads the latest steps each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (index === null) return <Screen backdrop="onboarding" style={styles.fill}><View style={styles.center}><Notice>One moment…</Notice></View></Screen>;

  const step = steps[index];
  return (
    <Screen backdrop="onboarding" style={styles.fill}>
      <View style={styles.center}>
        <View style={styles.dots}><PageDots count={steps.length} active={index} shape="bars" /></View>
        <View style={styles.icon}><Icon name={step.icon} size={28} color={colors.accentText} /></View>
        <Text variant="title" style={styles.centerText} accessibilityRole="header">{step.title}</Text>
        <Text color="muted" style={styles.centerText}>{step.body}</Text>
        <AsyncButton key={step.key} label="Allow" height={44} onPress={async () => {
          try { await step.request(); } finally { await advance(index + 1); }
        }} />
        <Button label="Not now" variant="link" height={44} onPress={() => void advance(index + 1)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', gap: space.inset, paddingBottom: space.gutter },
  centerText: { textAlign: 'center' },
  dots: { alignItems: 'center' },
  icon: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    backgroundColor: colors.tileStrong,
  },
});
