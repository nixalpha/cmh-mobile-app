import type { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { colors, space, radius } from '@/constants/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const tabs: Record<string, { icon: IconName; label: string }> = {
  feed: { icon: 'home', label: 'Feed' },
  discover: { icon: 'globe', label: 'Discover' },
  cities: { icon: 'cities', label: 'Places' },
  profile: { icon: 'user', label: 'Profile' },
};

export function TabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, space.tabBarBottom);
  return (
    <View pointerEvents="box-none" style={[styles.position, { bottom, left: insets.left, right: insets.right }]}>
      <View pointerEvents="box-none" style={styles.frame}>
        <Glass radius={radius.card} style={styles.bar} accessibilityRole="tablist">
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const tab = tabs[route.name];
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: focused }}
                onPress={() => {
                  const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigateToTab(route.key);
                }}
                style={[styles.tab, focused && styles.focused]}>
                <Icon name={tab.icon} size={22} color={focused ? colors.accentForeground : colors.slate} />
              </Pressable>
            );
          })}
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    alignItems: 'center',
  },
  frame: { width: '100%', maxWidth: space.screenMaxWidth, paddingHorizontal: space.gutter },
  bar: {
    height: space.tabBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: space.stack,
  },
  tab: { width: 52, height: 52, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  focused: { backgroundColor: colors.accent },
});
