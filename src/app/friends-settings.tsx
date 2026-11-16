import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FriendLocationSettings } from '@/components/friend-location-settings';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';

export default function FriendsSettingsScreen() {
  return <Screen scroll headerActions={<IconButton icon="arrowLeft" label="Back to people" variant="ink"
    onPress={() => router.canGoBack() ? router.back() : router.replace('/friends')} />}>
    <View style={styles.content}><FriendLocationSettings /></View>
  </Screen>;
}
const styles = StyleSheet.create({ content: { gap: 20, paddingTop: 12 } });
