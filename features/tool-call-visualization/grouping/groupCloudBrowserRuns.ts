export type CloudBrowserRunClass = "browser" | "bridge" | "break";

export interface CollectedCloudBrowserRun<T> {
  browserItems: T[];
  bridgeItems: T[];
  nextIndex: number;
  breakAfter: boolean;
}

export interface CloudBrowserTurnFragment<T> {
  id: string;
  memberIndex: number;
  order: number;
  items: T[];
  breakBefore: boolean;
  breakAfter: boolean;
}

export interface CloudBrowserTurnGroup<T> {
  primaryId: string;
  fragmentIds: string[];
  items: T[];
  compact: boolean;
}

/**
 * Collect one browser run without losing the thinking/status/short-text items
 * between its calls. Browser calls join across any number of bridge items and
 * stop only at a real content/tool boundary.
 */
export function collectCloudBrowserRun<T>(
  items: T[],
  startIndex: number,
  classify: (item: T) => CloudBrowserRunClass,
): CollectedCloudBrowserRun<T> {
  const first = items[startIndex];
  if (!first || classify(first) !== "browser") {
    throw new Error("collectCloudBrowserRun must start on a browser item");
  }

  const browserItems: T[] = [first];
  const bridgeItems: T[] = [];
  let index = startIndex + 1;

  while (index < items.length) {
    const item = items[index];
    const itemClass = classify(item);
    if (itemClass === "break") break;
    if (itemClass === "browser") browserItems.push(item);
    else bridgeItems.push(item);
    index++;
  }

  return {
    browserItems,
    bridgeItems,
    nextIndex: index,
    breakAfter: index < items.length,
  };
}

/** Merge browser fragments emitted by separate assistant messages in one turn. */
export function groupCloudBrowserTurnFragments<T>(
  fragments: CloudBrowserTurnFragment<T>[],
): CloudBrowserTurnGroup<T>[] {
  const sorted = [...fragments].sort(
    (a, b) => a.memberIndex - b.memberIndex || a.order - b.order,
  );
  const groups: Array<CloudBrowserTurnFragment<T>[]> = [];

  for (const fragment of sorted) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (!current || fragment.breakBefore || previous?.breakAfter) {
      groups.push([fragment]);
    } else {
      current.push(fragment);
    }
  }

  return groups.map((group, index) => ({
    primaryId: group[0].id,
    fragmentIds: group.map((fragment) => fragment.id),
    items: group.flatMap((fragment) => fragment.items),
    compact: index > 0,
  }));
}
