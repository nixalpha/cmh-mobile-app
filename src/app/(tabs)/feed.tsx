import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DestinationCard } from '@/components/destination-card';
import { SectionHeader } from '@/components/section-header';
import { Art } from '@/components/ui/art';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { colors, radius } from '@/constants/theme';
import { friendsFeed, me, recommendations } from '@/mocks/data';

const segments = [
  { value: 'forYou', label: 'For you' },
  { value: 'friends', label: 'Friends' },
] as const;

export default function FeedScreen() {
  const [tab, setTab] = useState<(typeof segments)[number]['value']>('forYou');
  const openKyoto = () => router.push('/place/kyoto');

  return (
    <Screen backdrop="feed" scroll>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Icon name="compass" size={24} />
          <Text variant="title3">Wayfarer</Text>
        </View>
        <View style={styles.actions}>
          <IconButton icon="search" label="Search" onPress={openKyoto} />
          <IconButton icon="bell" label="Notifications, 3 new" badge />
        </View>
      </View>

      <SegmentedControl segments={segments} value={tab} onChange={setTab} />

      {tab === 'forYou' ? <ForYou onOpen={openKyoto} /> : <Friends />}
    </Screen>
  );
}

function ForYou({ onOpen }: { onOpen: () => void }) {
  const { hero, more } = recommendations;
  return (
    <View style={styles.stack}>
      <SectionHeader variant="heading" title="New for you" trailing={`Based on ${me.rankings} rankings`} />
      <DestinationCard
        size="hero"
        art={hero.art}
        name={hero.name}
        meta={hero.meta}
        tag={hero.reason}
        onPress={onOpen}
        action={<IconButton variant="ink" icon="bookmark" label={`Save ${hero.name}`} />}
      />
      <View style={styles.grid}>
        {more.map((place) => (
          <DestinationCard key={place.name} {...place} onPress={onOpen} />
        ))}
      </View>
    </View>
  );
}

function Friends() {
  const { ranking, unlock } = friendsFeed;
  return (
    <View style={styles.stack}>
      <Glass radius={radius.panel} style={styles.post}>
        <View style={styles.postHeader}>
          <Avatar initials={ranking.friend.initials} color={ranking.friend.color} ring={0} />
          <View style={styles.postCopy}>
            <Text variant="label">
              {ranking.friend.name}{' '}
              <Text variant="label" weight="medium" color="muted">
                ranked
              </Text>{' '}
              {ranking.place}
            </Text>
            <Text variant="caption" color="muted">
              {ranking.meta}
            </Text>
          </View>
          <Badge label={ranking.score} height={32} />
        </View>
        <View style={styles.versus}>
          {[ranking.winner, ranking.loser].map((side) => (
            <View key={side.name} style={styles.side}>
              <Art name={side.art} />
              <View style={styles.sideLabel}>
                <Text variant="caption" weight="bold" color="white">
                  {side.name}
                </Text>
              </View>
            </View>
          ))}
          <Glass radius={22} style={styles.beat}>
            <Text variant="meta" weight="extrabold">
              beat
            </Text>
          </Glass>
        </View>
        <Text variant="bodySmall" color="inkSoft">
          {ranking.note}
        </Text>
        <View style={styles.postActions}>
          <Reaction icon="heart" count={ranking.likes} label="Like" />
          <Reaction icon="comment" count={ranking.comments} label="Comments" />
          <View style={styles.spacer} />
          <Pressable
            onPress={() => router.push('/rank/kyoto')}
            accessibilityRole="button"
            style={styles.rankYours}>
            <Text variant="meta" weight="bold">
              Rank yours
            </Text>
          </Pressable>
        </View>
      </Glass>

      <Glass radius={radius.panel} style={styles.unlock}>
        <Avatar initials={unlock.friend.initials} color={unlock.friend.color} ring={0} />
        <View style={styles.postCopy}>
          <Text variant="label">
            {unlock.friend.name}{' '}
            <Text variant="label" weight="medium" color="muted">
              unlocked
            </Text>{' '}
            {unlock.place}
          </Text>
          <Text variant="caption" color="muted">
            {unlock.meta}
          </Text>
        </View>
        <Art name={unlock.art} width={48} height={48} />
      </Glass>
    </View>
  );
}

function Reaction({ icon, count, label }: { icon: 'heart' | 'comment'; count: number; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${count}`} style={styles.reaction}>
      <Icon name={icon} size={20} color={colors.slate} />
      <Text variant="meta" weight="semibold" color="slate">
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  stack: { gap: 16 },
  grid: { flexDirection: 'row', gap: 12 },
  post: { padding: 14, gap: 12 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postCopy: { flex: 1, gap: 1 },
  versus: { flexDirection: 'row', gap: 6, height: 200, alignItems: 'stretch' },
  side: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  sideLabel: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    justifyContent: 'center',
    backgroundColor: 'rgba(14,17,22,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  beat: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -22,
    marginTop: -22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reaction: { height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  spacer: { flex: 1 },
  rankYours: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center',
    backgroundColor: colors.inkTint,
  },
  unlock: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
