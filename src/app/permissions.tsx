import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { Redirect, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useFriendLocation } from '@/components/friend-location-provider';
import { AsyncButton, Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { PageDots } from '@/components/ui/page-dots';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, space } from '@/constants/theme';

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
      body: 'travi uses your location to detect landmark visits and show you on the globe. Only friends you choose can see it.',
      askable: async () => open(await Location.getForegroundPermissionsAsync()),
      request: () => Location.requestForegroundPermissionsAsync(),
    },
    {
      key: 'locationAlways',
      icon: 'compass',
      title: 'Collect visits in the background',
      body: Platform.OS === 'ios'
        ? 'Choose “Change to Always Allow” so travi can log visits and update friends while the app is closed. You can turn both off anytime.'
        : 'Choose “Allow all the time” so travi can log visits and update friends while the app is closed. You can turn both off anytime.',
      askable: async () => (await Location.getForegroundPermissionsAsync()).granted
        && open(await Location.getBackgroundPermissionsAsync()),
      request: () => Location.requestBackgroundPermissionsAsync(),
    },
    {
      key: 'photos',
      icon: 'photo',
      title: 'Add photos from your trips',
      body: 'travi reads photo locations to match them to landmarks you visited. Allow full access so new photos can be added automatically.',
      askable: async () => open(await MediaLibrary.getPermissionsAsync(false, ['photo'])),
      request: () => MediaLibrary.requestPermissionsAsync(false, ['photo']),
    },
    {
      key: 'notifications',
      icon: 'bell',
      title: 'Know when friends are nearby',
      body: 'Get a notification when a friend is nearby or in the city you are visiting.',
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
      title: 'Find friends from your contacts',
      body: 'travi checks which of your contacts already use the app. Phone numbers are hashed on your phone before they are compared.',
      askable: async () => open(await Contacts.getPermissionsAsync()),
      request: () => Contacts.requestPermissionsAsync(),
    },
  ];
}

export default function PermissionsScreen() {
  const { enablePush } = useFriendLocation();
  const steps = useSteps(enablePush);
  const [index, setIndex] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(false);

  const finish = async () => {
    await SecureStore.setItemAsync(DONE_KEY, 'true');
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
    if (Platform.OS === 'web') return;
    void SecureStore.getItemAsync(DONE_KEY).then((done) => {
      if (done === 'true') setSkipped(true);
      else void advance(0);
    });
    // Runs once on mount; `advance` reads the latest steps each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (Platform.OS === 'web' || skipped) return <Redirect href="/feed" />;
  if (index === null) return <Screen backdrop="onboarding"><Notice>Checking permissions…</Notice></Screen>;

  const step = steps[index];
  return (
    <Screen backdrop="onboarding" scroll>
      <PageDots count={steps.length} active={index} shape="bars" />
      <Glass style={styles.card}>
        <View style={styles.icon}><Icon name={step.icon} size={28} color={colors.accentText} /></View>
        <Text variant="title" accessibilityRole="header">{step.title}</Text>
        <Text variant="body" color="muted">{step.body}</Text>
        <AsyncButton key={step.key} label="Allow" onPress={async () => {
          try { await step.request(); } finally { await advance(index + 1); }
        }} />
        <Button label="Not now" variant="link" onPress={() => void advance(index + 1)} />
      </Glass>
      <Notice>You can change any of these later in Settings.</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.gutter, gap: space.inset },
  icon: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.tileStrong,
  },
});
