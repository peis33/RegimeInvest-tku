import { Platform } from 'react-native';
import Constants from 'expo-constants';

export async function registerNotifications() {
  if (Constants.appOwnership === 'expo') throw new Error('手機推播需要安裝開發版 App，Expo Go 不支援。');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('尚未設定 EAS projectId，請先完成手機開發版設定。');
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('price-alerts', { name: '觸價警示', importance: Notifications.AndroidImportance.HIGH });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('尚未允許通知，請到手機設定開啟此 App 的通知權限。');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function initializeNotificationHandler() {
  if (Constants.appOwnership === 'expo') return;
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
}
