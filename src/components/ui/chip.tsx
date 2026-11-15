import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { selectionSpring } from '@/components/ui/sliding-indicator';
import { Text } from '@/components/ui/text';
import { colors } from '@/constants/theme';

export type ChipProps = {
  label: string;
  selected?: boolean;
  size?: 'small' | 'large';
  check?: boolean;
  leading?: ReactNode;
  surface?: 'glass' | 'tile';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const sizes = {
  small: { height: 36, paddingHorizontal: 14, fontSize: 13, weight: 'bold' },
  large: { height: 44, paddingHorizontal: 16, fontSize: 14, weight: 'semibold' },
} as const;

const GAP = 8;
const CHECK_SIZE = 16;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedText = Animated.createAnimatedComponent(Text);

export function Chip({
  label,
  selected,
  size = 'small',
  check,
  leading,
  surface = 'glass',
  onPress,
  style,
}: ChipProps) {
  const metrics = sizes[size];
  const radius = metrics.height / 2;
  const progress = useSharedValue(selected ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    progress.set(withTiming(selected ? 1 : 0, { duration: 200, reduceMotion: ReduceMotion.System }));
  }, [selected, progress]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.ink, colors.white]),
  }));
  // The check slot grows from zero width so the chip (and its neighbours) reflow smoothly.
  const checkStyle = useAnimatedStyle(() => ({
    width: progress.value * CHECK_SIZE,
    marginRight: interpolate(progress.value, [0, 1], [-GAP, 0]),
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.4, 1]) }],
  }));

  const shape = [
    styles.base,
    { height: metrics.height, borderRadius: radius, paddingHorizontal: metrics.paddingHorizontal },
    leading !== undefined && styles.withLeading,
  ];
  const content = (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fill, { borderRadius: radius }, fillStyle]} />
      {leading}
      {check && (
        <Animated.View style={[styles.check, checkStyle]}>
          <Icon name="check" size={CHECK_SIZE} color={colors.white} strokeWidth={2.5} />
        </Animated.View>
      )}
      <AnimatedText
        weight={metrics.weight}
        style={[{ fontSize: metrics.fontSize, lineHeight: metrics.fontSize * 1.4 }, labelStyle]}>
        {label}
      </AnimatedText>
    </>
  );

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { press.set(withSpring(0.95, selectionSpring)); }}
      onPressOut={() => { press.set(withSpring(1, selectionSpring)); }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[pressStyle, style]}>
      {surface === 'glass' ? (
        <Glass flat radius={radius} style={shape}>
          {content}
        </Glass>
      ) : (
        <View style={[shape, styles.tile]}>{content}</View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  withLeading: { paddingLeft: 6, paddingRight: 12 },
  fill: { backgroundColor: colors.ink },
  tile: { backgroundColor: colors.tileStrong },
  check: { height: CHECK_SIZE, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
