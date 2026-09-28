/**
 * Dated changes as attention items — the PURE half of the dated-change source.
 *
 * A dated change is a database change stored now and applied on a set date (first use: a model
 * price a provider announced for later). The database decides what needs saying and whether it
 * may be muted (`platform.dated_changes_for_attention`): created / upcoming / applied may be muted
 * in this browser; refused, failed, overdue, drift and an unconfirmed time zone can NOT — their
 * `mute` is `null`, so the row renders no Mute control, no stale local mute hides them, and the
 * whole-dock snooze still shows them (DATED-CHANGES-ATTACK B4).
 */

import {
  DATED_CHANGES_PAGE_HREF,
  OFFERINGS_PAGE_HREF,
  describeDatedChange,
} from "@/features/admin/dated-changes/describe";
import type { DatedChange } from "@/features/admin/dated-changes/service";
import type { AttentionDoor, AttentionItem } from "../types";

export const DATED_CHANGE_SOURCE_ID = "dated-changes";
export const DATED_CHANGE_SOURCE_LABEL = "Dated changes";

export interface DatedChangeDeps {
  muteLocally: (key: string, ms: number) => void;
  unmuteLocally: (key: string) => void;
  now?: number;
}

export function datedChangeItems(
  changes: readonly DatedChange[],
  deps: DatedChangeDeps,
): AttentionItem[] {
  const now = deps.now ?? Date.now();
  return changes
    .filter((change) => change.attention !== null)
    .map((change) => {
      const words = describeDatedChange(change, now);
      // A new attention kind for the same change is a new key: muting "scheduled" never mutes
      // "applied" or anything later.
      const key = `${DATED_CHANGE_SOURCE_ID}:${change.id}:${change.attention}`;
      const doors: AttentionDoor[] = [
        {
          kind: "impact",
          href: OFFERINGS_PAGE_HREF,
          label: "Model offerings",
          what: "Where the price this change sets is kept; every AI call is costed from it.",
        },
      ];
      if (change.sourceUrl) {
        doors.push({
          kind: "evidence",
          href: change.sourceUrl,
          label: "The provider's pricing page",
          what: change.effectiveNote ?? "The source this change was read from.",
        });
      }
      return {
        key,
        sourceId: DATED_CHANGE_SOURCE_ID,
        id: change.id,
        severity: words.severity,
        title: words.title,
        state: words.state,
        sentence: words.sentence,
        about: change.reason,
        record: {
          token: "platform_dated_change",
          id: change.id,
          href: `${DATED_CHANGES_PAGE_HREF}#${change.id}`,
        },
        doors,
        impactDeclared: true,
        actions: [],
        mute: change.mutable
          ? {
              scope: "local" as const,
              current: null,
              apply: async (untilMs: number) => {
                deps.muteLocally(key, Math.max(0, untilMs - now));
              },
              clear: async () => {
                deps.unmuteLocally(key);
              },
            }
          : null,
      };
    });
}

export function summarizeDatedChanges(items: readonly AttentionItem[]): string | null {
  if (items.length === 0) return null;
  const critical = items.filter((i) => i.severity === "critical").length;
  if (critical > 0) {
    return critical === 1
      ? "A scheduled price change was refused, failed or is overdue."
      : `${critical} scheduled price changes were refused, failed or are overdue.`;
  }
  return items.length === 1
    ? "A scheduled price change needs a look."
    : `${items.length} scheduled price changes need a look.`;
}
