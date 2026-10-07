// features/spaces/page/time.ts — Notion's "Edited 37m ago" wording: relative for a day, then the date.

import { formatRelativeTime } from "@ai-matrx/kit/format";

const NOTION = { minUnit: "minute", absoluteAfter: 86_400_000, absolute: "monthDay" } as const;

export function editedAgo(iso: string, now = Date.now()): string {
  return `Edited ${formatRelativeTime(iso, { ...NOTION, now })}`;
}

/** A comment's time, as Notion writes it beside the author: "Just now", "5m", "3h", "Oct 4". */
export function commentAgo(iso: string, now = Date.now()): string {
  const stamp = formatRelativeTime(iso, { ...NOTION, suffix: false, now });
  return stamp === "now" ? "Just now" : stamp;
}
