import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, fetchLatestStockCharts } from '../services/investmentApi';
import { buildAlertRules, evaluateAlert, taipeiDate, latestAlertQuote } from '../services/inAppAlerts';
export { buildAlertRules } from '../services/inAppAlerts';

const KEY = 'stockapp.in-app-alerts.v1';
const LEGACY_KEY = 'stockapp.push-device.v1';
export default function usePriceAlerts(rules, ready) {
  const [notifications, setNotifications] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('正在讀取 App 內警示設定…');
  const journal = useRef({ seen: {}, pending: [] });
  const alertsEnabled = rules.some(rule => rule.alertEnabled !== false);
  const alertsEnabledRef = useRef(alertsEnabled);
  alertsEnabledRef.current = alertsEnabled;
  const saveChain = useRef(Promise.resolve());
  const persist = useCallback(() => {
    const snapshot = JSON.stringify(journal.current);
    saveChain.current = saveChain.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, snapshot));
    saveChain.current.catch(() => setMessage('通知記錄儲存失敗，重新開啟 App 時可能重複通知'));
  }, []);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY).then(raw => {
      const stored = raw ? JSON.parse(raw) : null;
      if (active && stored?.seen && Array.isArray(stored.pending)) {
        journal.current = stored;
        setNotifications(stored.pending);
      }
    }).catch(() => { if (active) setMessage('無法讀取通知記錄'); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  const payload = JSON.stringify(buildAlertRules(rules));
  useEffect(() => {
    if (!ready || !loaded || alertsEnabled) return;
    journal.current.pending = [];
    setNotifications([]);
    persist();
  }, [alertsEnabled, ready, loaded, persist]);
  useEffect(() => {
    if (!ready || !loaded) return;
    let active = true, checking = false;
    const normalized = JSON.parse(payload);
    const check = async () => {
      if (checking || (AppState.currentState && AppState.currentState !== 'active')) return;
      checking = true;
      try {
        // Cancel this device's previous system push rules when migrating to in-app alerts.
        try {
          const rawDevice = await AsyncStorage.getItem(LEGACY_KEY);
          if (rawDevice) {
            const device = JSON.parse(rawDevice);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
              const response = await fetch(`${API_BASE_URL}/alerts/rules`, {
                method: 'PUT', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${device.secret}` },
                body: JSON.stringify({ token: null, subscription: null, rules: [] }),
              });
              if (response.ok) await AsyncStorage.removeItem(LEGACY_KEY);
            } finally { clearTimeout(timeout); }
          }
        } catch { /* Retry legacy cleanup next time; in-app evaluation can continue. */ }
        const today = taipeiDate();
        const enabled = normalized.filter(rule => rule.enabled && (!rule.expires || rule.expires >= today));
        const symbols = [...new Set(enabled.map(rule => rule.symbol))];
        const results = await Promise.allSettled(symbols.map(async symbol => {
          const result = await fetchLatestStockCharts(symbol, 30);
          return { symbol, quote: latestAlertQuote(result?.data?.points) };
        }));
        if (!active || !alertsEnabledRef.current) return;
        const additions = [];
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          for (const rule of enabled.filter(item => item.symbol === result.value.symbol)) {
            for (const notification of evaluateAlert(rule, result.value.quote, today)) {
              if (journal.current.seen[notification.id]) continue;
              journal.current.seen[notification.id] = today;
              additions.push(notification);
            }
          }
        }
        if (additions.length) {
          journal.current.pending = [...journal.current.pending, ...additions];
          setNotifications(journal.current.pending);
          persist();
        }
        const failures = results.flatMap((result, index) => {
          const name = enabled.find(rule => rule.symbol === symbols[index])?.name || symbols[index];
          if (result.status === 'rejected') {
            const error = result.reason;
            const reason = error?.name === 'AbortError' ? '行情連線逾時' : error?.status ? `行情服務回應 ${error.status}` : '無法連上行情後端，請確認電腦後端已啟動及手機網路';
            return [`${name}：${reason}`];
          }
          return result.value?.quote ? [] : [`${name}：後端尚無行情資料`];
        });
        setMessage(failures.length ? `${failures.join('；')}。下次回到 App 時再檢查` : normalized.some(rule => !rule.valid) ? '請確認門檻為有效正數，並填寫完整截止日期或全部留空' : enabled.length ? `已啟用 ${enabled.length} 筆 App 內警示；開啟或回到 App 時檢查最新資料的收盤價與成交量` : '目前沒有啟用且未到期的警示');
      } catch (error) { if (active) setMessage('行情暫時無法讀取，下次回到 App 時再檢查'); }
      finally { checking = false; }
    };
    const timer = setTimeout(check, 800);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => { active = false; clearTimeout(timer); listener.remove(); };
  }, [payload, ready, loaded, persist]);
  const dismiss = useCallback(id => {
    journal.current.pending = journal.current.pending.filter(item => item.id !== id);
    setNotifications(journal.current.pending);
    persist();
  }, [persist]);
  const dismissAll = useCallback(() => {
    journal.current.pending = [];
    setNotifications([]);
    persist();
  }, [persist]);
  return { message, notifications: ready && loaded && alertsEnabled ? notifications : [], dismiss, dismissAll };
}
