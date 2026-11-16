import { useMutation, useQuery } from 'convex/react';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFriendLocation } from '@/components/friend-location-provider';
import { personName } from '@/components/live-post';
import { AsyncIconButton } from '@/components/live-ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';
import { api } from '@/lib/backend';

export function FriendLocationBanner() {
  const { now } = useFriendLocation();
  const result = useQuery(api.friendLocations.alerts, { now, paginationOpts: { numItems: 20, cursor: null } });
  const markRead = useMutation(api.friendLocations.markAlertRead);
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState('');
  const alert = result?.page.find(item => !item.read);
  if (!alert || path === '/friends') return null;
  return <View style={[styles.position, { top: insets.top + 12, left: insets.left + 20, right: insets.right + 20 }]} pointerEvents="box-none">
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Icon name="users" color={colors.accentText} size={22} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open friend location alert" onPress={() => router.push('/friends')} style={styles.copy}>
        <Text variant="label">{personName(alert.actor)} {alert.kind === 'nearby' ? 'was nearby' : `was in ${alert.cityName ?? 'your visiting city'}`}</Text>
        <Text variant="caption" color="muted">Tap to find your friends on the globe</Text>
        {!!error && <Text variant="caption">{error}</Text>}
      </Pressable>
      <AsyncIconButton icon="close" label="Dismiss friend location alert" onError={setError} onPress={() => markRead({ alertId: alert._id })} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  position: { position: 'absolute', zIndex: 100, alignItems: 'center' },
  banner: { width: '100%', maxWidth: space.screenMaxWidth, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.accent,
    boxShadow: '0 6px 22px rgba(0,0,0,0.15)' },
  copy: { flex: 1, gap: 3, minHeight: 44, justifyContent: 'center' },
});
