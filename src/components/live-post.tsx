import { useMutation, usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { AsyncButton, AsyncIconButton, Notice, PlaceArt } from '@/components/live-ui';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Glass } from '@/components/ui/glass';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';

type Post = FunctionReturnType<typeof api.feed.friends>['page'][number];
type Person = { displayName: string | null; handle: string | null };

export function personName(person: Person) {
  return person.displayName?.trim() || person.handle || 'Traveler';
}

export function personInitials(person: Person) {
  return personName(person).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function LivePost({ post }: { post: Post }) {
  const like = useMutation(api.feed.like);
  const unlike = useMutation(api.feed.unlike);
  const placeName = post.landmark?.name ?? post.destination.name;
  const [likeError, setLikeError] = useState('');

  return (
    <Glass radius={radius.panel} style={styles.post}>
      <View style={styles.row}>
        <Avatar initials={personInitials(post.actor)} color={colors.canvas} ring={0} />
        <View style={styles.copy}>
          <Text variant="label">{personName(post.actor)} {post.type} {placeName}</Text>
          <Text variant="caption" color="muted">
            {new Date(post.postedAt).toLocaleDateString()} · {post.visibility === 'private' ? 'Only you' : 'Friends'}
          </Text>
        </View>
        {post.ranking && <Badge label={String(post.ranking.score)} height={32} />}
      </View>
      <Glass
        flat
        radius={radius.card}
        accessibilityRole="button"
        accessibilityLabel={`Explore ${post.destination.name}`}
        onPress={() => router.push({ pathname: '/place/[id]', params: { id: post.destination._id } })}
        style={styles.place}>
        <PlaceArt place={post.destination} height={140} />
        <Text variant="label" style={styles.placeLabel}>{placeName}</Text>
      </Glass>
      {post.ranking && (
        <View style={styles.copy}>
          <Text variant="meta" color="muted">Ranked #{post.ranking.rank} of {post.ranking.listSize}</Text>
          {post.ranking.showPair && post.ranking.beatName && (
            <View style={styles.pair}>
              <Text variant="label" style={styles.side}>{placeName}</Text>
              <Text variant="caption" color="muted">beat</Text>
              <Text variant="label" style={styles.side}>{post.ranking.beatName}</Text>
            </View>
          )}
          {post.ranking.note && <Text variant="bodySmall">{post.ranking.note}</Text>}
        </View>
      )}
      {post.unlock && (
        <Text variant="meta" color="muted">{post.unlock.unlockedCount} of {post.unlock.landmarkTotal} landmarks</Text>
      )}
      <View style={styles.actions}>
        <AsyncIconButton
          icon={post.likedByViewer ? 'heartFilled' : 'heart'}
          variant="plain"
          size={36}
          label={`${post.likedByViewer ? 'Unlike' : 'Like'}, ${post.likeCount} ${post.likeCount === 1 ? 'like' : 'likes'}`}
          selected={post.likedByViewer}
          onError={setLikeError}
          onPress={async () => {
            setLikeError('');
            await (post.likedByViewer ? unlike : like)({ activityId: post._id });
          }}
        />
        <Text variant="meta" weight="bold" accessible={false}>{post.likeCount}</Text>
        <Text variant="meta" color="muted" style={styles.comments}>{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</Text>
      </View>
      {!!likeError && <Notice>{likeError}</Notice>}
    </Glass>
  );
}

export function LivePosts({ mode, actorId, header }: {
  mode: 'mine' | 'friends';
  actorId?: Id<'users'>;
  header?: ReactElement;
}) {
  const mine = usePaginatedQuery(api.feed.byUser, mode === 'mine' ? {} : 'skip', { initialNumItems: 10 });
  const friends = usePaginatedQuery(api.feed.friends, mode === 'friends' ? { actorId } : 'skip', { initialNumItems: 10 });
  const posts = mode === 'mine' ? mine : friends;

  return (
    <FlatList
      data={posts.results}
      keyExtractor={(post) => post._id}
      renderItem={({ item }) => <LivePost post={item} />}
      ListHeaderComponent={header}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Notice>{posts.status === 'LoadingFirstPage'
        ? 'Loading posts…'
        : mode === 'mine' ? 'Your rankings, saves, and landmarks appear here.'
          : 'No posts from friends yet.'}</Notice>}
      ListFooterComponent={posts.status === 'CanLoadMore'
        ? <AsyncButton label="Load more posts" variant="secondary" onPress={async () => posts.loadMore(10)} />
        : posts.status === 'LoadingMore' ? <Notice>Loading more posts…</Notice> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: space.stack, paddingBottom: space.scrollBottom },
  post: { padding: space.inset, gap: space.stack },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  copy: { flex: 1, gap: space.inline },
  place: { overflow: 'hidden' },
  placeLabel: { padding: space.inset },
  pair: { padding: space.inset, borderRadius: radius.card, backgroundColor: colors.tile, flexDirection: 'row', alignItems: 'center', gap: space.stack },
  side: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  comments: { marginLeft: space.stack },
});
