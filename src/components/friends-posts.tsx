import { usePaginatedQuery, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { FriendManager } from '@/components/friend-manager';
import { LivePosts, personInitials, personName } from '@/components/live-post';
import { Notice } from '@/components/live-ui';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { colors, radius } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';

export function FriendsPosts({ initialActorId }: {
  initialActorId?: Id<'users'>;
}) {
  const friends = usePaginatedQuery(api.friends.list, {}, { initialNumItems: 30 });
  const [picked, setPicked] = useState(initialActorId);
  const [manage, setManage] = useState(false);
  const loadedFriend = friends.results.find(person => person._id === picked);
  const profile = useQuery(api.users.profile, picked && !loadedFriend ? { userId: picked } : 'skip');
  const friend = loadedFriend ?? (profile?.relationship === 'friends' ? profile : undefined);
  const actorId = friend?._id ?? (profile === undefined ? picked : undefined);
  const loading = friends.status === 'LoadingFirstPage';
  const empty = !loading && friends.results.length === 0;

  return <LivePosts mode="friends" actorId={actorId}
    emptyMessage={friend ? `No shared posts from ${personName(friend)} yet.`
      : empty ? 'Add a friend to see their latest posts here.'
        : 'No posts from friends yet. Their shared rankings, saves, and visits will appear here.'}
    header={<View style={styles.header}>
      <Text variant="subheading" accessibilityRole="header">{friend ? `${personName(friend)}’s posts` : 'Latest posts'}</Text>
      <Notice>From your Find My friends · Latest first</Notice>
      <Button label="Find my friends" icon="globe" variant="secondary" height={44} onPress={() => router.push('/friends')} />
      {!empty && <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="Show posts from all friends"
          accessibilityState={{ selected: !actorId }} onPress={() => setPicked(undefined)}
          style={[styles.filter, !actorId && styles.selected]}>
          <Text variant="caption" weight="bold">All friends</Text>
        </Pressable>
        <FlatList horizontal data={friends.results} keyExtractor={person => person._id}
          showsHorizontalScrollIndicator={false} style={styles.friends} contentContainerStyle={styles.filters}
          renderItem={({ item }) => <Pressable accessibilityRole="button"
            accessibilityLabel={`Show posts by ${personName(item)}`} accessibilityState={{ selected: actorId === item._id }}
            onPress={() => setPicked(item._id)} style={[styles.filter, actorId === item._id && styles.selected]}>
            <Avatar initials={personInitials(item)} color={colors.canvas} size={28} />
            <Text variant="caption" numberOfLines={1} style={styles.name}>{personName(item)}</Text>
          </Pressable>}
          ListFooterComponent={friends.status === 'CanLoadMore' ? <Button label="More friends" variant="link" height={44} onPress={() => friends.loadMore(30)} />
            : friends.status === 'LoadingMore' ? <Notice>Loading friends…</Notice> : undefined}
        />
      </View>}
      {loading && <Notice>Loading friends…</Notice>}
      <Button label={manage ? 'Close friend manager' : empty ? 'Find friends' : 'Manage friends'} variant="link" height={44}
        onPress={() => setManage(value => !value)} />
      {manage && <FriendManager />}
    </View>}
  />;
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingTop: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  friends: { flex: 1 },
  filters: { gap: 8 },
  filter: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.control, backgroundColor: colors.inkTint },
  selected: { backgroundColor: colors.accent },
  name: { maxWidth: 120 },
});
