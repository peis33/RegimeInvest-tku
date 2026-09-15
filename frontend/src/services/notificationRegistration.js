import { API_BASE_URL } from './investmentApi';

let preparation;
function isHomeScreen() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function supported() {
  if (!window.isSecureContext) throw new Error('手機通知需要 HTTPS 網址，區域網路 HTTP 不支援。');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !isHomeScreen()) throw new Error('請先在 Safari 選擇「分享 → 加入主畫面」，再從主畫面開啟並啟用通知。');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('此瀏覽器不支援推播；iPhone 請使用 iOS 16.4 以上並加入主畫面。');
}
async function prepare() {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  const response = await fetch(`${API_BASE_URL}/alerts/web-push-key`);
  if (!response.ok) throw new Error('後端 Web Push 尚未設定完成，請稍後再試。');
  const { publicKey } = await response.json();
  const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
  return { registration, key: Uint8Array.from(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)), (c) => c.charCodeAt(0)) };
}
export async function initializeNotificationHandler() {
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  // Register without requesting permission; permission is requested only from the button.
  preparation = prepare();
  preparation.catch(() => { preparation = null; });
  await preparation;
}
export async function registerNotifications() {
  supported();
  // Keep the permission request directly attached to the user's tap on iOS.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('尚未允許通知，請到 iPhone 設定開啟 StockApp 的通知權限。');
  if (!preparation) preparation = prepare();
  try {
    const { registration, key } = await preparation;
    const subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return { subscription: subscription.toJSON(), token: null };
  } catch (error) { preparation = null; throw error; }
}
