import { useMutation, usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { AsyncButton, Notice, PlaceArt } from '@/components/live-ui';
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
        radius={20}
        accessibilityRole="button"
        accessibilityLabel={`Explore ${post.destination.name}`}
        onPress={() => router.push({ pathname: '/place/[id]', params: { id: post.destination._id } })}
        style={styles.place}>
        <PlaceArt place={post.destination} height={140} />
        <Text variant="label" style={styles.placeLabel}>{placeName}</Text>
      </Glass>
      {post.ranking && (
        <View style={styles.copy}>
          <Text variant="meta" color="muted">Ranked #{post.ranking.rank} of {post.ranking.listSize} at posting</Text>
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
      {post.visit && <VisitDetails visit={post.visit} />}
      {post.unlock && (
        <Text variant="meta" color="muted">{post.unlock.unlockedCount} of {post.unlock.landmarkTotal} landmarks unlocked at posting</Text>
      )}
      <View style={styles.actions}>
        <AsyncButton
          label={`${post.likedByViewer ? 'Unlike' : 'Like'} · ${post.likeCount}`}
          variant="secondary"
          onPress={() => (post.likedByViewer ? unlike : like)({ activityId: post._id })}
        />
        <Text variant="meta" color="muted">{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</Text>
      </View>
    </Glass>
  );
}

function VisitDetails({ visit }: { visit: NonNullable<Post['visit']> }) {
  const more = visit.photoCount - visit.photos.length;
  const day = visit.visitedOn?.split('-').map(Number);
  return (
    <View style={styles.copy}>
      {visit.photos.length > 0 && (
        <View style={styles.photos}>
          {visit.photos.map((photo, i) => (
            <View key={photo.url} style={styles.photo}>
              <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              {more > 0 && i === visit.photos.length - 1 && (
                <View style={styles.more}><Text variant="label" color="white">+{more}</Text></View>
              )}
            </View>
          ))}
        </View>
      )}
      {(visit.companions.length > 0 || day) && (
        <Text variant="meta" color="muted">
          {[
            visit.companions.length > 0 ? `With ${visit.companions.map(personName).join(', ')}` : null,
            day ? new Date(day[0], day[1] - 1, day[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      )}
      {visit.note && <Text variant="bodySmall">{visit.note}</Text>}
    </View>
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
        : mode === 'mine' ? 'Your rankings, saves, and unlocks will appear here.'
          : 'No posts here yet. Add friends or check back after they share a place.'}</Notice>}
      ListFooterComponent={posts.status === 'CanLoadMore'
        ? <AsyncButton label="Load more posts" variant="secondary" onPress={async () => posts.loadMore(10)} />
        : posts.status === 'LoadingMore' ? <Notice>Loading more posts…</Notice> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: 16, paddingBottom: space.scrollBottom },
  post: { padding: 14, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flex: 1, gap: 6 },
  place: { overflow: 'hidden' },
  placeLabel: { padding: 12 },
  pair: { padding: 12, borderRadius: 16, backgroundColor: colors.tile, flexDirection: 'row', alignItems: 'center', gap: 12 },
  side: { flex: 1 },
  photos: { flexDirection: 'row', gap: 6 },
  photo: { flex: 1, aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.inkTint },
  more: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,17,22,0.45)' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
});
