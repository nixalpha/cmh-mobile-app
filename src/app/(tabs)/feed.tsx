import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { FriendsPosts } from '@/components/friends-posts';
import { AsyncIconButton, Notice, PlaceArt } from '@/components/live-ui';
import { Glass } from '@/components/ui/glass';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { SkeletonCards } from '@/components/ui/loading';
import { radius, space } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';

const segments = [
  { value: 'forYou', label: 'For you' },
  { value: 'friends', label: 'Friends' },
] as const;

type Recommendation = FunctionReturnType<typeof api.recommendations.forYou>['items'][number];

function reasonLabel(reason: Recommendation['reason']) {
  switch (reason.kind) {
    case 'friends_top': return `In ${reason.count} ${reason.count === 1 ? 'friend’s' : 'friends’'} top places`;
    case 'friends_want': return `${reason.count} ${reason.count === 1 ? 'friend wants' : 'friends want'} to go`;
    case 'visited_similar': return reason.sourceCount > 1
      ? `Based on ${reason.source.name} and ${reason.sourceCount - 1} other ${reason.sourceCount === 2 ? 'visit' : 'visits'}`
      : `${reason.basis === 'nearby' ? 'Near' : 'More places like'} ${reason.source.name}, which you visited`;
    case 'similar_to': return `${reason.basis === 'nearby' ? 'Near' : 'Similar to'} ${reason.source.name}`;
    case 'popular': return 'Popular';
  }
}

export default function FeedScreen() {
  const params = useLocalSearchParams<{ tab?: string; friendId?: Id<'users'> }>();
  const [tab, setTab] = useState<(typeof segments)[number]['value']>('forYou');
  useFocusEffect(useCallback(() => {
    if (params.tab === 'friends') setTab('friends');
  }, [params.tab]));
  const refresh = useMutation(api.recommendations.refresh);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    let active = true;
    void refresh({}).catch(() => { if (active) setRefreshError(true); });
    return () => { active = false; };
  }, [refresh]);

  return (
    <Screen backdrop="feed" headerActions={tab === 'forYou' && (
        <AsyncIconButton
          icon="refresh"
          label="Refresh recommendations"
          onError={() => setRefreshError(true)}
          onPress={async () => {
            await refresh({});
            setRefreshError(false);
          }}
        />
      )}>
      <SegmentedControl segments={segments} value={tab} onChange={setTab} />
      {tab === 'forYou' ? <ForYou refreshError={refreshError} /> : <FriendsPosts key={params.friendId ?? 'all'} initialActorId={params.friendId} />}
    </Screen>
  );
}

function ForYou({ refreshError }: { refreshError: boolean }) {
  const recommendations = useQuery(api.recommendations.forYou, {});

  return (
    <FlatList
      data={recommendations?.items ?? []}
      keyExtractor={(item) => item.destination._id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.intro}>
          <Text variant="heading">Your next great trip</Text>
          <Text variant="caption" color="muted">
            {recommendations && recommendations.basedOn > 0
              ? `Inspired by ${recommendations.basedOn} ${recommendations.basedOn === 1 ? 'place you’ve' : 'places you’ve'} visited. Add visits and rank your favorites to tune your picks.`
              : 'A little inspiration to get started. Add places you’ve visited to make these picks yours.'}
          </Text>
          {refreshError && <Notice>Couldn’t refresh. Try again.</Notice>}
        </View>
      }
      ListEmptyComponent={
        recommendations === undefined || (recommendations.computedAt === null && !refreshError)
          ? <SkeletonCards count={2} label="Finding places for you…" artHeight={180} />
          : <Notice>Add places you’ve visited to discover where to go next.</Notice>
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
  list: { gap: space.stack, paddingBottom: space.scrollBottom },
  intro: { gap: space.inline },
  card: { overflow: 'hidden' },
  copy: { padding: space.inset, gap: space.inline },
});
