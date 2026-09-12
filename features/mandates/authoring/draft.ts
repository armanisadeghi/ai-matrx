"use client";

// features/mandates/authoring/draft.ts
//
// 🚨 WHAT SOMEONE TYPED INTO THE CREATION FORM SURVIVES THE ROUTE CHANGING
// (FIX-R14, 2026-09-08).
//
// The defect, found by an independent walker on production v0.4.1736: while
// they were typing on `/administration/mandates/new` the route became an
// EXISTING mandate's page, and everything they had typed was gone — the name,
// the described inputs, the goal. That is a data-loss defect whatever moved
// the route, because the creation page held the only copy.
//
// This module is the half of the fix that does not depend on knowing what
// moved the route: the draft is written on every keystroke and read back when
// the page mounts. A stray click, a programmatic push from a screen the person
// already left, a reload, a crashed tab, a mis-aimed Back — none of them can
// cost the person their words any more. The page says out loud that it
// restored a draft, and offers to discard it; a restore nobody is told about
// would be its own quiet lie.
//
// Storage is per-browser and per-person's-own-machine only: this is an
// authoring convenience, not platform state, so `localStorage` is the right
// home. When the browser refuses it (private mode, blocked site data) the
// page SAYS SO instead of pretending — a stand-in that is silent is a defect.

import type { DraftInput } from "./service";
import { formatRelativeTime } from "@/utils/datetime";

/** Bumped only if the shape changes incompatibly; an old key is then ignored. */
const STORAGE_KEY = "matrx.mandates.authoring.draft.v1";

/** Everything the creation form holds, and nothing else. */
export interface MandateDraft {
  label: string;
  mandateKey: string;
  goal: string;
  outputKind: string | null;
  outputConstraints: string;
  draftInputs: DraftInput[];
  /** When it was last written — the restore line says how old it is. */
  savedAt: string;
}

export const EMPTY_DRAFT: Omit<MandateDraft, "savedAt"> = {
  label: "",
  mandateKey: "",
  goal: "",
  outputKind: null,
  outputConstraints: "",
  draftInputs: [{ description: "" }],
};

/**
 * Has the person put anything in? Pure, and the ONE definition of "dirty" —
 * the restore prompt, the save-on-change and the leave-warning all read it, so
 * they can never disagree about whether there is work to lose.
 */
export function draftIsDirty(draft: Omit<MandateDraft, "savedAt">): boolean {
  return (
    draft.label.trim().length > 0 ||
    draft.mandateKey.trim().length > 0 ||
    draft.goal.trim().length > 0 ||
    draft.outputKind !== null ||
    draft.outputConstraints.trim().length > 0 ||
    draft.draftInputs.some((input) => input.description.trim().length > 0)
  );
}

/** Defensive parse — a stored blob from an older shape is simply not a draft. */
export function parseDraft(raw: string): MandateDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.label !== "string" || typeof record.mandateKey !== "string") {
    return null;
  }
  const inputs = Array.isArray(record.draftInputs)
    ? record.draftInputs.filter(
        (item): item is DraftInput =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as DraftInput).description === "string",
      )
    : [];
  return {
    label: record.label,
    mandateKey: record.mandateKey,
    goal: typeof record.goal === "string" ? record.goal : "",
    outputKind: typeof record.outputKind === "string" ? record.outputKind : null,
    outputConstraints:
      typeof record.outputConstraints === "string" ? record.outputConstraints : "",
    draftInputs: inputs.length > 0 ? inputs : [{ description: "" }],
    savedAt: typeof record.savedAt === "string" ? record.savedAt : "",
  };
}

/**
 * The storage seam, named so a guard can observe it without a real browser
 * and so a refusal is a value rather than a swallowed exception.
 */
export const draftStorage = {
  read(): { ok: true; raw: string | null } | { ok: false; reason: string } {
    try {
      return { ok: true, raw: window.localStorage.getItem(STORAGE_KEY) };
    } catch (error: unknown) {
      return { ok: false, reason: describe(error) };
    }
  },
  write(raw: string): { ok: true } | { ok: false; reason: string } {
    try {
      window.localStorage.setItem(STORAGE_KEY, raw);
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, reason: describe(error) };
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to announce: the person is leaving a draft behind that this
      // browser was never able to store in the first place.
    }
  },
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read back a draft, or null when there is none (or it is unreadable). */
export function readDraft(): MandateDraft | null {
  const result = draftStorage.read();
  if (!result.ok || !result.raw) return null;
  const draft = parseDraft(result.raw);
  if (!draft) return null;
  return draftIsDirty(draft) ? draft : null;
}

/**
 * Persist, returning the reason when the browser refused so the page can print
 * it. A caller that ignores the return value is discarding a warning the
 * person needs.
 */
export function writeDraft(
  draft: Omit<MandateDraft, "savedAt">,
): { ok: true } | { ok: false; reason: string } {
  return draftStorage.write(
    JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
  );
}

export function clearDraft(): void {
  draftStorage.clear();
}

/** The sentence the page prints when it has put a draft back on the screen. */
export function restoredDraftSentence(savedAt: string): string {
  const when = savedAt ? describeAge(savedAt) : "earlier";
  return `Put back what you were typing here ${when} — this page keeps a copy of every field as you type, so leaving it (or being taken off it) cannot lose your words.`;
}

/** The sentence when this browser will not let the page keep that copy. */
export function draftUnstorableSentence(reason: string): string {
  return `This browser is not letting the page keep a copy of what you are typing: ${reason} Nothing is lost while you stay here, but leaving this page before you press Create would lose it — so copy the goal somewhere safe if you need to step away.`;
}

function describeAge(savedAt: string): string {
  return formatRelativeTime(savedAt, { style: "long", fallback: "earlier" });
}
