import { useMutation, usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { useFriendLocation } from '@/components/friend-location-provider';
import { Globe } from '@/components/globe';
import { personInitials, personName } from '@/components/live-post';
import { AsyncButton } from '@/components/live-ui';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { Loading, SkeletonRows } from '@/components/ui/loading';
import { colors, radius, space } from '@/constants/theme';
import { api } from '@/lib/backend';
import { SELF_PLACE_ID, selfPlace, type GlobePlace } from '@/lib/globe-bridge';
import { useDeviceLocation } from '@/lib/use-device-location';

type Friend = FunctionReturnType<typeof api.friendLocations.friends>['page'][number];
function ago(time: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}
function distance(km: number) { return km < 1 ? 'Less than 1 km' : `${Math.round(km).toLocaleString()} km`; }

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { now, queryNow, settings, enable } = useFriendLocation();
  const friends = usePaginatedQuery(api.friendLocations.friends, { now: queryNow }, { initialNumItems: 100 });
  const { status: friendStatus, loadMore: loadFriends } = friends;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [focusRevision, setFocusRevision] = useState(0);
  const [zoomOutRevision, setZoomOutRevision] = useState(0);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  // Your own dot comes from this device, so it shows even when sharing is off.
  // The last shared fix is the fallback while GPS starts or if access is off.
  const device = useDeviceLocation(focused);
  const me = useMemo(() => selfPlace(device.position ?? settings?.location), [device.position, settings?.location]);
  // Load every accepted friend, including people who aren't sharing a location.
  // The list stays virtualized; location access is still checked by the backend.
  useEffect(() => { if (friendStatus === 'CanLoadMore') loadFriends(100); }, [friendStatus, loadFriends]);
  const select = useCallback((id: string) => {
    setSelectedId(id); setFocusRevision(value => value + 1); setExpanded(false);
  }, []);
  const selected = friends.results.find(friend => friend.user._id === selectedId);
  const points = useMemo<GlobePlace[]>(() => {
    const markers: GlobePlace[] = friends.results.flatMap(friend => friend.location ? [{
      _id: friend.user._id, name: personName(friend.user), lat: friend.location.lat, lng: friend.location.lng,
      markerKind: 'friend' as const, initials: personInitials(friend.user), accuracy: friend.location.accuracy,
    }] : []);
    if (me) markers.push(me);
    return markers;
  }, [friends.results, me]);
  const locate = () => me ? select(SELF_PLACE_ID) : void device.locate(() => select(SELF_PLACE_ID)).catch(() => {});
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return friends.results.filter(friend => !term || `${personName(friend.user)} ${friend.user.handle ?? ''}`.toLocaleLowerCase().includes(term))
      .sort((a, b) => personName(a.user).localeCompare(personName(b.user)));
  }, [friends.results, search]);
  const sharingCount = friends.results.filter(friend => !!friend.location).length;
  const loading = friends.status === 'LoadingFirstPage';
  const loadingMore = friends.status === 'LoadingMore' || friends.status === 'CanLoadMore';
  const panelHeight = expanded ? '64%' : selected ? '40%' : '34%';
  const openSettings = () => router.push('/friends-settings');

  return <View style={styles.root}>
    <View style={[styles.globe, { bottom: panelHeight }]}>
      <Globe active={focused} places={points} selectedId={points.some(point => point._id === selectedId) ? selectedId : undefined}
        focusRevision={focusRevision} zoomOutRevision={zoomOutRevision} onSelectPlace={select} />
    </View>
    <View style={[styles.header, { top: insets.top + space.screenTop, left: insets.left + space.gutter, right: insets.right + space.gutter }]}>
      <BrandLogo height={28} variant="white" />
      <View style={styles.controls}>
        <IconButton icon="arrowLeft" label="Back" variant="ink" onPress={() => router.canGoBack() ? router.back() : router.replace('/discover')} />
        <IconButton icon="minus" label="Return to globe view" variant="ink" onPress={() => {
          setSelectedId(undefined); setZoomOutRevision(value => value + 1);
        }} />
      </View>
    </View>
    <View style={[styles.locate, { top: insets.top + space.screenTop + 56, right: insets.right + space.gutter }]}>
      <IconButton icon="compass" label="Find my location" variant="ink" selected={selectedId === SELF_PLACE_ID}
        onPress={locate} />
    </View>
    <View style={[styles.sheet, { height: panelHeight, paddingBottom: Math.max(insets.bottom, 12),
      paddingLeft: insets.left + space.gutter, paddingRight: insets.right + space.gutter }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Show more of the map' : 'Expand people list'}
        hitSlop={10} onPress={() => setExpanded(value => !value)} style={styles.handleTarget}><View style={styles.handle} /></Pressable>
      <View style={styles.panelHeader}>
        {selected ? <>
          <IconButton icon="arrowLeft" label="Back to all people" variant="plain" onPress={() => setSelectedId(undefined)} />
          <Text variant="subheading" style={styles.grow}>People</Text>
          <IconButton icon="close" label="Close friend details" variant="plain" onPress={() => setSelectedId(undefined)} />
        </> : <>
          <View style={styles.grow}><Text variant="title3" accessibilityRole="header">People</Text>
            <Text variant="caption" color="muted">{loading ? 'Finding your friends…' : `${friends.results.length}${loadingMore ? '+' : ''} friends · ${sharingCount} sharing location`}</Text>
          </View>
          <IconButton icon="note" label="View friends’ latest posts" variant="plain"
            onPress={() => router.push({ pathname: '/feed', params: { tab: 'friends' } })} />
          <IconButton icon="sliders" label="Sharing and phone notifications" variant="ink" onPress={openSettings} />
        </>}
      </View>
      {selected ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
        <FriendDetails friend={selected} now={now} sharingOn={!!settings?.enabled} enableSharing={enable} onSettings={openSettings} />
      </ScrollView> : <>
        {(friends.results.length > 0 || !!search) && <SearchField placeholder="Find a friend" height={40} value={search} onChangeText={setSearch} />}
        <FlatList data={visible} keyExtractor={item => item.user._id} style={styles.list}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`View ${personName(item.user)}`}
            onPress={() => select(item.user._id)} style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
            <View><Avatar initials={personInitials(item.user)} color={item.location ? colors.accent : colors.canvas} size={44} />
              {item.location && <View style={styles.sharingDot} />}</View>
            <View style={styles.grow}>
              <Text variant="label" numberOfLines={1}>{personName(item.user)}</Text>
              <Text variant="caption" color="muted" numberOfLines={1}>{item.location
                ? [item.location.city ?? 'Shared location', item.distance !== null ? `${distance(item.distance)} away` : null].filter(Boolean).join(' · ')
                : 'Location not available'}</Text>
            </View>
            <View style={styles.rowEnd}>
              {item.location && <Text variant="micro" color="muted">{ago(item.location.updatedAt, now)}</Text>}
              <Icon name="chevronRight" size={14} color={colors.muted} />
            </View>
          </Pressable>}
          ListEmptyComponent={loading ? <SkeletonRows count={4} label="Loading your people…" /> : <View style={styles.empty}>
            <View style={styles.emptyIcon}><Icon name={search ? 'search' : 'users'} size={24} color={colors.accentText} /></View>
            <Text variant="cardTitle">{search ? 'No friends found' : 'Good company, anywhere'}</Text>
            {!!search && <Text variant="caption" color="muted" style={styles.emptyCopy}>Try another name or handle.</Text>}
            {!search && <Button label="Add friends" icon="userPlus" height={32} variant="secondary" onPress={openSettings} />}
          </View>}
          ListFooterComponent={loadingMore ? <Loading label="Loading the rest of your friends…" /> : undefined}
        />
      </>}
    </View>
  </View>;
}

