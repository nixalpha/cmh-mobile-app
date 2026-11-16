import { useAuthActions } from '@convex-dev/auth/react';
import { useConvex, usePaginatedQuery, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useFriendLocation } from '@/components/friend-location-provider';
import { disableAutoCollection } from '@/lib/auto-collection';
import { LivePosts, personInitials, personName } from '@/components/live-post';
import { AsyncButton, AsyncIconButton, Notice } from '@/components/live-ui';
import { SectionHeader } from '@/components/section-header';
import { StatTile } from '@/components/stat-tile';
import { Avatar } from '@/components/ui/avatar';
import { CountDot } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Loading, SkeletonRows } from '@/components/ui/loading';
import { colors, radius, space } from '@/constants/theme';
import { api } from '@/lib/backend';

export default function ProfileScreen() {
  const client = useConvex();
  const { signOut } = useAuthActions();
  const { disablePush, setBackground } = useFriendLocation();
  const me = useQuery(api.users.me, {});
  const top = useQuery(api.rankings.list, { list: 'destinations', paginationOpts: { numItems: 3, cursor: null } });
  const friends = usePaginatedQuery(api.friends.list, {}, { initialNumItems: 20 });
  const [signOutError, setSignOutError] = useState('');

  const header = (
    <View style={styles.stack}>
      {!!signOutError && <Notice>{signOutError}</Notice>}
      {me === undefined ? <SkeletonRows count={1} label="Loading your profile…" /> : me === null ? <Notice>Sign in to see your profile.</Notice> : (
        <Glass radius={radius.hero} style={styles.card}>
          <View style={styles.identity}>
            <Avatar initials={personInitials(me)} color={colors.canvas} size={72} ring={3} style={styles.photo} />
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
          {top === undefined ? <Loading label="Loading your rankings…" /> : top.page.length > 0 && (
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
    </View>
  );

  const friendsSection = (
    <View style={styles.stack}>
      <SectionHeader title="Friends" count={me?.friendCount} />
      {friends.status === 'LoadingFirstPage' && <Loading label="Loading friends…" />}
      {friends.status !== 'LoadingFirstPage' && friends.results.length === 0 && <Notice>No friends yet.</Notice>}
      {friends.results.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendRow}>
        {friends.results.map((person) => (
          <View key={person._id} style={styles.friend}>
            <Avatar initials={personInitials(person)} color={colors.canvas} size={52} />
            <Text variant="caption" weight="semibold" numberOfLines={1}>{personName(person)}</Text>
          </View>
        ))}
      </ScrollView>}
      {friends.status === 'CanLoadMore' && <AsyncButton label="More friends" variant="link" onPress={async () => friends.loadMore(20)} />}
      {friends.status === 'LoadingMore' && <Loading label="Loading more friends…" />}
    </View>
  );

  return (
    <Screen
      backdrop="profile"
      headerActions={(<>
        <IconButton icon="plus" label="New post" onPress={() => router.push('/post/new')} />
        <AsyncIconButton icon="logOut" label="Sign out" onError={setSignOutError} onPress={async () => {
          setSignOutError('');
          await disableAutoCollection(client);
          await setBackground(false);
          await disablePush();
          await signOut();
        }} />
      </>)}>
      <LivePosts mode="mine" header={header} footer={friendsSection} emptyMessage="Tap + to post photos from a place you’ve been." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.stack },
  card: { padding: space.inset, gap: space.inset },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.inset },
  photo: { borderRadius: radius.hero },
  identityCopy: { flex: 1, gap: space.inline },
  stats: { flexDirection: 'row', gap: space.stack },
  rankings: { gap: space.stack },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.stack },
  friendRow: { gap: space.stack, padding: space.fine },
  friend: { width: 72, alignItems: 'center', gap: space.inline },
});
