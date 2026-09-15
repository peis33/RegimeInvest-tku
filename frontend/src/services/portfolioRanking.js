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
  if (shares !== null) return shares > 0;
  const amount = number(row?.allocated_amount ?? row?.allocatedAmount);
  return amount !== null && amount > 0;
}
