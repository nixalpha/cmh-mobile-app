import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function friendPushToken(request: boolean): Promise<string | null> {
  if (!request && await SecureStore.getItemAsync('travi.friendPushDisabled') === 'true') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || Constants.executionEnvironment === 'storeClient') return null;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('friend-locations', {
    name: 'Friends nearby', importance: 3,
  });
  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted && request && permissions.canAskAgain) permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export function listenForFriendNotifications(onOpen: () => void) {
  const open = (response: Notifications.NotificationResponse | null) => {
    if (response?.notification.request.content.data?.url === '/friends') {
      onOpen();
      void Notifications.clearLastNotificationResponseAsync();
    }
  };
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}

export async function setFriendPushDisabled(disabled: boolean) {
  await SecureStore.setItemAsync('travi.friendPushDisabled', String(disabled));
}
