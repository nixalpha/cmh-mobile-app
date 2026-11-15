import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

/** Shared spring for every selection toggle so they all move with the same feel. */
export const selectionSpring = {
  damping: 22,
  stiffness: 260,
  mass: 0.9,
  reduceMotion: ReduceMotion.System,
} as const;

type ItemLayout = { x: number; y: number; width: number; height: number };

export type SlidingIndicator = {
  layouts: SharedValue<Record<number, ItemLayout>>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
  selectedIndex: number;
  onItemLayout: (index: number) => (event: LayoutChangeEvent) => void;
};

/**
 * Tracks the layout of each item in a row and springs an indicator between them
 * when `selectedIndex` changes. Pair with <IndicatorPill> and <IndicatorItem>.
 */
export function useSlidingIndicator(selectedIndex: number): SlidingIndicator {
  // Source of truth lives on the JS thread. Shared-value writes from JS are applied
  // asynchronously, so read-modify-write on the shared value drops items when several
  // onLayout events land in the same batch.
  const known = useRef<Record<number, ItemLayout>>({});
  const placed = useRef(false);
  const layouts = useSharedValue<Record<number, ItemLayout>>({});
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  useEffect(() => {
    const target = known.current[selectedIndex];
    if (!target) return;
    y.set(target.y);
    height.set(target.height);
    if (placed.current) {
      x.set(withSpring(target.x, selectionSpring));
      width.set(withSpring(target.width, selectionSpring));
    } else {
      x.set(target.x);
      width.set(target.width);
      placed.current = true;
    }
  }, [selectedIndex, x, y, width, height]);

  const onItemLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { x: itemX, y: itemY, width: itemWidth, height: itemHeight } = event.nativeEvent.layout;
    known.current = { ...known.current, [index]: { x: itemX, y: itemY, width: itemWidth, height: itemHeight } };
    layouts.set(known.current);
    if (index !== selectedIndex) return;
    // First placement (or a relayout such as rotation) snaps instead of animating.
    x.set(itemX);
    y.set(itemY);
    width.set(itemWidth);
    height.set(itemHeight);
    placed.current = true;
  };

  return { layouts, x, y, width, height, selectedIndex, onItemLayout };
}

/** The moving highlight. Render it as the first child of the row so it sits behind the items. */
export function IndicatorPill({ indicator, style }: { indicator: SlidingIndicator; style?: StyleProp<ViewStyle> }) {
  const { x, y, width, height } = indicator;
  const animated = useAnimatedStyle(() => ({
    opacity: width.value > 0 && height.value > 0 ? 1 : 0,
    top: y.value,
    height: height.value,
    width: width.value,
    transform: [{ translateX: x.value }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.pill, style, animated]} />;
}

/**
 * Crossfades between `inactive` and `active` content based on how close the pill
 * is to this item, so the highlight colour follows the pill as it slides.
 */
export function IndicatorItem({
  indicator,
  index,
  active,
  inactive,
}: {
  indicator: SlidingIndicator;
  index: number;
  active: ReactNode;
  inactive: ReactNode;
}) {
  const { layouts, x, width, selectedIndex } = indicator;
  const selected = index === selectedIndex;
  const progress = useDerivedValue(() => {
    const item = layouts.value[index];
    if (!item || width.value === 0) return selected ? 1 : 0;
    const distance = Math.abs(x.value + width.value / 2 - (item.x + item.width / 2));
    return interpolate(distance, [0, item.width * 0.75], [1, 0], 'clamp');
  });
  const activeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const inactiveStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  return (
    <View>
      <Animated.View style={[styles.layer, inactiveStyle]}>{inactive}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.layer, activeStyle]}>{active}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { position: 'absolute', left: 0 },
  layer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
