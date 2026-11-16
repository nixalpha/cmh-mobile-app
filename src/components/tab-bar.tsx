import type { Tabs } from 'expo-router/js-tabs';
import { useEffect, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  IndicatorItem,
  IndicatorPill,
  selectionSpring,
  useSlidingIndicator,
  type SlidingIndicator,
} from '@/components/ui/sliding-indicator';
import { colors, radius, space } from '@/constants/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const tabs: Record<string, { icon: IconName; label: string }> = {
  feed: { icon: 'home', label: 'Feed' },
  discover: { icon: 'globe', label: 'Discover' },
  cities: { icon: 'cities', label: 'Places' },
  profile: { icon: 'user', label: 'Profile' },
};

export function TabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const indicator = useSlidingIndicator(state.index);
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, space.tabBarBottom);
  return (
    <View pointerEvents="box-none" style={[styles.position, { bottom, left: insets.left, right: insets.right }]}>
      <View pointerEvents="box-none" style={styles.frame}>
        <Glass radius={radius.card} style={styles.bar} accessibilityRole="tablist">
          <IndicatorPill indicator={indicator} style={styles.pill} />
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            return (
              <TabButton
                key={route.key}
                tab={tabs[route.name]}
                index={index}
                focused={focused}
                indicator={indicator}
                onPress={() => {
                  const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigateToTab(route.key);
                }}
              />
            );
          })}
        </Glass>
      </View>
    </View>
  );
}

function TabButton({
  tab,
  index,
  focused,
  indicator,
  onPress,
}: {
  tab: { icon: IconName; label: string };
  index: number;
  focused: boolean;
  indicator: SlidingIndicator;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  // Give the icon a small pop when its tab becomes selected.
  useEffect(() => {
    if (!focused) return;
    scale.set(withSequence(withTiming(0.86, { duration: 90 }), withSpring(1, { ...selectionSpring, damping: 12 })));
  }, [focused, scale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: focused }}
      onLayout={indicator.onItemLayout(index)}
      onPress={onPress}
      onPressIn={() => { scale.set(withSpring(0.9, selectionSpring)); }}
      onPressOut={() => { scale.set(withSpring(1, selectionSpring)); }}
      style={styles.tab}>
      <Animated.View style={iconStyle}>
        <IndicatorItem
          indicator={indicator}
          index={index}
          inactive={<Icon name={tab.icon} size={20} color={colors.slate} />}
          active={<Icon name={tab.icon} size={20} color={colors.accentForeground} />}
        />
      </Animated.View>
    </Pressable>
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
  tab: { width: 44, height: 44, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: radius.card, backgroundColor: colors.accent },
});
