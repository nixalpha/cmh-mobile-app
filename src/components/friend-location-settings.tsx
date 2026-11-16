import { useMutation, usePaginatedQuery } from 'convex/react';
import { openSettings } from 'expo-linking';
import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { useFriendLocation } from '@/components/friend-location-provider';
import { FriendManager } from '@/components/friend-manager';
import { personName } from '@/components/live-post';
import { AsyncButton, Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { Loading, SkeletonRows } from '@/components/ui/loading';
import { colors } from '@/constants/theme';
import { api } from '@/lib/backend';
import { friendBackgroundSupported } from '@/lib/friend-background';

function Toggle({ label, detail, value, onChange, accessory }: {
  label: string; detail?: string; value: boolean; onChange: (value: boolean) => Promise<unknown>; accessory?: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <View style={styles.toggleBlock}><View style={styles.toggle}>
    <View style={styles.copy}><Text variant="label">{label}</Text>{detail && <Text variant="caption" color="muted">{detail}</Text>}</View>
    {accessory}
    <Switch accessibilityLabel={label} value={value} disabled={pending} trackColor={{ true: colors.accent }} onValueChange={async next => {
      setPending(true); setError(false);
      try { await onChange(next); } catch { setError(true); } finally { setPending(false); }
    }} />
  </View>{error && <Notice>Could not save. Try again.</Notice>}</View>;
}

export function FriendLocationSettings() {
  const location = useFriendLocation();
  const { settings, queryNow } = location;
  const updateSettings = useMutation(api.friendLocations.updateSettings);
  const share = useMutation(api.friendLocations.setSharing);
  const friends = usePaginatedQuery(api.friendLocations.friends, { now: queryNow }, { initialNumItems: 20 });
  if (!settings) return <Loading label="Loading your location settings…" />;
  const city = settings.visitingCity;
  return <>
    <Text variant="heading">Location</Text>
    <Toggle label="Use my location" detail={location.status} value={settings.enabled}
      onChange={enabled => enabled ? location.enable() : updateSettings({ enabled: false })}
      accessory={settings.enabled && <IconButton icon="refresh" label="Refresh my location" size={36} onPress={location.refresh} />} />
    {!!location.error && <Notice>{location.error}</Notice>}
    {!!location.error && Platform.OS !== 'web' && <AsyncButton label="Open device settings" variant="link" onPress={openSettings} />}
    {friendBackgroundSupported && settings.enabled && <Toggle label="Update in the background" value={location.backgroundEnabled} onChange={location.setBackground} />}
    <Text variant="subheading">Share with</Text>
    {friends.results.map(friend => <Toggle key={friend.user._id} label={personName(friend.user)}
      detail={friend.location ? 'Sharing with you' : undefined} value={friend.sharingWith}
      onChange={enabled => share({ friendId: friend.user._id, enabled })} />)}
    {friends.status === 'LoadingFirstPage' && <SkeletonRows count={2} label="Loading friends…" />}
    {friends.status === 'Exhausted' && friends.results.length === 0 && <Notice>No friends yet.</Notice>}
    {friends.status === 'CanLoadMore' && <Button label="More friends" variant="link" onPress={() => friends.loadMore(20)} />}
    <Text variant="subheading">Alerts</Text>
    <Toggle label="Friends nearby" detail="Within 10 km" value={settings.nearbyAlerts} onChange={nearbyAlerts => updateSettings({ nearbyAlerts })} />
    <Toggle label={city ? `Friends in ${city.name}` : 'Friends in my city'}
      detail={city ? `${city.name}, ${city.countryName}` : settings.enabled ? 'Detecting your city…' : 'Turn on location to detect your city'}
      value={settings.cityAlerts} onChange={cityAlerts => updateSettings({ cityAlerts })} />
    <AsyncButton label={location.pushEnabled ? 'Turn off phone notifications' : 'Enable phone notifications'} variant="secondary"
      onPress={location.pushEnabled ? location.disablePush : location.enablePush} />
    {!!location.pushMessage && <Notice>{location.pushMessage}</Notice>}
    <FriendManager />
  </>;
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: 3 },
  toggleBlock: { gap: 4 },
  toggle: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 52 },
});
