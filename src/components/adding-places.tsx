import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { colors, space } from '@/constants/theme';

const ENTER_STEP_MS = 40;
// Later chips share one delay so a long list doesn't take seconds to appear.
const ENTER_MAX_STEPS = 8;
const BAR_HEIGHT = 6;

type AddingPlace = { id: string; name: string; countryCode: string };

/**
 * Shown while picked places are being saved. The chips drop in, then each one fills in
 * with a check as its visit is saved, and a bar under them tracks the count.
 */
export function AddingPlaces({ places, saved }: { places: readonly AddingPlace[]; saved: number }) {
  const total = places.length;
  const finished = saved >= total;
  const label = finished ? 'All set' : `Adding ${places[saved].name}`;

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.set(withTiming(total === 0 ? 1 : saved / total, { duration: 260, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }));
  }, [fill, saved, total]);
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}, ${saved} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: saved }}
      accessibilityLiveRegion="polite">
      <Text variant="title" style={styles.centerText}>{finished ? 'Your places are in' : 'Adding your places'}</Text>
      <View style={styles.chips} importantForAccessibility="no-hide-descendants">
        {places.map((place, index) => (
          <Animated.View
            key={place.id}
            entering={FadeInDown.delay(Math.min(index, ENTER_MAX_STEPS) * ENTER_STEP_MS).duration(260).reduceMotion(ReduceMotion.System)}>
            <Chip label={`${place.name}, ${place.countryCode}`} check selected={index < saved} />
          </Animated.View>
        ))}
      </View>
      <View style={styles.track} importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.fill, bar]} />
      </View>
      <Text variant="label" color="muted" style={[styles.centerText, styles.count]}>
        {finished ? label : `${label} · ${saved + 1} of ${total}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.inset },
  centerText: { textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.stack },
  track: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, backgroundColor: colors.inkTint, overflow: 'hidden', marginTop: space.stack },
  fill: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, backgroundColor: colors.accentText },
  count: { fontVariant: ['tabular-nums'] },
});
