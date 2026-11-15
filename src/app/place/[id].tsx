import { router } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { LandmarkChip } from '@/components/landmark';
import { SectionHeader } from '@/components/section-header';
import { Art } from '@/components/ui/art';
import { AvatarStack } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { radius, space } from '@/constants/theme';
import { kyoto } from '@/mocks/data';

export default function PlaceScreen() {
  const { width } = useWindowDimensions();

  return (
    <Screen
      backdrop="place"
      style={styles.content}
      background={
        <View style={[styles.hero, { width }]}>
          <Art name="kyotoHero" />
        </View>
      }
      overlay={
        <>
          <Glass radius={radius.panel} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.names}>
                <Text variant="eyebrow" color="muted" style={styles.region}>
                  {kyoto.region}
                </Text>
                <Text variant="hero" accessibilityRole="header">
                  {kyoto.name}
                </Text>
              </View>
              <View style={styles.score}>
                <Text variant="title2" style={styles.scoreValue}>
                  {kyoto.score}
                </Text>
                <Text variant="micro" weight="semibold" color="muted">
                  friends’ avg
                </Text>
              </View>
            </View>
            <View style={styles.social}>
              <AvatarStack people={kyoto.visitors} />
              <Text variant="meta" color="slate" style={styles.socialText}>
                <Text variant="meta" weight="bold">
                  {kyoto.friendCount} friends
                </Text>
                {kyoto.social}
              </Text>
            </View>
            <View style={styles.actions}>
              <Button
                label="I’ve been · rank"
                icon="rank"
                height={54}
                fontSize={15}
                style={styles.action}
                onPress={() => router.push('/rank/kyoto')}
              />
              <Button variant="secondary" label="Want to go" icon="heart" height={54} fontSize={15} style={styles.action} />
            </View>
          </Glass>

          <View style={styles.landmarks}>
            <View style={styles.inset}>
              <SectionHeader title="Landmarks to unlock" trailing={kyoto.landmarkProgress} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {kyoto.landmarks.map((landmark) => (
                <LandmarkChip key={landmark.name} {...landmark} />
              ))}
            </ScrollView>
            <Text variant="caption" color="muted" style={[styles.inset, styles.hint]}>
              {kyoto.hint}
            </Text>
          </View>
        </>
      }>
      <View style={styles.bar}>
        <IconButton icon="arrowLeft" label="Back" onPress={() => router.back()} />
        <SearchField placeholder="Search" value={kyoto.name} height={44} style={styles.search} />
        <IconButton icon="bookmark" label={`Save ${kyoto.name}`} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 0 },
  hero: { position: 'absolute', left: 0, top: 0, height: 470 },
  bar: { flexDirection: 'row', gap: 10 },
  search: { flex: 1, paddingHorizontal: 14, gap: 8 },
  card: { position: 'absolute', left: 16, right: 16, top: 300, padding: 20, gap: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  names: { gap: 4 },
  region: { letterSpacing: 2.5 },
  score: { alignItems: 'flex-end', gap: 2 },
  scoreValue: { fontSize: 28, lineHeight: 34, letterSpacing: -1 },
  social: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  socialText: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, paddingHorizontal: 8 },
  landmarks: { position: 'absolute', left: 0, right: 0, top: 618, gap: 10 },
  inset: { paddingHorizontal: space.gutter },
  chips: { gap: 8, paddingHorizontal: space.gutter },
  hint: { lineHeight: 18 },
});
