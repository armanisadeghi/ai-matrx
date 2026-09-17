// features/window-panels/detail/singletonReplacement.ts
//
// 🚨 D8 — THE SINGLETON SAYS WHAT IT CLOSED.
//
// The Detail window and the docked panel are singletons on purpose: opening a
// second record retargets the one panel, the way a Notion peek does, so the
// screen never fills with half-read records. But until 2026-09-17 the swap was
// SILENT — a deep link carrying two records opened one and dropped the other,
// and the URL was rewritten to match (VERIFY-U-P1, break attempt 1). Nothing
// on screen said a record had been closed.
//
// The singleton stays. The silence does not: the replaced record is named in
// one line, with an Undo that puts it back. Reopening through Undo is itself a
// replacement, and it is announced too — closing the record the person just
// opened is exactly the thing this rule exists to stop being silent.

import { recordToast } from "@/lib/toast";
import type { DetailInstanceData } from "@/lib/detail/types";
import { readDetailOverlayData, toDetailInstanceData } from "./detailOverlayData";

/** How long the offer to put the replaced record back stays on screen. */
const UNDO_TOAST_MS = 8000;

function nameOf(data: DetailInstanceData): string {
  const seeded = data.seed?.name?.trim();
  if (seeded) return seeded;
  return `${data.type} ${data.id.slice(0, 8)}`;
}

export interface SingletonReplacementArgs {
  /** The overlay's raw payload before this open — the record about to be closed. */
  previousData: unknown;
  /** Whether that overlay was actually open (a closed panel replaces nothing). */
  previousWasOpen: boolean;
  /** The record being opened now. */
  next: DetailInstanceData;
  /** Which singleton this is, in the person's words ("window", "docked panel"). */
  surface: string;
  /** Put the replaced record back. */
  reopen: (data: DetailInstanceData) => void;
}

/**
 * Announce a singleton replacement, when there was one. Returns true when a
 * record was actually replaced (the tests read this; the person reads the toast).
 */
export function announceSingletonReplacement(args: SingletonReplacementArgs): boolean {
  if (!args.previousWasOpen) return false;
  const parsed = readDetailOverlayData(
    args.previousData as Record<string, unknown> | null | undefined,
  );
  if (!parsed) return false;
  if (parsed.type === args.next.type && parsed.id === args.next.id) return false;

  const previous = toDetailInstanceData(parsed);
  const name = nameOf(previous);
  recordToast.info(
    { type: previous.type, id: previous.id, title: name },
    `Closed "${name}" — one record shows in the ${args.surface} at a time.`,
    {
      duration: UNDO_TOAST_MS,
      action: {
        label: "Reopen it",
        onClick: () => args.reopen(previous),
      },
    },
  );
  return true;
}
