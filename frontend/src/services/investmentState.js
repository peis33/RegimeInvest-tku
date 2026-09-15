function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function stoppedInvestmentResult(current, message) {
  return {
    ...current,
    discussion: null,
    advisory_allocation: [],
    discussion_status: { status: 'superseded', message },
  };
}

export function reconcileInvestmentResult(current, next) {
  if (!current) return next;
  const changed = current.configuration_id
    ? current.configuration_id !== next.configuration_id
    : JSON.stringify(canonical(current.profile)) !== JSON.stringify(canonical(next.profile));
  if (changed) {
    return stoppedInvestmentResult(current, '配置已在其他操作中更新，請重新計算以取得對應結果。');
  }
  // A restart removes run_id; a retry replaces it. Both are valid state changes.
  return next;
}
