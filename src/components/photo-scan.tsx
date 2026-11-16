import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

const COLUMNS = 3;
const CELLS = COLUMNS * COLUMNS;
const GAP = 6;
const MAX_GRID = 300;
const SWAP_MS = 140;
const SWEEP_MS = 1400;

// Visits the cells in a scattered order so swaps don't read as a left-to-right wipe.
const ORDER = [4, 0, 8, 2, 6, 1, 7, 3, 5];

export type PhotoScanStep = 'photos' | 'places';

/**
 * A 3x3 contact sheet that flips through the camera roll as it is read, with a scan line
 * sweeping over it. `uris` grows as pages come in; once every new photo has been shown it
 * keeps shuffling through the ones it has.
 */
export function PhotoScan({ uris, checked, step }: { uris: readonly string[]; checked: number; step: PhotoScanStep }) {
  const { width } = useWindowDimensions();
  const grid = Math.min(MAX_GRID, width - space.gutter * 2);
  const cell = (grid - GAP * (COLUMNS - 1)) / COLUMNS;
  const reduceMotion = useReducedMotion();
  const [cells, setCells] = useState<(string | null)[]>(() => Array<string | null>(CELLS).fill(null));
  const next = useRef(0);
  const turn = useRef(0);
  const latest = useRef(uris);
  useEffect(() => { latest.current = uris; }, [uris]);

  // One cell gets a new photo per tick: unseen photos first, then random repeats.
  useEffect(() => {
    const timer = setInterval(() => {
      const pool = latest.current;
      if (pool.length === 0) return;
      const uri = next.current < pool.length ? pool[next.current++] : pool[Math.floor(Math.random() * pool.length)];
      const index = ORDER[turn.current++ % CELLS];
      setCells((current) => current[index] === uri ? current : current.map((value, i) => (i === index ? uri : value)));
    }, reduceMotion ? SWAP_MS * 4 : SWAP_MS);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, true, undefined, ReduceMotion.System));
  }, [sweep]);
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value * (grid - 3) }] }));

  const label = step === 'photos'
    ? checked > 0 ? `Checked ${checked.toLocaleString()} photos` : 'Opening your photos'
    : 'Matching your places';

  return (
    <View style={styles.root} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <View style={[styles.grid, { width: grid, height: grid }]} importantForAccessibility="no-hide-descendants">
        {cells.map((uri, index) => <Cell key={index} uri={uri} size={cell} />)}
        <Animated.View pointerEvents="none" style={[styles.line, line]} />
      </View>
      <Text variant="label" color="muted" style={styles.count}>{label}</Text>
    </View>
  );
}

function Cell({ uri, size }: { uri: string | null; size: number }) {
  const pop = useSharedValue(1);
  useEffect(() => {
    if (!uri) return;
    pop.set(withSequence(withTiming(0.9, { duration: 90 }), withSpring(1, { damping: 12, stiffness: 220, reduceMotion: ReduceMotion.System })));
  }, [uri, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={[styles.cell, { width: size, height: size }, style]}>
      {uri && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={{ duration: 220, effect: 'cross-dissolve' }}
          cachePolicy="memory"
          accessible={false}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.inset },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: { borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.inkTint },
  line: {
    position: 'absolute',
    left: -4,
    right: -4,
    top: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.white,
    boxShadow: `0 0 12px 2px ${colors.accentText}`,
  },
  count: { textAlign: 'center', fontVariant: ['tabular-nums'] },
});
