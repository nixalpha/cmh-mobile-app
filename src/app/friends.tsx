import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { openSettings } from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFriendLocation } from '@/components/friend-location-provider';
import { FriendManager } from '@/components/friend-manager';
import { Globe } from '@/components/globe';
import { personInitials, personName } from '@/components/live-post';
import { AsyncButton, Notice } from '@/components/live-ui';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';
import { friendBackgroundSupported } from '@/lib/friend-background';
import type { GlobePlace } from '@/lib/globe-bridge';

type Panel = 'people' | 'alerts' | 'settings';
type Filter = 'all' | 'nearby' | 'city';
function ago(time: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  return minutes < 1 ? 'Just updated' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const location = useFriendLocation();
  const { now, settings } = location;
  const friends = usePaginatedQuery(api.friendLocations.friends, { now }, { initialNumItems: 30 });
  const alerts = usePaginatedQuery(api.friendLocations.alerts, { now }, { initialNumItems: 20 });
  const markRead = useMutation(api.friendLocations.markAlertRead);
  const [panel, setPanel] = useState<Panel>('people');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [focusRevision, setFocusRevision] = useState(0);
  const [zoomOutRevision, setZoomOutRevision] = useState(0);
  const selectedFriend = useQuery(api.friendLocations.get, selectedId && selectedId !== 'me'
    && !friends.results.some(friend => friend.user._id === selectedId) ? { friendId: selectedId as Id<'users'>, now } : 'skip');
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const select = useCallback((id: string) => {
    setSelectedId(id); setFocusRevision(value => value + 1); setPanel('people'); setExpanded(false);
  }, []);
  const points = useMemo<GlobePlace[]>(() => {
    const markers: GlobePlace[] = friends.results.flatMap(friend => friend.location ? [{
      _id: friend.user._id, name: personName(friend.user), lat: friend.location.lat, lng: friend.location.lng,
      markerKind: 'friend' as const, initials: personInitials(friend.user), accuracy: friend.location.accuracy,
    }] : []);
    if (selectedFriend) markers.push({ _id: selectedFriend.user._id, name: personName(selectedFriend.user),
      lat: selectedFriend.location.lat, lng: selectedFriend.location.lng, accuracy: selectedFriend.location.accuracy, markerKind: 'friend', initials: personInitials(selectedFriend.user) });
    if (settings?.location) markers.push({ _id: 'me', name: 'You', lat: settings.location.lat, lng: settings.location.lng,
      markerKind: 'self', initials: 'You', accuracy: settings.location.accuracy });
    return markers;
  }, [friends.results, settings, selectedFriend]);
  const selected = friends.results.find(friend => friend.user._id === selectedId);
  const visible = friends.results.filter(friend => filter === 'all' || (filter === 'nearby'
    ? friend.distance !== null && friend.distance <= 10 : friend.inVisitingCity));
  const unread = alerts.results.filter(alert => !alert.read).length;
  const loading = friends.status === 'LoadingFirstPage';
  const activeId = points.some(point => point._id === selectedId) ? selectedId : undefined;

  return (
    <View style={styles.root}>
      <View style={[styles.globe, expanded && styles.globeExpanded]}>
        <Globe active={focused} places={points} selectedId={activeId} focusRevision={focusRevision}
          zoomOutRevision={zoomOutRevision} onSelectPlace={select} />
      </View>
      <View style={[styles.mapHeader, { top: insets.top + 12, left: insets.left + 20, right: insets.right + 20 }]}>
        <IconButton size={44} icon="arrowLeft" label="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/discover')} />
        <View style={styles.mapTitle}>
          <Text variant="heading" color="white">Find my friends</Text>
          <Text variant="caption" style={styles.onDark}>A little closer, wherever you go</Text>
        </View>
      </View>
      <View style={[styles.mapControls, { top: insets.top + 88, right: insets.right + 20 }]}>
        <IconButton size={44} icon="globe" label="Show the whole globe" onPress={() => { setSelectedId(undefined); setZoomOutRevision(v => v + 1); }} />
        <IconButton size={44} icon="compass" label="Find my location" disabled={!settings?.location} onPress={() => select('me')} />
      </View>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12), paddingLeft: insets.left + 20,
        paddingRight: insets.right + 20 }, expanded && styles.sheetExpanded]}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Show more of the map' : 'Expand friends panel'}
          onPress={() => setExpanded(v => !v)} style={styles.handleTarget}><View style={styles.handle} /></Pressable>
        <View style={styles.tabs} accessibilityRole="tablist">
          {(['people', 'alerts', 'settings'] as const).map(value => (
            <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: panel === value }}
              onPress={() => { setPanel(value); setExpanded(value !== 'people'); }} style={[styles.tab, panel === value && styles.tabSelected]}>
              <Text variant="label">{value === 'people' ? 'People' : value === 'settings' ? 'Sharing' : `Alerts${unread ? ` · ${unread}` : ''}`}</Text>
            </Pressable>
          ))}
        </View>
        {panel === 'people' && <>
          <View style={styles.filters}>
            {([['all', 'Everyone'], ['nearby', 'Nearby · 10 km'], ['city', 'Visiting city']] as const).map(([value, label]) => (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }}
                onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterSelected]}>
                <Text variant="caption" weight={filter === value ? 'bold' : 'regular'}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {filter === 'city' && <Notice>{settings?.visitingCity ? `Friends in ${settings.visitingCity.name}` : 'Choose a visiting city in Sharing to find friends there.'}</Notice>}
          {filter === 'nearby' && !settings?.location && <Notice>Turn on your location in Sharing to see who is nearby.</Notice>}
          {settings?.location && <Pressable accessibilityRole="button" onPress={() => select('me')} style={styles.you}>
            <View style={styles.locationDot} /><View style={styles.copy}>
              <Text variant="label">You{settings.location.city ? ` · ${settings.location.city}` : ''}</Text>
              <Text variant="caption" color="muted">{ago(settings.location.updatedAt, now)} · ±{Math.max(1, Math.round(settings.location.accuracy))} m</Text>
            </View><Icon name="compass" />
          </Pressable>}
          {selected?.location && <Text variant="caption" color="muted">Selected: {personName(selected.user)} · {selected.location.city ?? 'Shared location'}</Text>}
          <FlatList
            data={visible} keyExtractor={item => item.user._id} style={styles.list} contentContainerStyle={styles.listContent}
            renderItem={({ item }) => <Pressable accessibilityRole="button" disabled={!item.location}
              accessibilityLabel={`${personName(item.user)}, ${item.location ? 'show shared location' : 'location not shared'}`}
              onPress={() => select(item.user._id)} style={[styles.person, selectedId === item.user._id && styles.selectedPerson]}>
              <Avatar initials={personInitials(item.user)} color={item.location ? colors.accent : colors.canvas} size={42} />
              <View style={styles.copy}>
                <Text variant="label">{personName(item.user)}</Text>
                <Text variant="caption" color="muted">{item.location ? [item.location.city ?? 'Shared location',
                  item.distance !== null ? `${item.distance < 1 ? '<1' : Math.round(item.distance)} km away` : null].filter(Boolean).join(' · ')
                  : 'Location unavailable or not shared with you'}</Text>
                {item.location && <Text variant="caption" color="muted">{ago(item.location.updatedAt, now)} · ±{Math.max(1, Math.round(item.location.accuracy))} m</Text>}
              </View>
              {item.location && <Icon name="chevronRight" color={colors.muted} />}
            </Pressable>}
            ListEmptyComponent={<View style={styles.empty}>
              <Icon name="users" size={28} color={colors.muted} />
              <Text variant="subheading">{loading ? 'Finding your friends…' : filter === 'nearby' ? 'No friends nearby yet' : filter === 'city' ? 'No friends in this city yet' : 'Your people, around the world'}</Text>
              {!loading && <Notice>{friends.results.length ? 'Friends appear when they share a fresh location with you.' : 'Add a friend, then choose who can see your location in Sharing.'}</Notice>}
              {!loading && <Button label="Manage friends & sharing" variant="secondary" onPress={() => { setPanel('settings'); setExpanded(true); }} />}
            </View>}
            ListFooterComponent={friends.status === 'CanLoadMore' ? <Button label="Load more friends" variant="link" onPress={() => friends.loadMore(30)} />
              : friends.status === 'LoadingMore' ? <Notice>Loading more friends…</Notice> : undefined}
          />
        </>}
        {panel === 'alerts' && <FlatList
          data={alerts.results} keyExtractor={item => item._id} style={styles.list} contentContainerStyle={styles.listContent}
          ListHeaderComponent={<Notice>Nearby means within 10 km. City alerts use the city you choose in Sharing. Up to one of each per friend, per day.</Notice>}
          renderItem={({ item }) => <View style={[styles.alert, !item.read && styles.unread]}>
            <Icon name={item.kind === 'nearby' ? 'users' : 'cities'} />
            <View style={styles.copy}>
              <Text variant="label">{personName(item.actor)} {item.kind === 'nearby' ? 'was nearby' : `was in ${item.cityName ?? 'your visiting city'}`}</Text>
              <Text variant="caption" color="muted">{ago(item.eventTime, now)}</Text>
              <AsyncButton label={item.read ? 'View on globe' : 'View & mark read'} variant="link" onPress={async () => {
                await markRead({ alertId: item._id }); select(item.actor._id);
              }} />
            </View>
          </View>}
          ListEmptyComponent={<View style={styles.empty}><Icon name="bell" size={28} color={colors.muted} />
            <Text variant="subheading">A familiar face, a new place</Text>
            <Notice>{alerts.status === 'LoadingFirstPage' ? 'Loading your alerts…' : 'Your alerts will appear here when a friend shares a location nearby or in your visiting city.'}</Notice></View>}
          ListFooterComponent={alerts.status === 'CanLoadMore' ? <Button label="More alerts" variant="link" onPress={() => alerts.loadMore(20)} /> : undefined}
        />}
        {panel === 'settings' && <ScrollView style={styles.list} contentContainerStyle={styles.settings}>
          <SharingSettings />
        </ScrollView>}
      </View>
    </View>
  );
}

