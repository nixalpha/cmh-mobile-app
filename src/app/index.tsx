import { Redirect, router } from 'expo-router';
import { useConvexAuth } from 'convex/react';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Art } from '@/components/ui/art';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { PageDots } from '@/components/ui/page-dots';
import { useScreenTop } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, radius } from '@/constants/theme';

const flakes = [
  { left: 40, top: 60, phase: 0, size: 4 },
  { left: 120, top: 10, phase: 3 / 9, size: 4 },
  { left: 210, top: 120, phase: 6 / 9, size: 3 },
  { left: 300, top: 30, phase: 1.5 / 9, size: 4 },
  { left: 350, top: 200, phase: 7.5 / 9, size: 3 },
  { left: 80, top: 300, phase: 4.5 / 9, size: 4 },
];

export default function WelcomeScreen() {
  const { isAuthenticated } = useConvexAuth();
  const top = useScreenTop();
  const fall = useSharedValue(0);

  useEffect(() => {
    fall.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1);
  }, [fall]);

  if (isAuthenticated) return <Redirect href="/feed" />;

  return (
    <View style={styles.root}>
      <Art name="welcome" style={StyleSheet.absoluteFill} />
      {flakes.map((flake, index) => (
        <Flake key={index} progress={fall} {...flake} />
      ))}

      <View style={[styles.header, { top: top + 2 }]}>
        <Glass radius={22} style={styles.brand}>
          <Icon name="compass" size={22} />
          <Text weight="bold" style={styles.brandText}>
            Wayfarer
          </Text>
        </Glass>
        <Glass radius={22} style={styles.weather}>
          <Text variant="meta" weight="semibold">
            −04°C · Zermatt
          </Text>
        </Glass>
      </View>

      <Glass radius={radius.hero} style={styles.card}>
        <View style={styles.eyebrow}>
          <View style={styles.rule} />
          <Text variant="eyebrow" color="slate" style={styles.eyebrowText}>
            TRAVEL, RANKED BY YOU
          </Text>
        </View>
        <Text variant="display" accessibilityRole="header">
          Every place you’ve been, in order.
        </Text>
        <Text color="slate">Collect cities, unlock their landmarks and see where your friends would go next.</Text>
        <View style={styles.dots}>
          <PageDots count={3} active={0} />
        </View>
        <Button label="Get started" trailingIcon="arrowRight" onPress={() => router.push('/auth?mode=signup')} />
        <Button
          variant="link"
          label="I already have an account"
          height={48}
          fontSize={15}
          onPress={() => router.push('/auth?mode=signin')}
        />
      </Glass>
    </View>
  );
}

function Flake({
  progress,
  left,
  top,
  phase,
  size,
}: {
  progress: { value: number };
  left: number;
  top: number;
  phase: number;
  size: number;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ((progress.value + phase) % 1) * 880 - 20 }],
  }));
  return <Animated.View style={[styles.flake, { left, top, width: size, height: size }, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#9FB6CC', overflow: 'hidden' },
  flake: { position: 'absolute', borderRadius: 2, backgroundColor: colors.white, opacity: 0.9 },
  header: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brand: { height: 44, paddingLeft: 12, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 17, lineHeight: 22 },
  weather: { height: 44, paddingHorizontal: 14, justifyContent: 'center' },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { width: 28, height: 1.5, backgroundColor: colors.slate },
  eyebrowText: { letterSpacing: 3 },
  dots: { paddingVertical: 4 },
});
