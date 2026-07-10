/**
 * Canonical notes tab URL order: active first, then every other open tab.
 * Keeps `?tabs=` and the strip's mental model aligned — reload never loses
 * which note was focused just because it wasn't first in the list.
 */
export function orderTabsActiveFirst(
  tabs: readonly string[],
  activeId: string | null | undefined,
): string[] {
  if (!activeId) return [...tabs];
  if (!tabs.includes(activeId)) return [activeId, ...tabs];
  return [activeId, ...tabs.filter((id) => id !== activeId)];
}