function Toggle({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (value: boolean) => Promise<unknown> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <View style={styles.toggleBlock}><View style={styles.toggle}>
    <View style={styles.copy}><Text variant="label">{label}</Text>{detail && <Text variant="caption" color="muted">{detail}</Text>}</View>
    <Switch accessibilityLabel={label} value={value} disabled={pending} trackColor={{ true: colors.accent }} onValueChange={async next => {
      setPending(true); setError(false);
      try { await onChange(next); } catch { setError(true); } finally { setPending(false); }
    }} />
  </View>{error && <Notice>Could not save this setting. Please try again.</Notice>}</View>;
}

function SharingSettings() {
  const location = useFriendLocation();
  const { settings, now } = location;
  const updateSettings = useMutation(api.friendLocations.updateSettings);
  const share = useMutation(api.friendLocations.setSharing);
  const friends = usePaginatedQuery(api.friendLocations.friends, { now }, { initialNumItems: 20 });
  if (!settings) return <Notice>Loading sharing settings…</Notice>;
  return <>
    <Text variant="heading">Your location, your choice</Text>
    <Notice>Share your device location only with friends you select below. Updates run while Travi is open, or in the background if you enable it. Locations disappear after 24 hours without an update. Your friends must choose to share with you too.</Notice>
    <Toggle label="Use my location" detail={location.status} value={settings.enabled}
      onChange={enabled => enabled ? location.enable() : updateSettings({ enabled: false })} />
    {!!location.error && <Notice>{location.error}</Notice>}
    {settings.enabled && <AsyncButton label="Refresh my location" variant="secondary" onPress={async () => location.refresh()} />}
    {!!location.error && Platform.OS !== 'web' && <AsyncButton label="Open device settings" variant="link" onPress={openSettings} />}
    {friendBackgroundSupported && settings.enabled && <Toggle label="Update while Travi is closed" detail="Uses background location. Your device may pause updates to save battery." value={location.backgroundEnabled} onChange={location.setBackground} />}
    <Text variant="subheading">Share with selected friends</Text>
    <Notice>Each switch lets that friend see your precise location and receive alerts about you. Turning off “Use my location” pauses sharing with everyone.</Notice>
    {friends.results.map(friend => <Toggle key={friend.user._id} label={`Share with ${personName(friend.user)}`}
      detail={friend.location ? 'Shares their location with you' : 'Not sharing a location with you'} value={friend.sharingWith}
      onChange={enabled => share({ friendId: friend.user._id, enabled })} />)}
    {friends.status === 'LoadingFirstPage' && <Notice>Loading friends…</Notice>}
    {friends.status === 'Exhausted' && friends.results.length === 0 && <Notice>Add a friend below to start sharing.</Notice>}
    {friends.status === 'CanLoadMore' && <Button label="More friends" variant="link" onPress={() => friends.loadMore(20)} />}
    <Text variant="subheading">Your alerts</Text>
    <Toggle label="Friends nearby" detail="Within 10 km of your latest location" value={settings.nearbyAlerts} onChange={nearbyAlerts => updateSettings({ nearbyAlerts })} />
    <Toggle label="Friends in my visiting city" detail="Choose a city to look out for familiar faces" value={settings.cityAlerts} onChange={cityAlerts => updateSettings({ cityAlerts })} />
    <CityPicker city={settings.visitingCity} onSelect={visitingDestinationId => updateSettings({ visitingDestinationId })} />
    <AsyncButton label={location.pushEnabled ? 'Turn off push alerts on this device' : 'Enable push alerts on this device'} variant="secondary"
      onPress={location.pushEnabled ? location.disablePush : location.enablePush} />
    {!!location.pushMessage && <Notice>{location.pushMessage}</Notice>}
    <FriendManager />
  </>;
}

function CityPicker({ city, onSelect }: { city: { _id: Id<'destinations'>; name: string; countryName: string } | null; onSelect: (id: Id<'destinations'> | null) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const results = useQuery(api.destinations.search, search ? { query: search, limit: 12 } : 'skip');
  return <View style={styles.cityPicker}>
    {city && <View style={styles.row}><View style={styles.copy}><Text variant="label">Visiting {city.name}</Text><Notice>{city.countryName}</Notice></View>
      <AsyncButton label="Clear" variant="link" onPress={() => onSelect(null)} /></View>}
    <TextInput accessibilityLabel="Search for a city you are visiting" placeholder="Which city are you visiting?" placeholderTextColor={colors.muted}
      value={text} onChangeText={setText} onSubmitEditing={() => setSearch(text.trim())} returnKeyType="search" style={styles.input} />
    <Button label="Search cities" icon="search" variant="secondary" disabled={!text.trim()} onPress={() => setSearch(text.trim())} />
    {!!search && results === undefined && <Notice>Searching cities…</Notice>}
    {!!search && results?.filter(result => result.kind === 'city').length === 0 && <Notice>No cities found. Try another name.</Notice>}
    {results?.filter(result => result.kind === 'city').map(result => <AsyncButton key={result._id} label={`${result.name}, ${result.countryName}`} variant="link" onPress={async () => {
      await onSelect(result._id); setText(''); setSearch('');
    }} />)}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040A' },
  globe: { position: 'absolute', top: 0, left: 0, right: 0, bottom: '44%' },
  globeExpanded: { bottom: '74%' },
  mapHeader: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 12 },
  mapTitle: { flex: 1, gap: 2 },
  onDark: { color: '#D7DDF0' },
  mapControls: { position: 'absolute', gap: 10 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '47%', backgroundColor: colors.canvas,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 8 },
  sheetExpanded: { height: '77%' },
  handleTarget: { alignItems: 'center', justifyContent: 'center', height: 44 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.inkFaint },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: colors.inkTint, padding: 4, borderRadius: radius.control },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: radius.control },
  tabSelected: { backgroundColor: colors.white },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  filter: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 20 },
  filterSelected: { backgroundColor: colors.accent },
  list: { flex: 1 }, listContent: { paddingBottom: 16, gap: 4 },
  copy: { flex: 1, gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.inkLine, borderRadius: radius.card },
  selectedPerson: { backgroundColor: colors.tileStrong },
  you: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, backgroundColor: colors.tile, borderRadius: radius.card },
  locationDot: { height: 14, width: 14, borderRadius: 7, backgroundColor: '#4679D6', borderWidth: 3, borderColor: '#C8DDFE' },
  empty: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: radius.card },
  unread: { backgroundColor: colors.tileStrong },
  settings: { gap: 16, paddingBottom: 28 },
  toggleBlock: { gap: 4 }, toggle: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 },
  cityPicker: { padding: 12, backgroundColor: colors.tile, gap: 8, borderRadius: radius.card },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { minHeight: 48, padding: 12, color: colors.ink, backgroundColor: colors.white, borderRadius: radius.field, fontFamily: fonts.regular, fontSize: 15 },
});
