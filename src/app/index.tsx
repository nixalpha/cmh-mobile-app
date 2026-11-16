import { Redirect, router } from 'expo-router';
import { useConvexAuth } from 'convex/react';
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { BrandHeader } from '@/components/brand-header';
import { useScreenTop } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

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
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, space.gutter);
  const fall = useSharedValue(0);

  useEffect(() => {
    fall.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1);
  }, [fall]);

  if (isAuthenticated) return <Redirect href="/feed" />;

  return (
    <View style={styles.root}>
      <Image source={require('../../assets/images/everest.jpg')} resizeMode="cover" style={styles.background} />
      {flakes.map((flake, index) => (
        <Flake key={index} progress={fall} {...flake} />
      ))}

      <View style={[styles.safeArea, { paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={[styles.content, { paddingTop: top, paddingBottom: bottom }]}>
          <BrandHeader />
          <Glass radius={radius.hero} style={styles.card}>
            <Text variant="display" accessibilityRole="header">
              Rank the places you’ve been.
            </Text>
            <Button label="Get started" trailingIcon="arrowRight" onPress={() => router.push('/auth?mode=signup')} />
            <Button
              variant="link"
              label="Sign in"
              height={48}
              fontSize={15}
              onPress={() => router.push('/auth?mode=signin')}
            />
            {__DEV__ && <Button label="Dev mode — skip onboarding" variant="secondary" onPress={() => router.push('/dev')} />}
          </Glass>
        </View>
      </View>
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
  root: { flex: 1, backgroundColor: colors.canvas, overflow: 'hidden' },
  background: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  flake: { position: 'absolute', borderRadius: 2, backgroundColor: colors.white, opacity: 0.9 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: space.screenMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: space.gutter,
    justifyContent: 'space-between',
    gap: space.stack,
  },
  card: {
    paddingTop: space.inset,
    paddingHorizontal: space.inset,
    paddingBottom: space.inset,
    gap: space.stack,
  },
});
