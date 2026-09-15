// Support saved notifications from before structured display fields were added.
function displayFields(notification) {
  if (notification.condition) return notification;
  const match = notification.body?.match(/(\d{4}-\d{2}-\d{2}) (收盤價|成交量)為([\d,.]+)(元|千股)，(.+?)([\d,.]+)(?:元|千股)$/);
  if (!match) return null;
  const [, date, label, value, , comparison, threshold] = match;
  const high = comparison.includes('最高') || comparison.includes('最大');
  return { date, value: Number(value.replace(/,/g, '')), threshold: Number(threshold.replace(/,/g, '')),
    condition: label === '收盤價' ? high ? 'highPrice' : 'lowPrice' : high ? 'highVolume' : 'lowVolume' };
}
const format = value => Number(value).toLocaleString('zh-TW');
export function formatAlertConditions(notifications) {
  const dates = new Map();
  const fallback = [];
  for (const notification of notifications) {
    const fields = displayFields(notification);
    if (!fields) { fallback.push(notification.body || ''); continue; }
    if (!dates.has(fields.date)) dates.set(fields.date, new Map());
    const groups = dates.get(fields.date);
    const price = fields.condition.endsWith('Price');
    const key = `${price ? 'price' : 'volume'}:${fields.value}`;
    if (!groups.has(key)) groups.set(key, { price, value: fields.value, conditions: [] });
    const group = groups.get(key);
    if (!group.conditions.some(item => item.condition === fields.condition && item.threshold === fields.threshold)) group.conditions.push(fields);
  }
  const blocks = [...dates].map(([date, groups]) => {
    const lines = [...groups.values()].sort((a, b) => Number(b.price) - Number(a.price)).map(group => {
      const conditions = [...group.conditions].sort((a, b) => Number(b.condition.startsWith('high')) - Number(a.condition.startsWith('high')));
      if (group.price) {
        const high = conditions.some(item => item.condition === 'highPrice');
        const limits = conditions.map(item => `${item.condition === 'highPrice' ? '最高價' : '最低價'}${format(item.threshold)}元`).join('、');
        return `收盤價為${format(group.value)}元，${high ? '已達' : '低於'}您設定之${limits}`;
      }
      const limits = conditions.map(item => `${item.condition === 'highVolume' ? '大於您設定之最大值' : '小於您設定之最小值'}${format(item.threshold)}千股`).join('、');
      return `成交量為${format(group.value)}千股，${limits}`;
    });
    return `${date} ${lines.join('\n')}`;
  });
  return [...blocks, ...fallback].join('\n');
}
