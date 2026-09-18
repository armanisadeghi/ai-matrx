/**
 * The one sentence the dock says — the PURE half of `AdminAttentionDock`.
 *
 * Pure so the negative case is provable without mutating live schedules or
 * waiting for a provider to fall over: no live items yields `null`, and `null`
 * renders nothing. A dock that says "all clear" on every page is wallpaper,
 * and wallpaper is how the next alarm gets missed.
 */

import type { AttentionItem, AttentionSeverity, AttentionSourceState } from "./types";

export interface AttentionNotice {
  /** `destructive` while any live item is critical; `warning` otherwise. */
  tone: "destructive" | "warning";
  severity: AttentionSeverity;
  /** The headline — every source's summary, joined. */
  title: string;
  /** The collapsed pill: "3 things need a person". */
  pill: string;
  criticalCount: number;
  warningCount: number;
  /** Live (un-muted) items per source, worst first, in source order. */
  sections: Array<{ source: AttentionSourceState; items: AttentionItem[] }>;
}

function isLive(item: AttentionItem, localMutes: Record<string, number>, now: number): boolean {
  const server = item.mute.current?.until;
  if (server && new Date(server).getTime() > now) return false;
  const local = localMutes[item.key];
  if (typeof local === "number" && local > now) return false;
  return true;
}

/**
 * Split every source's items into live and muted. Muted rows are not dropped —
 * the review page lists them with their reason and an un-mute — but they never
 * reach the dock.
 */
export function partitionItems(
  items: readonly AttentionItem[],
  localMutes: Record<string, number>,
  now: number = Date.now(),
): { live: AttentionItem[]; muted: AttentionItem[] } {
  const live: AttentionItem[] = [];
  const muted: AttentionItem[] = [];
  for (const item of items) (isLive(item, localMutes, now) ? live : muted).push(item);
  return { live, muted };
}

export function buildAttentionNotice(
  sources: readonly AttentionSourceState[],
  localMutes: Record<string, number>,
  now: number = Date.now(),
): AttentionNotice | null {
  const sections: AttentionNotice["sections"] = [];
  const summaries: string[] = [];
  let criticalCount = 0;
  let warningCount = 0;

  for (const source of sources) {
    const { live } = partitionItems(source.items, localMutes, now);
    if (live.length === 0) continue;
    const ordered = [
      ...live.filter((i) => i.severity === "critical"),
      ...live.filter((i) => i.severity !== "critical"),
    ];
    criticalCount += ordered.filter((i) => i.severity === "critical").length;
    warningCount += ordered.length - ordered.filter((i) => i.severity === "critical").length;
    sections.push({ source, items: ordered });
    const summary = source.summarize(ordered);
    if (summary) summaries.push(summary);
  }

  const total = criticalCount + warningCount;
  if (total === 0) return null;

  return {
    tone: criticalCount > 0 ? "destructive" : "warning",
    severity: criticalCount > 0 ? "critical" : "warning",
    title: summaries.length > 0 ? summaries.join(" ") : `${total} ${total === 1 ? "thing needs" : "things need"} a person.`,
    pill: `${total} ${total === 1 ? "thing needs" : "things need"} a person`,
    criticalCount,
    warningCount,
    sections,
  };
}
