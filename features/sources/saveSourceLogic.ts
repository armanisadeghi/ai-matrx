/**
 * features/sources/saveSourceLogic.ts
 *
 * The Save Source panel's pure logic (SOURCE-CONVERGENCE §8.3). No React, no
 * Supabase, no app imports: the extension's side panel can copy this file
 * verbatim and make exactly the same decisions the web app makes.
 *
 * What a Save sends is one `POST /sources/{id}/keep` per Source with
 * `{ keep, attach_to }`. The door treats Save and "file it somewhere" as the
 * same signal — either one starts the Source's (metered) AI processing under
 * the organization's policy — so this module never pretends there is a third
 * "file it but do not process it" option.
 */

/** Where a Source can be filed from the panel. Every pair is registered in
 * `platform.association_types` for `processed_document` (the deck and the
 * episode are stored made-from-first by the auto-orient trigger). */
export const SAVE_TARGET_TOKENS = [
  "project",
  "task",
  "scope",
  "research_topic",
  "fc_set",
  "pc_episode",
  "war_room",
  "data_store",
] as const;

export type SaveTargetToken = (typeof SAVE_TARGET_TOKENS)[number];

/** The media-catalog Library token (a picker cannot list it; the panel reads it directly). */
export const LIBRARY_TOKEN = "media_source_library";

export interface StagedTarget {
  token: string;
  id: string;
  label: string;
}

export interface AttachTargetWire {
  entity_type: string;
  entity_id: string;
  label?: string | null;
}

/** The per-person key the chosen Library is remembered under. */
export function rememberedLibraryKey(userId: string): string {
  return `matrx.sources.save-panel.library.${userId}`;
}

/** Read the remembered Library id; storage can be absent or throw (private mode). */
export function readRememberedLibrary(
  storage: Pick<Storage, "getItem"> | null | undefined,
  userId: string | null,
): string | null {
  if (!storage || !userId) return null;
  try {
    const value = storage.getItem(rememberedLibraryKey(userId));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function writeRememberedLibrary(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  userId: string | null,
  libraryId: string | null,
): void {
  if (!storage || !userId) return;
  try {
    if (libraryId) storage.setItem(rememberedLibraryKey(userId), libraryId);
    else storage.removeItem(rememberedLibraryKey(userId));
  } catch {
    // A convenience only — the Save itself never depends on it.
  }
}

/**
 * The wire `attach_to` for one Save: every staged place, plus the Library when
 * one is chosen. The Library edge carries the `catalogued_source` label its
 * registration names.
 */
export function buildAttachTargets(
  staged: readonly StagedTarget[],
  libraryId: string | null,
): AttachTargetWire[] {
  const seen = new Set<string>();
  const out: AttachTargetWire[] = [];
  for (const t of staged) {
    const key = `${t.token}:${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ entity_type: t.token, entity_id: t.id });
  }
  if (libraryId && !seen.has(`${LIBRARY_TOKEN}:${libraryId}`)) {
    out.push({
      entity_type: LIBRARY_TOKEN,
      entity_id: libraryId,
      label: "catalogued_source",
    });
  }
  return out;
}

/**
 * Whether the Save button has anything to do. Save off with no place chosen
 * is nothing — the button says so instead of sending an empty request.
 */
export function hasSomethingToSave(
  save: boolean,
  attachTo: readonly AttachTargetWire[],
): boolean {
  return save || attachTo.length > 0;
}

/** The door's processing answer in words. */
export function intelligenceSentence(
  intelligence: "queued" | "deferred" | "never",
  kept: boolean,
): string {
  switch (intelligence) {
    case "queued":
      return "Processing has started: it will be cleaned, made searchable and read for entities.";
    case "deferred":
      return kept
        ? "Saved. Processing is waiting — your organization's policy has not started it yet."
        : "Not processed yet: it starts when you save it or file it somewhere.";
    case "never":
      return "Your organization's policy never processes this kind of Source.";
  }
}
