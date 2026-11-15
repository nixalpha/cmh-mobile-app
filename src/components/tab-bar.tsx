import type { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { colors, space } from '@/constants/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const tabs: Record<string, { icon: IconName; label: string }> = {
  feed: { icon: 'home', label: 'Feed' },
  discover: { icon: 'globe', label: 'Discover' },
  cities: { icon: 'cities', label: 'Places' },
  profile: { icon: 'user', label: 'Profile' },
};

export function TabBar({ state, emitter, navigateToTab }: TabBarProps) {
  return (
    <Glass radius={space.tabBarHeight / 2} style={styles.bar} accessibilityRole="tablist">
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
            <Icon name={tab.icon} size={22} color={focused ? colors.white : colors.slate} />
          </Pressable>
        );
      })}
    </Glass>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    bottom: space.tabBarBottom,
    height: space.tabBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  tab: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  focused: { backgroundColor: colors.ink },
});
