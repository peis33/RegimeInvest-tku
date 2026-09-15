import { STOCKS } from '../data/stocks';

export function taipeiDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
// Select by data date, including the latest manually uploaded trading day.
export function latestAlertQuote(points) {
  if (!Array.isArray(points)) return undefined;
  return points.reduce((latest, point) => {
    if (!point?.date) return latest;
    return !latest || point.date > latest.date ? point : latest;
  }, undefined);
}
const number = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};
export function buildAlertRules(rules) {
  return rules.map(rule => {
    const symbol = STOCKS.find(stock => stock.name === rule.selectedCompany)?.symbol;
    const thresholds = Object.fromEntries(['highPrice', 'lowPrice', 'highVolume', 'lowVolume'].map(key => [key, number(rule[key])]));
    let valid = Object.values(thresholds).every(value => value === null || (Number.isFinite(value) && value > 0));
    let expires = null;
    if (rule.year || rule.month || rule.day) {
      const y = Number(rule.year), m = Number(rule.month), d = Number(rule.day);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (!y || !m || !d || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) valid = false;
      else expires = date.toISOString().slice(0, 10);
    }
    // Each threshold is independent; overlapping conditions may all trigger.
    return { id: rule.id, symbol, name: rule.selectedCompany, ...thresholds, expires,
      valid, enabled: !!symbol && rule.alertEnabled !== false && valid && Object.values(thresholds).some(value => value !== null) };
  });
}
export function evaluateAlert(rule, quote, today = taipeiDate()) {
  if (!rule.enabled || (rule.expires && today > rule.expires) || !quote?.date || quote.date > today) return [];
  const close = number(quote.close), volume = number(quote.volume);
  const conditions = [
    ['highPrice', close, close >= rule.highPrice, '收盤價', '元', '已達您設定之最高價'],
    ['lowPrice', close, close < rule.lowPrice, '收盤價', '元', '低於您設定之最低價'],
    ['highVolume', volume, volume > rule.highVolume, '成交量', '千股', '大於您設定之最大值'],
    ['lowVolume', volume, volume < rule.lowVolume, '成交量', '千股', '小於您設定之最小值'],
  ];
  return conditions.filter(([key, value, hit]) => rule[key] !== null && value !== null && Number.isFinite(value) && hit).map(([key, value, , label, unit, comparison]) => ({
    id: JSON.stringify([rule.id, rule.symbol, key, rule[key], rule.expires, quote.date]),
    title: '觸價預警',
    company: rule.name,
    date: quote.date,
    condition: key,
    value,
    threshold: rule[key],
    body: `${rule.name} ${quote.date} ${label}為${value.toLocaleString('zh-TW')}${unit}，${comparison}${rule[key].toLocaleString('zh-TW')}${unit}`,
  }));
}
