import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Art } from '@/components/ui/art';

const SIZE = 340;
const SPIN_MS = 70000;

export function Globe({ paused }: { paused: boolean }) {
  const turn = useSharedValue(0);

  useEffect(() => {
    if (paused) {
      cancelAnimation(turn);
      return;
    }
    const remaining = 1 - (turn.value % 1);
    turn.value = withTiming(Math.ceil(turn.value + 1e-6), { duration: SPIN_MS * remaining, easing: Easing.linear }, (finished) => {
      if (finished) turn.value = withRepeat(withTiming(turn.value + 1, { duration: SPIN_MS, easing: Easing.linear }), -1, false);
    });
  }, [paused, turn]);

  const land = useAnimatedStyle(() => ({ transform: [{ translateX: -(turn.value % 1) * 600 }] }));

  return (
    <View style={styles.globe} accessibilityRole="image" accessibilityLabel="Rotating globe">
      <Art name="globeOcean" style={StyleSheet.absoluteFill} />
      <View style={styles.ball}>
        <Animated.View style={[styles.land, land]}>
          <Art name="globeLand" width={1200} height={SIZE} />
        </Animated.View>
      </View>
      <Art name="globeOverlay" style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  globe: { width: SIZE, height: SIZE },
  ball: { position: 'absolute', left: 20, top: 20, width: 300, height: 300, borderRadius: 150, overflow: 'hidden' },
  land: { position: 'absolute', left: -20, top: -20, width: 1200, height: SIZE },
});
