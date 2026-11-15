import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PostRow } from '@/components/post-row';
import { SectionHeader } from '@/components/section-header';
import { StatTile } from '@/components/stat-tile';
import { Avatar } from '@/components/ui/avatar';
import { CountDot } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { colors, radius } from '@/constants/theme';
import { friendPosts, friends, me, myPosts } from '@/mocks/data';

const segments = [
  { value: 'mine', label: 'My posts' },
  { value: 'friends', label: 'Friends’ posts' },
] as const;

export default function ProfileScreen() {
  const [tab, setTab] = useState<(typeof segments)[number]['value']>('mine');
  const [picked, setPicked] = useState<string | null>(null);

  const friend = friends.find((person) => person.id === picked);
  const posts =
    tab === 'mine' ? myPosts : friend ? friendPosts.filter((post) => post.by === friend.id) : friendPosts.slice(0, 4);
  const filterLabel =
    tab === 'mine'
      ? 'Your rankings and unlocks'
      : friend
        ? `Showing ${friend.name} · tap again for everyone`
        : 'Recent from everyone · tap a friend to filter';

  return (
    <Screen backdrop="profile" scroll>
      <View style={styles.header}>
        <Text weight="bold" color="slate">
          {me.handle}
        </Text>
        <View style={styles.actions}>
          <IconButton icon="share" label="Share profile" />
          <IconButton icon="sliders" label="Settings" />
        </View>
      </View>

      <Glass radius={radius.hero} style={styles.card}>
        <View style={styles.identity}>
          <Avatar initials={me.initials} color={me.color} size={72} ring={3} />
          <View style={styles.identityCopy}>
            <Text variant="title2" style={styles.name} accessibilityRole="header">
              {me.name}
            </Text>
            <Text variant="meta" color="muted">
              {me.bio}
            </Text>
            <View style={styles.privacy}>
              <Icon name="lock" size={12} strokeWidth={2.5} color={colors.inkSoft} />
              <Text variant="micro" weight="bold" color="inkSoft">
                {me.privacy}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.stats}>
          {me.stats.map((stat) => (
            <StatTile
              key={stat.label}
              {...stat}
              onPress={stat.label === 'Cities' ? () => router.navigate('/cities') : undefined}
            />
          ))}
        </View>
        <View style={styles.top}>
          <Text variant="caption" weight="bold" color="muted" style={styles.topLabel}>
            TOP 3 CITIES
          </Text>
          <View style={styles.topRow}>
            {me.topCities.map((city, index) => (
              <Chip
                key={city}
                label={city}
                surface="tile"
                selected={index === 0}
                leading={<CountDot label={String(index + 1)} inverted={index === 0} />}
              />
            ))}
          </View>
        </View>
      </Glass>

      <View style={styles.friends}>
        <SectionHeader title="Friends" count={me.friendCount} trailing="See all" onTrailingPress={() => {}} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendRow}>
          {friends.map((person) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityState={{ selected: picked === person.id }}
              onPress={() => {
                setPicked(picked === person.id ? null : person.id);
                setTab('friends');
              }}
              style={styles.friend}>
              <View style={[styles.ring, picked === person.id && styles.ringOn]}>
                <Avatar initials={person.initials} color={person.color} size={52} />
              </View>
              <Text variant="caption" weight="semibold">
                {person.first}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <SegmentedControl
        segments={segments}
        value={tab}
        onChange={(value) => {
          setTab(value);
          if (value === 'mine') setPicked(null);
        }}
      />

      <View style={styles.posts}>
        <Text variant="meta" weight="semibold" color="muted">
          {filterLabel}
        </Text>
        {posts.map((post) => (
          <PostRow key={post.who + post.place} post={post} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: 8 },
  card: { padding: 20, gap: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityCopy: { flex: 1, gap: 4, alignItems: 'flex-start' },
  name: { fontSize: 24, letterSpacing: -0.6 },
  privacy: {
    height: 26,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 13,
    backgroundColor: 'rgba(14,17,22,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stats: { flexDirection: 'row', gap: 8 },
  top: { gap: 8 },
  topLabel: { letterSpacing: 1.5 },
  topRow: { flexDirection: 'row', gap: 8 },
  friends: { gap: 10 },
  friendRow: { gap: 14, padding: 2 },
  friend: { width: 60, alignItems: 'center', gap: 6 },
  ring: { padding: 2, borderRadius: 30, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: colors.ink },
  posts: { gap: 10 },
});
