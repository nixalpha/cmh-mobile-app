import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BrandLogo } from '@/components/brand-logo';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

const DOTS = [0, 1, 2];
const DOT_STEP_MS = 160;
const PULSE_MS = 800;

function BouncingDot({ index }: { index: number }) {
  const lift = useSharedValue(0);
  useEffect(() => {
    const ease = Easing.inOut(Easing.quad);
    lift.set(withDelay(index * DOT_STEP_MS, withRepeat(withSequence(
      withTiming(1, { duration: 320, easing: ease }),
      withTiming(0, { duration: 320, easing: ease }),
      withTiming(0, { duration: DOT_STEP_MS * 2 }),
    ), -1, false, undefined, ReduceMotion.System)));
  }, [index, lift]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + lift.value * 0.65,
    transform: [{ translateY: -lift.value * 4 }],
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

/** Three bouncing dots and a short label. Use it wherever a "Loading…" line would go. */
export function Loading({ label, center = false }: { label: string; center?: boolean }) {
  return (
    <View
      style={[styles.inline, center && styles.inlineCenter]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite">
      <View style={styles.dots}>
        {DOTS.map((index) => <BouncingDot key={index} index={index} />)}
      </View>
      <Text variant="bodySmall" color="muted">{label}</Text>
    </View>
  );
}

/** Full-screen wait: the logo breathes over the bouncing dots. */
export function LoadingScreen({ label }: { label: string }) {
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true, undefined, ReduceMotion.System));
  }, [breath]);
  const logo = useAnimatedStyle(() => ({ opacity: 0.55 + breath.value * 0.45, transform: [{ scale: 0.94 + breath.value * 0.06 }] }));
  return (
    <View style={styles.screen}>
      <Animated.View style={logo}>
        <BrandLogo symbol height={44} decorative />
      </Animated.View>
      <Loading label={label} center />
    </View>
  );
}

function usePulse() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }), -1, true, undefined, ReduceMotion.System));
  }, [pulse]);
  return useAnimatedStyle(() => ({ opacity: 0.45 + pulse.value * 0.55 }));
}

/** A placeholder block that pulses until the real content arrives. */
export function Skeleton({ width = '100%', height = 14, round = false, style }: {
  width?: DimensionValue;
  height?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = usePulse();
  return (
    <Animated.View
      style={[styles.bone, { width, height, borderRadius: round ? height / 2 : radius.inner }, style, pulse]}
    />
  );
}

/** Placeholder list rows: an avatar or icon, a title line, and a shorter subtitle. */
export function SkeletonRows({ count = 3, label, round = true }: { count?: number; label: string; round?: boolean }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={styles.rows}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.row}>
          <Skeleton width={40} height={40} round={round} />
          <View style={styles.rowCopy}>
            <Skeleton width={`${70 - index * 12}%`} height={14} />
            <Skeleton width={`${45 - index * 6}%`} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Placeholder cards: a picture block over two text lines. Two columns when `columns` is 2. */
export function SkeletonCards({ count = 2, label, columns = 1, artHeight = 140 }: {
  count?: number;
  label: string;
  columns?: 1 | 2;
  artHeight?: number;
}) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={[styles.cards, columns === 2 && styles.cardsGrid]}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.card, columns === 2 && styles.cardHalf]}>
          <Skeleton height={artHeight} style={styles.cardArt} />
          <View style={styles.cardCopy}>
            <Skeleton width="65%" height={14} />
            <Skeleton width="40%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.stack, minHeight: 21 },
  inlineCenter: { justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentText },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.inset, paddingBottom: space.scrollBottom },
  bone: { backgroundColor: colors.inkTint },
  rows: { gap: space.inset, paddingVertical: space.inline },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.inset },
  rowCopy: { flex: 1, gap: 6 },
  cards: { gap: space.stack },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderRadius: radius.card, backgroundColor: colors.tile, overflow: 'hidden' },
  cardHalf: { width: '49%' },
  cardArt: { borderRadius: 0 },
  cardCopy: { padding: space.inset, gap: 6 },
});
