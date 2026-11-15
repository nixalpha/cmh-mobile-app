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
    { color: 'peach', size: 280, left: -80, top: 80 },
    { color: 'butter', size: 260, right: -90, top: 340 },
    { color: 'sky', size: 300, left: 40, bottom: -120 },
  ],
  feed: [
    { color: 'peach', size: 280, left: -90, top: 40 },
    { color: 'butter', size: 260, right: -100, top: 420 },
    { color: 'sky', size: 300, left: 20, bottom: -100 },
  ],
  profile: [
    { color: 'sky', size: 300, right: -100, top: 20 },
    { color: 'peach', size: 260, left: -100, top: 360 },
    { color: 'butter', size: 280, right: -60, bottom: -80 },
  ],
  cities: [
    { color: 'butter', size: 280, left: -80, top: 120 },
    { color: 'peach', size: 280, right: -100, top: 300 },
    { color: 'sky', size: 300, left: 0, bottom: -100 },
  ],
  city: [
    { color: 'butter', size: 320, left: -60, top: 160 },
    { color: 'peach', size: 260, right: -80, top: 80 },
    { color: 'sky', size: 300, right: -40, top: 420 },
  ],
  discover: [
    { color: 'sky', size: 340, left: 25, top: 230 },
    { color: 'peach', size: 220, left: -80, top: 80 },
    { color: 'butter', size: 240, right: -80, bottom: 120 },
  ],
  place: [
    { color: 'peach', size: 280, left: -80, bottom: 60 },
    { color: 'sky', size: 260, right: -80, bottom: -40 },
  ],
  rank: [
    { color: 'peach', size: 300, left: -100, top: 140 },
    { color: 'sky', size: 280, right: -100, top: 420 },
    { color: 'butter', size: 240, left: 60, bottom: -100 },
  ],
} as const satisfies Record<string, readonly Wash[]>;

export type BackdropName = keyof typeof backdrops;

export function Backdrop({ name, color = colors.canvas }: { name?: BackdropName; color?: string }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { backgroundColor: color }]}>
      {name &&
        backdrops[name].map((wash: Wash, index) => {
          const rgb = washes[wash.color];
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
                backgroundImage: `radial-gradient(circle, rgba(${rgb},0.95) 0%, rgba(${rgb},0.7) 30%, rgba(${rgb},0.25) 52%, rgba(${rgb},0) 70%)`,
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
