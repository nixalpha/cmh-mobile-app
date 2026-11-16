import { useAuthActions } from '@convex-dev/auth/react';
import { useConvex, usePaginatedQuery, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useFriendLocation } from '@/components/friend-location-provider';
import { AutoCollectionSettings } from '@/components/auto-collection';
import { disableAutoCollection } from '@/lib/auto-collection';
import { Button } from '@/components/ui/button';
import { FriendManager } from '@/components/friend-manager';
import { LivePosts, personInitials, personName } from '@/components/live-post';
import { AsyncButton, AsyncIconButton, Notice } from '@/components/live-ui';
import { SectionHeader } from '@/components/section-header';
import { StatTile } from '@/components/stat-tile';
import { Avatar } from '@/components/ui/avatar';
import { CountDot } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Glass } from '@/components/ui/glass';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { selectionSpring } from '@/components/ui/sliding-indicator';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';

const segments = [
  { value: 'mine', label: 'My posts' },
  { value: 'friends', label: 'Friends’ posts' },
] as const;

export default function ProfileScreen() {
  const client = useConvex();
  const { signOut } = useAuthActions();
  const { disablePush, setBackground } = useFriendLocation();
  const me = useQuery(api.users.me, {});
  const top = useQuery(api.rankings.list, { list: 'destinations', paginationOpts: { numItems: 3, cursor: null } });
  const friends = usePaginatedQuery(api.friends.list, {}, { initialNumItems: 20 });
  const [tab, setTab] = useState<(typeof segments)[number]['value']>('mine');
  const [picked, setPicked] = useState<Id<'users'> | null>(null);
  const [manage, setManage] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const friend = friends.results.find((person) => person._id === picked);

  const header = (
    <View style={styles.stack}>
      {!!signOutError && <Notice>{signOutError}</Notice>}
      {me === undefined ? <Notice>Loading your profile…</Notice> : me === null ? <Notice>Sign in to see your profile.</Notice> : (
        <Glass radius={radius.hero} style={styles.card}>
          <View style={styles.identity}>
            <Avatar initials={personInitials(me)} color={colors.canvas} size={72} ring={3} />
            <View style={styles.identityCopy}>
              <Text variant="title2" accessibilityRole="header">{personName(me)}</Text>
              {me.bio && <Text variant="meta" color="muted">{me.bio}</Text>}
            </View>
          </View>
          {me.stats && <View style={styles.stats}>
            <StatTile label="Places" value={String(me.stats.cities)} onPress={() => router.navigate('/cities')} />
            <StatTile label="Landmarks" value={String(me.stats.landmarks)} />
            <StatTile label="Countries" value={String(me.stats.countries)} />
          </View>}
          {top === undefined ? <Notice>Loading your rankings…</Notice> : top.page.length > 0 && (
            <View style={styles.rankings}>
              <Text variant="caption" weight="bold" color="muted">Top places</Text>
              <View style={styles.topRow}>{top.page.map((item, index) => item.destination && (
                <Chip
                  key={item.itemId}
                  label={item.destination.name}
                  surface="tile"
                  selected={index === 0}
                  leading={<CountDot label={String(item.rank)} inverted={index === 0} />}
                  onPress={() => router.push({ pathname: '/place/[id]', params: { id: item.destination!._id } })}
                />
              ))}</View>
            </View>
          )}
        </Glass>
      )}
      <AutoCollectionSettings />
      <View style={styles.stack}>
        <SectionHeader title="Friends" count={me?.friendCount} trailing={manage ? 'Close' : 'Manage'} onTrailingPress={() => setManage(!manage)} />
        {friends.status === 'LoadingFirstPage' && <Notice>Loading friends…</Notice>}
        {friends.status !== 'LoadingFirstPage' && friends.results.length === 0 && <Notice>No friends yet.</Notice>}
        {friends.results.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendRow}>
          {friends.results.map((person) => (
            <Pressable
              key={person._id}
              accessibilityRole="button"
              accessibilityLabel={`Show posts by ${personName(person)}`}
              accessibilityState={{ selected: picked === person._id }}
              onPress={() => { setPicked(picked === person._id ? null : person._id); setTab('friends'); }}
              style={styles.friend}>
              <FriendRing on={picked === person._id}>
                <Avatar initials={personInitials(person)} color={colors.canvas} size={52} />
              </FriendRing>
              <Text variant="caption" weight="semibold" numberOfLines={1}>{personName(person)}</Text>
            </Pressable>
          ))}
        </ScrollView>}
        {friends.status === 'CanLoadMore' && <AsyncButton label="More friends" variant="link" onPress={async () => friends.loadMore(20)} />}
        {friends.status === 'LoadingMore' && <Notice>Loading more friends…</Notice>}
      </View>
      <Button label="Find my friends on the globe" icon="globe" variant="secondary" onPress={() => router.push('/friends')} />
      {manage && <FriendManager />}
      <SegmentedControl segments={segments} value={tab} onChange={(value) => { setTab(value); setPicked(null); }} />
      {tab === 'friends' && friend && <Text variant="meta" color="muted">{personName(friend)}</Text>}
    </View>
  );

  return (
    <Screen
      backdrop="profile"
      headerActions={(
        <AsyncIconButton icon="logOut" label="Sign out" onError={setSignOutError} onPress={async () => {
          setSignOutError('');
          await disableAutoCollection(client);
          await setBackground(false);
          await disablePush();
          await signOut();
        }} />
      )}>
      <LivePosts mode={tab} actorId={picked ?? undefined} header={header} />
    </Screen>
  );
}

function FriendRing({ on, children }: { on: boolean; children: ReactNode }) {
  const progress = useSharedValue(on ? 1 : 0);
  const scale = useSharedValue(1);
  useEffect(() => {
    progress.set(withTiming(on ? 1 : 0, { duration: 180, reduceMotion: ReduceMotion.System }));
    if (on) scale.set(withSequence(withTiming(0.92, { duration: 90 }), withSpring(1, { ...selectionSpring, damping: 12 })));
  }, [on, progress, scale]);
  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], ['rgba(14,17,22,0)', colors.ink]),
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[styles.ring, ringStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  stack: { gap: space.stack },
  card: { padding: space.inset, gap: space.inset },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.inset },
  identityCopy: { flex: 1, gap: space.inline },
  stats: { flexDirection: 'row', gap: space.stack },
  rankings: { gap: space.stack },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.stack },
  friendRow: { gap: space.stack, padding: space.fine },
  friend: { width: 72, alignItems: 'center', gap: space.inline },
  ring: { padding: 2, borderRadius: 30, borderWidth: 2, borderColor: 'transparent' },
});
