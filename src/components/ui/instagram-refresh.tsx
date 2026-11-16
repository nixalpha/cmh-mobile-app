import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { colors } from '@/constants/theme';

const SIZE = 28;
const STROKE = 2.25;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Pull distance (pt) that fills the arc and arms the refresh. */
export const INSTAGRAM_REFRESH_THRESHOLD = 72;
const SPIN_MS = 720;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type SpinnerProps = {
  /** Raw pull distance in points while the user drags. */
  pull: SharedValue<number>;
  refreshing: boolean;
};

/**
 * Instagram-style arc: fills as you pull, then spins as a 3/4 ring while refreshing.
 */
export function InstagramRefreshSpinner({ pull, refreshing }: SpinnerProps) {
  const spin = useSharedValue(0);
  const active = useSharedValue(false);

  useEffect(() => {
    active.set(refreshing);
    if (!refreshing) {
      spin.set(0);
      return;
    }
    spin.set(0);
    spin.set(withRepeat(
      withTiming(1, { duration: SPIN_MS, easing: Easing.linear }),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    ));
  }, [active, refreshing, spin]);

  const shell = useAnimatedStyle(() => {
    const progress = Math.min(1, pull.value / INSTAGRAM_REFRESH_THRESHOLD);
    const isRefreshing = active.value;
    const visible = isRefreshing || pull.value > 4;
    return {
      opacity: visible ? (isRefreshing ? 1 : interpolate(progress, [0, 0.2, 1], [0, 0.55, 1])) : 0,
      transform: [
        { translateY: isRefreshing ? 0 : interpolate(progress, [0, 1], [-6, 0]) },
        { scale: isRefreshing ? 1 : interpolate(progress, [0, 1], [0.72, 1]) },
        { rotate: `${(isRefreshing ? spin.value : progress * 0.65) * 360}deg` },
      ],
    };
  });

  const arc = useAnimatedProps(() => {
    const progress = active.value
      ? 0.72
      : Math.min(1, pull.value / INSTAGRAM_REFRESH_THRESHOLD);
    return {
      strokeDashoffset: CIRCUMFERENCE * (1 - progress),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.spinner, shell]}
      accessible={false}
      importantForAccessibility="no">
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.inkSoft}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            animatedProps={arc}
          />
        </G>
      </Svg>
    </Animated.View>
  );
}

/** Transparent native RefreshControl chrome so the custom spinner is the only indicator. */
export const instagramRefreshControlProps = {
  tintColor: 'transparent',
  colors: ['transparent'] as string[],
  progressBackgroundColor: 'transparent',
  progressViewOffset: Platform.OS === 'android' ? 8 : 0,
};

const styles = StyleSheet.create({
  spinner: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    zIndex: 2,
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
