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

import { useEffect } from "react";
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
  /**
   * What the saved draft says right now — `null` only while `status` is
   * "loading". It is a DERIVATION, not a snapshot: apply it exactly once (a
   * ref guard in one effect), and let anything the person has already typed
   * win. `restore` must therefore be pure and cheap.
   */
  restored: WizardDraftRestore<T> | null;
  /** Shallow-merge fields into the draft. Safe to call on every keystroke. */
  patch: (fields: Record<string, unknown>) => void;
  /** Drop the draft. Call on successful completion, never before. */
  clear: () => void;
}

export interface UseWizardDraftOptions<T> {
  /**
   * Map the stored bag to this wizard's values — PURE, and called on render.
   * Report anything you cannot put back in `rejectedKeys`; the hook screams
   * about it so a saved answer can never vanish in silence.
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

  // A draft that arrives BEFORE hydration settles is just as good — the read
  // came back early. Only "no draft AND not read yet" is genuinely unknown.
  let restored: WizardDraftRestore<T> | null = null;
  if (entry) {
    const result = options.restore(entry.data);
    restored = { values: result.values, rejectedKeys: result.rejectedKeys ?? [] };
  } else if (hydrated) {
    restored = { values: null, rejectedKeys: [] };
  }

  const status: WizardDraftStatus =
    restored === null ? "loading" : restored.values === null ? "absent" : "found";

  // LOUD: a saved answer we could not put back is lost work. Announced from an
  // effect (once per distinct set of keys), never from render.
  const rejected = restored?.rejectedKeys.join(",") ?? "";
  useEffect(() => {
    if (!rejected) return;
    console.error(
      `[wizard-draft] "${wizardId}" could not restore saved answer(s): ${rejected}. ` +
        "The person will see a default where they made a choice.",
    );
  }, [rejected, wizardId]);

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
