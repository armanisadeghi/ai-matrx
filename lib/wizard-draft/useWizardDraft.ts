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
//   3. `applyOnce` + `didRestore` — A RESTORED DRAFT IS NEVER PUT BACK IN
//      SILENCE (cold walk 6, 2026-09-17). An Expert typed her goal on
//      /masterwork/new, went to look at the catalog, and came back. The
//      textarea already held the old sentence and NOTHING on screen said so,
//      so she read it as the page she still had to fill in, clicked where her
//      eye landed and typed her sentence INTO the pre-filled text. The
//      Rulebook was created with `prefix + whole sentence + suffix` as its
//      description — 286 characters of mangled goal from a 143-character
//      sentence — and the Capture Plan then faithfully displayed the mess.
//      `restored` alone could not stop that: it is a derivation the caller may
//      apply without ever telling anybody. So the hook now owns the applying
//      AND the fact that it happened, and ships `<WizardDraftRestored>` (same
//      directory) as the one way to say it. Same law as `lib/drafts/
//      useTextDraft`: a silent restore is its own kind of lie.
//
// Pair it with `resolveWizardStep` (same directory) for the step decision.

import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * Put a saved draft back — EXACTLY ONCE per mount, and never in silence.
   * Call it from one effect; the hook guards the once-ness, and flips
   * `didRestore` so the caller's `<WizardDraftRestored>` notice appears.
   * A no-op while the read is in flight and when nothing was saved.
   */
  applyOnce: (apply: (values: T) => void) => void;
  /**
   * A saved draft is on screen right now and the person has not been told yet.
   * Render `<WizardDraftRestored>` on it — a form that silently pre-fills
   * itself gets typed INTO, and the answer comes out doubled.
   */
  didRestore: boolean;
  /** "I see it, leave it" — drop the notice, keep the restored text. */
  acknowledge: () => void;
  /**
   * "Start fresh" — drop the draft AND the notice. The caller empties its own
   * fields in the same click; the draft may never come back on this mount.
   */
  discard: () => void;
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

  // THE APPLY AND THE ANNOUNCEMENT ARE ONE THING. `applyOnce` is the only way
  // the hook hands the saved values to the form, and it cannot run without
  // raising `didRestore` — so a wizard that pre-fills itself always has
  // something true to say, and the notice can never drift out of sync with
  // what is actually in the fields.
  const [didRestore, setDidRestore] = useState(false);
  const appliedRef = useRef(false);
  const valuesRef = useRef<T | null>(null);
  valuesRef.current = restored?.values ?? null;

  const applyOnce = useCallback((apply: (values: T) => void) => {
    if (appliedRef.current) return;
    const values = valuesRef.current;
    if (values === null) return; // still loading, or nothing was saved
    appliedRef.current = true;
    apply(values);
    setDidRestore(true);
  }, []);

  const acknowledge = useCallback(() => setDidRestore(false), []);

  const discard = useCallback(() => {
    // Nothing may put it back afterwards: the once-guard stays closed even
    // though the values are still sitting in `restored` this render.
    appliedRef.current = true;
    setDidRestore(false);
    dispatch(clearWizardDraft(wizardId));
  }, [dispatch, wizardId]);

  return {
    status,
    restored,
    applyOnce,
    didRestore,
    acknowledge,
    discard,
    patch: (fields: Record<string, unknown>) => {
      dispatch(patchWizardDraft({ wizardId, patch: fields }));
    },
    clear: () => {
      dispatch(clearWizardDraft(wizardId));
    },
  };
}
