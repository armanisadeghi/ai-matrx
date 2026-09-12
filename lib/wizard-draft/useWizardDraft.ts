"use client";

// lib/wizard-draft/useWizardDraft.ts
//
// THE ANSWERS MUST LAST AS LONG AS THE STEP (W43, Arman's Expert, 2026-09-12).
//
// A multi-step form that keeps its STEP in the URL and its ANSWERS in React
// state is holding two things with different lifetimes. The URL survives a
// reload, a tab restore, a shared link and a crash, synchronously and always.
// The answers survive only if something persisted them AND that read has
// already come back. When the two disagree the person is shown a
// complete-looking later step built from defaults — and on /masterwork/new she
// pressed Start and got a Rulebook with no goal in it, with nothing said.
//
// This hook is the one way to hold those answers. It wraps the generic
// `wizardDraftSlice` (do not fork a per-feature draft slice) and adds the two
// things that were missing:
//
//   1. `status` — "loading" until the persisted read has actually had its
//      chance (`useSyncHydrated`), so a step can never be rendered from an
//      unread cache.
//   2. `restore` — every stored key is handed to the caller's mapper, and a
//      value the mapper REFUSES is reported in `rejectedKeys`, never dropped
//      in silence. The Masterwork bug was exactly a silent drop: the
//      multi-select answer persists as "A | B", the restorer validated it
//      against single option values, and the Expert's answer became the
//      default with no trace.
//
// Pair it with `resolveWizardStep` (same directory) for the step decision.

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  clearWizardDraft,
  patchWizardDraft,
  selectWizardDraft,
} from "@/lib/redux/slices/wizardDraftSlice";
import { useSyncHydrated } from "@/lib/sync/useSyncHydrated";

export type WizardDraftStatus =
  /** The persisted read has not come back yet. Decide nothing from this. */
  | "loading"
  /** Read finished, a draft was there. */
  | "found"
  /** Read finished, nothing saved (never started, expired, other device). */
  | "absent";

export interface WizardDraftRestore<T> {
  /** The restored values, or null while loading / when nothing was saved. */
  values: T | null;
  /** Stored keys the mapper refused. Non-empty means something was lost. */
  rejectedKeys: string[];
}

export interface UseWizardDraftResult<T> {
  status: WizardDraftStatus;
  /** Restored values — settles exactly once, when `status` leaves "loading". */
  restored: WizardDraftRestore<T> | null;
  /** Shallow-merge fields into the draft. Safe to call on every keystroke. */
  patch: (fields: Record<string, unknown>) => void;
  /** Drop the draft. Call on successful completion, never before. */
  clear: () => void;
}

export interface UseWizardDraftOptions<T> {
  /**
   * Map the stored bag to this wizard's values. Push every key you accept into
   * `accept`; anything you do not accept is reported as rejected. Called at
   * most once per mount, when the read settles.
   */
  restore: (data: Record<string, unknown>) => {
    values: T;
    rejectedKeys?: string[];
  };
}

/**
 * Hold one multi-step form's in-progress answers, per user, for as long as the
 * step in the URL lasts.
 */
export function useWizardDraft<T>(
  wizardId: string,
  options: UseWizardDraftOptions<T>,
): UseWizardDraftResult<T> {
  const dispatch = useAppDispatch();
  const entry = useAppSelector(selectWizardDraft(wizardId));
  const hydrated = useSyncHydrated();

  const [restored, setRestored] = useState<WizardDraftRestore<T> | null>(null);
  const settledRef = useRef(false);
  // `restore` is a fresh closure every render; keep the latest without making
  // it a dependency (it would re-run the one-shot restore forever).
  const restoreRef = useRef(options.restore);
  restoreRef.current = options.restore;

  // A draft that arrives BEFORE hydration settles is just as good — the read
  // came back early. Either way this runs exactly once.
  const hasEntry = Boolean(entry);
  useEffect(() => {
    if (settledRef.current) return;
    if (!hydrated && !hasEntry) return;
    settledRef.current = true;
    if (!entry) {
      setRestored({ values: null, rejectedKeys: [] });
      return;
    }
    const result = restoreRef.current(entry.data);
    const rejectedKeys = result.rejectedKeys ?? [];
    if (rejectedKeys.length > 0) {
      // LOUD: a saved answer we could not put back is lost work.
      console.error(
        `[wizard-draft] "${wizardId}" could not restore saved answer(s): ${rejectedKeys.join(", ")}. ` +
          "The person will see a default where they made a choice.",
      );
    }
    setRestored({ values: result.values, rejectedKeys });
  }, [entry, hasEntry, hydrated, wizardId]);

  const status: WizardDraftStatus =
    restored === null ? "loading" : restored.values === null ? "absent" : "found";

  return {
    status,
    restored,
    patch: (fields: Record<string, unknown>) => {
      dispatch(patchWizardDraft({ wizardId, patch: fields }));
    },
    clear: () => {
      dispatch(clearWizardDraft(wizardId));
    },
  };
}
