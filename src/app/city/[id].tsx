import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { LandmarkCard, LandmarkLabel } from '@/components/landmark';
import { SectionHeader } from '@/components/section-header';
import { Art } from '@/components/ui/art';
import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { ProofLegend } from '@/components/ui/proof';
import { Screen, useScreenTop } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';
import { paris } from '@/mocks/data';

const SHEET_OVERHANG = 40;

export default function CityScreen() {
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  const top = useScreenTop();
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(withTiming(-6, { duration: 3000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [bob]);

  const island = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  return (
    <Screen
      backdrop="city"
      color="#E3EAF2"
      style={styles.content}
      overlay={
        <>
          <Animated.View style={[styles.island, { top: top + 74, left: (width - 390) / 2 }, island]}>
            <Art name="parisIsland" width={390} height={420} />
            {paris.labels.map(({ left, top: labelTop, ...label }) => (
              <LandmarkLabel key={label.name} {...label} style={{ left, top: labelTop }} />
            ))}
          </Animated.View>

          <Glass radius={radius.sheet} style={[styles.drawer, { height: (open ? 540 : 300) + SHEET_OVERHANG }]}>
            <Pressable
              onPress={() => setOpen(!open)}
              accessibilityRole="button"
              accessibilityLabel="Expand landmarks drawer"
              accessibilityState={{ expanded: open }}
              style={styles.grabberHit}>
              <View style={styles.grabber} />
            </Pressable>
            <SectionHeader title="Worth it next time" trailing="Sorted by friends who went" />
            <ScrollView
              horizontal={!open}
              showsHorizontalScrollIndicator={false}
              style={styles.nextScroll}
              contentContainerStyle={[styles.next, open && styles.nextWrap]}>
              {paris.next.map((landmark) => (
                <LandmarkCard key={landmark.name} {...landmark} />
              ))}
            </ScrollView>
            {open && (
              <View style={styles.nudge}>
                <Icon name="lock" size={20} />
                <Text variant="meta" color="inkSoft" style={styles.nudgeText}>
                  {paris.nudge}
                </Text>
              </View>
            )}
          </Glass>
        </>
      }>
      <View style={styles.header}>
        <IconButton icon="arrowLeft" label="Back to cities" onPress={() => router.back()} />
        <View style={styles.title}>
          <Text variant="title2" accessibilityRole="header">
            {paris.name}
          </Text>
          <Text variant="meta" color="muted">
            {paris.meta}
          </Text>
        </View>
        <Glass radius={22} style={styles.collected}>
          <Text variant="meta" weight="extrabold">
            {paris.collected} collected
          </Text>
        </Glass>
      </View>
      <ProofLegend />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, gap: 1 },
  collected: { height: 44, paddingHorizontal: 16, justifyContent: 'center' },
  island: { position: 'absolute', width: 390, height: 420 },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -SHEET_OVERHANG,
    paddingTop: 10,
    paddingHorizontal: space.gutter,
    paddingBottom: 28 + SHEET_OVERHANG,
    gap: 14,
  },
  grabberHit: { alignSelf: 'center', width: 80, height: 24, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.inkFaint },
  nextScroll: { flexGrow: 0, marginHorizontal: -space.gutter },
  next: { gap: 10, paddingHorizontal: space.gutter },
  nextWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  nudge: {
    borderRadius: 20,
    backgroundColor: 'rgba(14,17,22,0.05)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nudgeText: { flex: 1, lineHeight: 19 },
});