function openProfile(userId: Friend['user']['_id']) {
  router.push({ pathname: '/user/[id]', params: { id: userId } });
}

function FriendDetails({ friend, now, sharingOn, enableSharing, onSettings }: {
  friend: Friend; now: number; sharingOn: boolean; enableSharing: () => Promise<boolean>; onSettings: () => void;
}) {
  const setSharing = useMutation(api.friendLocations.setSharing);
  const sharing = friend.sharingWith && sharingOn;
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${personName(friend.user)}’s profile`}
      onPress={() => openProfile(friend.user._id)}
      style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
      <Avatar initials={personInitials(friend.user)} color={colors.accent} size={52} />
      <View style={styles.grow}>
        <Text variant="heading" numberOfLines={1}>{personName(friend.user)}</Text>
        <Text variant="bodySmall" color="muted">{friend.location?.city ?? (friend.location ? 'Shared location' : 'Location not available')}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.muted} />
    </Pressable>
    {friend.location ? <View style={styles.facts}>
      <View style={styles.fact}><Icon name="compass" size={16} color={colors.accentText} />
        <Text variant="label">{friend.distance !== null ? `${distance(friend.distance)} away` : 'On the globe'}</Text>
        <Text variant="caption" color="muted">Approximate distance</Text></View>
      <View style={styles.fact}><Icon name="refresh" size={16} color={colors.accentText} />
        <Text variant="label">{ago(friend.location.updatedAt, now)}</Text>
        <Text variant="caption" color="muted">Accurate to ±{Math.max(1, Math.round(friend.location.accuracy)).toLocaleString()} m</Text></View>
    </View> : <Text variant="bodySmall" color="muted">Their location will appear when they choose to share it with you and have a recent update.</Text>}
    <View style={styles.sharingInfo}><Icon name={friend.sharingWith ? 'share' : 'lock'} size={16} color={colors.muted} />
      <Text variant="caption" color="muted" style={styles.grow}>{sharing ? 'They can see your location.'
        : friend.sharingWith ? 'Turn on location to let them see you.' : 'They can’t see your location.'}</Text></View>
    <AsyncButton label={sharing ? 'Stop sharing my location' : 'Share my location'} variant="secondary" height={44} onPress={async () => {
      if (sharing) { await setSharing({ friendId: friend.user._id, enabled: false }); return; }
      if (!sharingOn && !(await enableSharing())) throw new ConvexError({ message: 'Allow location access in Settings to share.' });
      await setSharing({ friendId: friend.user._id, enabled: true });
    }} />
    <Button label="View profile" icon="user" variant="secondary" height={44}
      onPress={() => openProfile(friend.user._id)} />
    <Button label="Manage sharing" icon="sliders" variant="secondary" height={44} onPress={onSettings} />
  </>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040A' },
  globe: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { position: 'absolute', minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  controls: { flexDirection: 'row', gap: 12 }, locate: { position: 'absolute' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.canvas,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10, boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' },
  handleTarget: { alignItems: 'center', justifyContent: 'center', height: 24, marginBottom: -6 },
  handle: { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.inkFaint },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  grow: { flex: 1, gap: 3 },
  list: { flex: 1 }, listContent: { paddingBottom: 8 },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.inkLine },
  pressed: { opacity: 0.65 },
  sharingDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentText, borderWidth: 2, borderColor: colors.canvas },
  rowEnd: { alignItems: 'flex-end', gap: 5 },
  empty: { alignItems: 'center', paddingVertical: 8, gap: 8 },
  emptyIcon: { height: 40, width: 40, borderRadius: radius.card, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
  emptyCopy: { textAlign: 'center' },
  detailContent: { gap: 14, paddingBottom: 8 },
  identity: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  facts: { flexDirection: 'row', gap: 8 },
  fact: { flex: 1, backgroundColor: colors.tile, borderRadius: radius.card, padding: 12, gap: 6 },
  sharingInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
