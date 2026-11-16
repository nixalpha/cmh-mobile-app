import { useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { LivePosts, personInitials, personName } from '@/components/live-post';
import { Notice } from '@/components/live-ui';
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
import { api, type Id } from '@/lib/backend';

const REFRESH_HOLD_MS = 650;
const USER_ID = /^[a-z0-9]{32}$/i;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = typeof id === 'string' && USER_ID.test(id) ? id as Id<'users'> : null;

  const onRefresh = useCallback(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, REFRESH_HOLD_MS));
  }, []);

  return (
    <Screen
      backdrop="profile"
      headerActions={(
        <IconButton
          icon="arrowLeft"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/friends'))}
        />
      )}>
      {userId ? (
        <FriendProfile userId={userId} onRefresh={onRefresh} />
      ) : (
        <Notice>That profile isn’t available.</Notice>
      )}
    </Screen>
  );
}

function FriendProfile({ userId, onRefresh }: {
  userId: Id<'users'>;
  onRefresh: () => Promise<void>;
}) {
  const profile = useQuery(api.users.profile, { userId });
  const canSeeRankings = profile?.relationship === 'friends' || profile?.relationship === 'self';
  const top = useQuery(
    api.rankings.list,
    canSeeRankings
      ? { list: 'destinations', userId, paginationOpts: { numItems: 3, cursor: null } }
      : 'skip',
  );

  useEffect(() => {
    if (profile?.relationship === 'self') router.replace('/profile');
  }, [profile?.relationship]);

  if (profile === undefined) {
    return <SkeletonRows count={2} label="Loading profile…" />;
  }
  if (profile === null) {
    return <Notice>That profile isn’t available.</Notice>;
  }
  if (profile.relationship === 'self') {
    return <Loading label="Opening your profile…" />;
  }
  if (profile.relationship !== 'friends') {
    return <Notice>Only friends can see this profile.</Notice>;
  }

  const header = (
    <View style={styles.stack}>
      <Glass radius={radius.hero} style={styles.card}>
        <View style={styles.identity}>
          <Avatar initials={personInitials(profile)} color={colors.canvas} size={72} ring={3} style={styles.photo} />
          <View style={styles.identityCopy}>
            <Text variant="title2" accessibilityRole="header">{personName(profile)}</Text>
            {profile.handle && <Text variant="meta" color="muted">@{profile.handle}</Text>}
            {profile.bio && <Text variant="meta" color="muted">{profile.bio}</Text>}
          </View>
        </View>
        {profile.stats && (
          <View style={styles.stats}>
            <StatTile label="Places" value={String(profile.stats.cities)} />
            <StatTile label="Landmarks" value={String(profile.stats.landmarks)} />
            <StatTile label="Countries" value={String(profile.stats.countries)} />
          </View>
        )}
        {top === undefined ? <Loading label="Loading rankings…" /> : top.page.length > 0 && (
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
    </View>
  );

  return (
    <LivePosts
      mode="mine"
      userId={userId}
      header={header}
      emptyMessage={`${personName(profile)} hasn’t shared any posts yet.`}
      onRefresh={onRefresh}
    />
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
});
