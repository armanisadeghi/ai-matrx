/**
 * Persist the filtered/sorted page id order so the editor can do prev/next
 * without re-deriving filters. Cleared when the list remounts with a new set.
 */
const ORDER_KEY = "html-pages:nav-order";

export function setHtmlPagesNavOrder(ids: string[]): void {
  try {
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch {
    // sessionStorage may be unavailable (private mode / SSR)
  }
}

export function getHtmlPagesNavOrder(): string[] {
  try {
    const raw = sessionStorage.getItem(ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function getAdjacentHtmlPageIds(
  currentId: string,
  order: string[],
): {
  prevId: string | null;
  nextId: string | null;
  index: number;
  total: number;
} {
  const index = order.indexOf(currentId);
  if (index < 0) {
    return { prevId: null, nextId: null, index: -1, total: order.length };
  }
  return {
    prevId: index > 0 ? order[index - 1]! : null,
    nextId: index < order.length - 1 ? order[index + 1]! : null,
    index,
    total: order.length,
  };
}
