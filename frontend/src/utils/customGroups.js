export function getCustomGroupDisplayName(group, groups = []) {
  const explicitName = String(group?.name || '').trim();

  if (explicitName) {
    return explicitName;
  }

  const groupIndex = groups.findIndex((item) => item?.id === group?.id);

  return `自訂群組${groupIndex >= 0 ? groupIndex + 1 : 1}`;
}
