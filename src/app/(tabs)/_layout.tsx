import { useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { Notice } from '@/components/live-ui';
import { TabBar } from '@/components/tab-bar';
import { Screen } from '@/components/ui/screen';
import { colors } from '@/constants/theme';
import { api } from '@/lib/backend';

export default function TabsLayout() {
  const me = useQuery(api.users.me, {});
  if (me === undefined) return <Screen><Notice>Opening travi…</Notice></Screen>;
  // Every signed-in route lands here, so this one check sends new accounts to onboarding.
  if (me && !me.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="cities" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
