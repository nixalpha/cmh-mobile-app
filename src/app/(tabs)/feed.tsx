import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { LivePosts } from '@/components/live-post';
import { AsyncButton, Notice, PlaceArt } from '@/components/live-ui';
import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { radius, space } from '@/constants/theme';
import { api } from '@/lib/backend';

const segments = [
  { value: 'forYou', label: 'For you' },
  { value: 'friends', label: 'Friends' },
] as const;

type Recommendation = FunctionReturnType<typeof api.recommendations.forYou>['items'][number];

function reasonLabel(reason: Recommendation['reason']) {
  switch (reason.kind) {
    case 'friends_top': return `In ${reason.count} ${reason.count === 1 ? 'friend’s' : 'friends’'} top places`;
    case 'friends_want': return `${reason.count} ${reason.count === 1 ? 'friend wants' : 'friends want'} to go`;
    case 'similar_to': return `${reason.basis === 'nearby' ? 'Near' : 'Similar to'} ${reason.source.name}`;
    case 'popular': return 'Popular place to explore';
  }
}

export default function FeedScreen() {
  const [tab, setTab] = useState<(typeof segments)[number]['value']>('forYou');
  return (
    <Screen backdrop="feed">
      <View style={styles.brand}>
        <Icon name="compass" size={24} />
        <Text variant="title3">Wayfarer</Text>
      </View>
      <SegmentedControl segments={segments} value={tab} onChange={setTab} />
      {tab === 'forYou' ? <ForYou /> : <LivePosts mode="friends" />}
    </Screen>
  );
}

function ForYou() {
  const recommendations = useQuery(api.recommendations.forYou, {});
  const refresh = useMutation(api.recommendations.refresh);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    let active = true;
    void refresh({}).catch(() => { if (active) setRefreshError(true); });
    return () => { active = false; };
  }, [refresh]);

  return (
    <FlatList
      data={recommendations?.items ?? []}
      keyExtractor={(item) => item.destination._id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.stack}>
          <Text variant="heading">New for you</Text>
          {recommendations && (
            <Text variant="meta" color="muted">
              {recommendations.basedOn > 0
                ? `Based on ${recommendations.basedOn} rankings and your friends`
                : 'Start exploring. Rank places and add friends to personalize your recommendations.'}
            </Text>
          )}
          {refreshError && <Notice>We couldn’t refresh your recommendations. Try again.</Notice>}
          <AsyncButton label="Refresh recommendations" variant="link" onPress={async () => {
            await refresh({});
            setRefreshError(false);
          }} />
        </View>
      }
      ListEmptyComponent={
        <Notice>{recommendations === undefined || (recommendations.computedAt === null && !refreshError)
          ? 'Finding places for you…'
          : 'No recommendations yet. Explore places from your lists or add friends to get started.'}</Notice>
      }
      renderItem={({ item, index }) => (
        <Glass
          radius={radius.panel}
          accessibilityRole="button"
          accessibilityLabel={`Explore ${item.destination.name}`}
          onPress={() => router.push({ pathname: '/place/[id]', params: { id: item.destination._id } })}
          style={styles.card}>
          <PlaceArt place={item.destination} height={index === 0 ? 210 : 150} />
          <View style={styles.copy}>
            <Text variant={index === 0 ? 'title2' : 'heading'}>{item.destination.name}</Text>
            <Text variant="meta" color="muted">{item.destination.countryName}</Text>
            <Text variant="caption" weight="bold">{reasonLabel(item.reason)}</Text>
          </View>
        </Glass>
      )}
    />
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stack: { gap: 10 },
  list: { gap: 16, paddingBottom: space.scrollBottom },
  card: { overflow: 'hidden' },
  copy: { padding: 18, gap: 6 },
});
