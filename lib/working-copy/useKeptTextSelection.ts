"use client";

/**
 * useKeptTextSelection — a text view of a record puts the caret back where the
 * person left it.
 *
 * Hidden and shown (a board tile asleep and awake, React `<Activity>`) a
 * textarea keeps its DOM and so its selection; REMOUNTED (a removed tile
 * undone, a tile scrolled far away and back, a route left and re-entered) it
 * is a new element whose caret sits at 0. When a view goes away this records
 * its selection under the record's working-copy key (`workingCopies.selections`,
 * which outlives the working-copy entry); when one mounts it restores it.
 *
 * Restoring never takes focus from a field the person is typing in elsewhere
 * (`lib/dom/focus-guard`): some engines focus a field on `setSelectionRange`.
 */

import { useLayoutEffect, type RefObject } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import { personIsTypingElsewhere } from "@/lib/dom/focus-guard";
import { getKeptTextSelection, workingCopySelectionKept } from "./workingCopySlice";

export function useKeptTextSelection(
  key: string | null,
  ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  active: boolean,
): void {
  const store = useAppStore();
  useLayoutEffect(() => {
    if (!key || !active) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const kept = getKeptTextSelection(store.getState(), key);
    if (
      kept &&
      kept.end <= el.value.length &&
      (el.selectionStart !== kept.start || el.selectionEnd !== kept.end) &&
      !personIsTypingElsewhere(el)
    ) {
      el.setSelectionRange(kept.start, kept.end, kept.direction);
    }
    return () => {
      store.dispatch(
        workingCopySelectionKept({
          key,
          start: el.selectionStart ?? 0,
          end: el.selectionEnd ?? 0,
          direction: el.selectionDirection ?? "none",
        }),
      );
    };
  }, [key, active, ref, store]);
}
