// advisory_weights are percentage points (0–100), never fractional weights.
export function judgeAllocation(judge) {
  const weights = judge?.advisory_weights;
  if (judge?.judge_numeric_legalization?.applied || !weights || typeof weights !== 'object' || Array.isArray(weights)) return null;
  const entries = Object.entries(weights);
  if (!Object.hasOwn(weights, 'CASH') || entries.length < 2 ||
      entries.some(([asset, value]) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (asset === 'CASH' ? 100 : 30))) return null;
  const stock = entries.reduce((sum, [asset, value]) => sum + (asset === 'CASH' ? 0 : value), 0);
  const total = stock + weights.CASH;
  if (Math.abs(total - 100) > 0.02000001) return null;
  // Allocate rounding residue only in the two-card presentation, not saved data.
  const stockHundredths = Math.round(stock / total * 10000);
  return { stock: stockHundredths / 100, cash: (10000 - stockHundredths) / 100,
    adjustedForDisplay: Math.abs(total - 100) > 0.000001 };
}
