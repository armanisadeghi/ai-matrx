"use client";

// features/mandates/authoring-level/level-draft.ts
//
// The creation form's keystroke draft (the FIX-R14 rule in ../authoring/draft.ts:
// nothing typed is lost), kept PER SEAT so a draft started on the admin page,
// the personal page, or one organization's page is never put back on another.
// Parsing, the "dirty" rule and the sentences are the admin module's own, by
// import — only the storage key differs.

import type { MandateListLevel } from "@/features/mandates/member-list/types";
import { draftIsDirty, parseDraft, type MandateDraft } from "../authoring/draft";

/** The storage key for one seat. Pure — exported for tests. */
export function levelDraftKey(level: MandateListLevel, orgId?: string | null): string {
  return level === "organization"
    ? `matrx.mandates.authoring.draft.v1:org:${orgId ?? "none"}`
    : "matrx.mandates.authoring.draft.v1:personal";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readLevelDraft(key: string): MandateDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = parseDraft(raw);
    return draft && draftIsDirty(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function writeLevelDraft(
  key: string,
  draft: Omit<MandateDraft, "savedAt">,
): { ok: true } | { ok: false; reason: string } {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, reason: describe(error) };
  }
}

export function clearLevelDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The browser never stored it; nothing to take back.
  }
}
