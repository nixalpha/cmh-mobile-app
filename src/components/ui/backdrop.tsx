import { StyleSheet, View } from 'react-native';

import { colors, washes } from '@/constants/theme';

export type Wash = {
  color: keyof typeof washes;
  size: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

const SPREAD = 110;

export const backdrops = {
  onboarding: [
    { color: 'lavender', size: 280, left: -80, top: 80 },
    { color: 'paper', size: 260, right: -90, top: 340 },
    { color: 'mist', size: 300, left: 40, bottom: -120 },
  ],
  feed: [
    { color: 'lavender', size: 280, left: -90, top: 40 },
    { color: 'paper', size: 260, right: -100, top: 420 },
    { color: 'mist', size: 300, left: 20, bottom: -100 },
  ],
  profile: [
    { color: 'mist', size: 300, right: -100, top: 20 },
    { color: 'lavender', size: 260, left: -100, top: 360 },
    { color: 'paper', size: 280, right: -60, bottom: -80 },
  ],
  cities: [
    { color: 'paper', size: 280, left: -80, top: 120 },
    { color: 'lavender', size: 280, right: -100, top: 300 },
    { color: 'mist', size: 300, left: 0, bottom: -100 },
  ],
  city: [
    { color: 'paper', size: 320, left: -60, top: 160 },
    { color: 'lavender', size: 260, right: -80, top: 80 },
    { color: 'mist', size: 300, right: -40, top: 420 },
  ],
  discover: [
    { color: 'mist', size: 340, left: 25, top: 230 },
    { color: 'lavender', size: 220, left: -80, top: 80 },
    { color: 'paper', size: 240, right: -80, bottom: 120 },
  ],
  place: [
    { color: 'lavender', size: 280, left: -80, bottom: 60 },
    { color: 'mist', size: 260, right: -80, bottom: -40 },
  ],
  rank: [
    { color: 'lavender', size: 300, left: -100, top: 140 },
    { color: 'mist', size: 280, right: -100, top: 420 },
    { color: 'paper', size: 240, left: 60, bottom: -100 },
  ],
} as const satisfies Record<string, readonly Wash[]>;

export type BackdropName = keyof typeof backdrops;

export function Backdrop({ name = 'onboarding', color = colors.canvas }: { name?: BackdropName; color?: string }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { backgroundColor: color }]}>
      {name &&
        backdrops[name].map((wash: Wash, index) => {
          const tint = washes[wash.color];
          const offset = (value?: number) => (value === undefined ? undefined : value - SPREAD);
          return (
            <View
              key={index}
              style={{
                position: 'absolute',
                width: wash.size + SPREAD * 2,
                height: wash.size + SPREAD * 2,
                top: offset(wash.top),
                bottom: offset(wash.bottom),
                left: offset(wash.left),
                right: offset(wash.right),
                backgroundImage: `radial-gradient(circle, ${tint}99 0%, ${tint}66 30%, ${tint}26 52%, ${tint}00 70%)`,
              }}
            />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
