/**
 * What a Source that was still landing becomes when the page reloads.
 *
 * Never lose input (table stakes): the pasted text, the link, or an
 * already-uploaded recording is kept in the draft (`SourceDraft.input`), so
 * the input picks it up again by itself — the landing door dedupes by content
 * hash, so landing it a second time reuses the same Source, never a copy.
 * A file that was mid-upload cannot come back (its bytes lived only in the
 * browser tab); the card says so honestly and keeps the file's name so the
 * person can choose it again in one click.
 */

import type { SourceDraft, SourceIntakeInput } from "./types";

/** Shown while a kept input is being landed again after a reload. */
export const RELOADED_RESUMING =
  "The page reloaded while this was being added — picking it up again.";

/** A kept input exists but has not been re-landed (it will be, or the person can press Try again). */
export const RELOADED_WHILE_ADDING =
  "This was still being added when the page reloaded, so it did not finish. Add it again.";

/** The kinds whose landing can be repeated from what the draft kept. */
export function resumableInput(draft: SourceDraft): SourceIntakeInput | null {
  const input = draft.input;
  if (!input) return null;
  switch (draft.kind) {
    case "paste":
      return input.text?.trim() ? input : null;
    case "web":
    case "youtube":
      return input.url?.trim() ? input : null;
    case "audio":
      return input.fileId ? input : null;
    default:
      return null;
  }
}

/** The sentence for a file whose upload the reload cut off. */
export function uploadCutOffSentence(draft: SourceDraft): string {
  return `"${draft.label}" was still uploading when the page reloaded, so it did not arrive. Choose it again to add it.`;
}

export interface ReloadedCard {
  /** "resume" = land the kept input again now; "reoffer" = the person must re-choose a file. */
  action: "resume" | "reoffer" | "lost";
  sentence: string;
}

/**
 * The one decision: a card that was `pending`/`resolving` when the page
 * unloaded. Cards in any other state are restored unchanged (returns null).
 */
export function reloadedCard(
  draft: SourceDraft,
  status: "pending" | "resolving" | "ready" | "error",
): ReloadedCard | null {
  if (status !== "pending" && status !== "resolving") return null;
  if (resumableInput(draft)) return { action: "resume", sentence: RELOADED_RESUMING };
  if (draft.kind === "upload" || draft.kind === "image" || draft.kind === "audio")
    return { action: "reoffer", sentence: uploadCutOffSentence(draft) };
  return { action: "lost", sentence: RELOADED_WHILE_ADDING };
}

/** Pasted text larger than this is not kept in the device draft (it would crowd the browser's storage). */
export const MAX_KEPT_TEXT_CHARS = 2_000_000;
