import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/tab-bar';
import { colors } from '@/constants/theme';

export default function TabsLayout() {
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
