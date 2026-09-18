const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function sortByRecommendation(rows) {
  return [...rows].sort((left, right) => {
    const a = number(left?.selection_score ?? left?.selectionScore);
    const b = number(right?.selection_score ?? right?.selectionScore);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });
}
export function hasSuggestedPosition(row) {
  const shares = number(row?.shares);
  // A positive decimal here can be an unexecutable remainder from the
  // optimizer (for example 0.0193 shares).  Taiwan odd-lot orders still need
  // at least one whole share, and the UI displays whole-share quantities.
  if (shares !== null) return Math.floor(shares + 1e-6) >= 1;
  const amount = number(row?.allocated_amount ?? row?.allocatedAmount);
  const price = number(row?.price);
  if (amount === null || amount <= 0) return false;
  return price === null || price <= 0 ? true : amount + 1e-6 >= price;
}
