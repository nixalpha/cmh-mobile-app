import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { openSettings } from 'expo-linking';
import { useState } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View } from 'react-native';

import { useFriendLocation } from '@/components/friend-location-provider';
import { FriendManager } from '@/components/friend-manager';
import { personName } from '@/components/live-post';
import { AsyncButton, Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';
import { friendBackgroundSupported } from '@/lib/friend-background';

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

export function FriendLocationSettings() {
  const location = useFriendLocation();
  const { settings, queryNow } = location;
  const updateSettings = useMutation(api.friendLocations.updateSettings);
  const share = useMutation(api.friendLocations.setSharing);
  const friends = usePaginatedQuery(api.friendLocations.friends, { now: queryNow }, { initialNumItems: 20 });
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
    <Text variant="subheading">Phone notifications</Text>
    <Toggle label="Friends nearby" detail="Within 10 km of your latest location" value={settings.nearbyAlerts} onChange={nearbyAlerts => updateSettings({ nearbyAlerts })} />
    <Toggle label="Friends in my visiting city" detail="Choose a city to look out for familiar faces" value={settings.cityAlerts} onChange={cityAlerts => updateSettings({ cityAlerts })} />
    <CityPicker city={settings.visitingCity} onSelect={visitingDestinationId => updateSettings({ visitingDestinationId })} />
    <AsyncButton label={location.pushEnabled ? 'Turn off phone notifications' : 'Enable phone notifications'} variant="secondary"
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
  copy: { flex: 1, gap: 3 },
  toggleBlock: { gap: 4 },
  toggle: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 52 },
  cityPicker: { padding: 12, backgroundColor: colors.tile, gap: 8, borderRadius: radius.card },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { minHeight: 48, padding: 12, color: colors.ink, backgroundColor: colors.white, borderRadius: radius.field, fontFamily: fonts.regular, fontSize: 15 },
});
