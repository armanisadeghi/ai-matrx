/**
 * WHAT THE EXPERT PASTED IS A SOURCE — and a source is a thing you can see
 * again.
 *
 * Census defect D5 (2026-09-12): distil from pasted text through the `source`
 * or `exemplar` Approach, watch real rules land — and the text you pasted is
 * listed NOWHERE. "Interviews" says "No interviews yet", "Resources" says "Add
 * your first resource". Every other lane leaves a source row behind (the file
 * lane a `file` edge, the dump lane an entity edge, the interview lane a
 * `conversation` edge); the paste lane left only a content hash buried in each
 * rule's `source_ref.source`, which no screen reads. The Expert could not
 * re-read, re-check or re-use their own words.
 *
 * THE CLASS: any lane that accepts raw pasted TEXT must persist that text as a
 * source the moment it launches — not when the run succeeds. A run that fails,
 * times out, or is rejoined after a reload has already lost the paste
 * otherwise, and losing the Expert's words is a worse defect than a failed
 * distillation.
 *
 * The text becomes a `note` (`workbench.notes`, the platform's own text
 * primitive — no new table, per the canonical-contract law) attached to the
 * Rulebook by a `platform.associations` edge with the SAME
 * `distillation_source` role the dump lane already uses, so it lands in the
 * Rulebook's Resources list with a real door on it (the registry opens a note
 * at /notes?active=<id>, with a peek).
 *
 * The edge also carries the source's IDENTITY: `source_key`, computed exactly
 * the way the server computes it (aidream
 * `services/distillation/source_identity.py::text_source_key`, W40). Every
 * rule the distiller writes is stamped with that same key in
 * `source_ref.source` — so "how many rules did this paste produce?" is a
 * question the Rulebook page can answer from data it already has, and it stays
 * true forever instead of being frozen into metadata at write time.
 */

import { associationsService } from "@/features/scopes/service/associationsService";
import { createNote } from "@/features/notes/service/notesService";

/** The role the Rulebook's Resources list reads (`RulebookSourcesPanel`). */
export const DISTILLATION_SOURCE_ROLE = "distillation_source";

/** Where pasted sources land in the Expert's own Notes. */
export const PASTED_SOURCE_FOLDER = "Masterwork Sources";

/**
 * The paste lane's source identity — byte-identical to the server's
 * `text_source_key`: whitespace-collapsed, sha256, first 32 hex, `text:`
 * prefix. Keep the two in lockstep; the join between a source row and the
 * rules it produced is this string and nothing else.
 */
export async function textSourceKey(text: string): Promise<string> {
  const normalized = (text ?? "").split(/\s+/).filter(Boolean).join(" ");
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `text:${hex.slice(0, 32)}`;
}

/**
 * What the source is CALLED in the list. The Expert's own note for it wins;
 * otherwise the first real line of what they pasted, which is how a person
 * recognizes their own text.
 */
export function pastedSourceTitle(
  text: string,
  sourceNote?: string | null,
  max = 80,
): string {
  const note = (sourceNote ?? "").trim();
  if (note) return note.length > max ? `${note.slice(0, max - 1)}…` : note;
  const firstLine =
    (text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  if (!firstLine) return "Pasted source";
  return firstLine.length > max
    ? `${firstLine.slice(0, max - 1)}…`
    : firstLine;
}

export interface PastedSource {
  noteId: string;
  sourceKey: string;
  title: string;
}

/** Per-edge annotations the Resources list renders. */
export interface PastedSourceMetadata {
  /** Marks the edge as a paste (vs. a note the Expert attached by hand). */
  pasted: true;
  /** The identity every rule from this text carries in `source_ref.source`. */
  source_key: string;
  /** The Approach that read it — `source`, `exemplar`, `timeline`, `chat`. */
  approach: string;
  /** Word count of what was pasted. */
  words: number;
  /** ISO timestamp of the paste. */
  pasted_at: string;
}

/**
 * Persist a paste as a durable, openable source of this Rulebook.
 *
 * NEVER throws and never blocks the distillation: a failure here must not cost
 * the Expert their rules. It DOES scream (console.error + the returned null),
 * because a silent miss is the exact defect this closes.
 */
export async function recordPastedSource(args: {
  rulebookId: string;
  orgId?: string | null;
  text: string;
  sourceNote?: string | null;
  /** `platform.approach` key of the lane that is about to read this text. */
  approach: string;
}): Promise<PastedSource | null> {
  const text = args.text ?? "";
  if (!text.trim()) return null;
  const title = pastedSourceTitle(text, args.sourceNote);
  try {
    const sourceKey = await textSourceKey(text);
    const note = await createNote({
      label: title,
      content: text,
      folder_name: PASTED_SOURCE_FOLDER,
      organization_id: args.orgId ?? "",
      // NOTHING in the note's `metadata`: the Data Doctrine (§3.2/§4.4,
      // DD-060) reserves that column for system-owned state, and the DB gate
      // rejects the whole insert for an unregistered key — verified live
      // 2026-09-12 (`matrx_validation_gate: metadata key … is not
      // system-owned state on workbench.notes`). The paste's identity belongs
      // on the EDGE, which is where the Rulebook reads it from anyway.
    });
    const metadata: PastedSourceMetadata = {
      pasted: true,
      source_key: sourceKey,
      approach: args.approach,
      words: text.split(/\s+/).filter(Boolean).length,
      pasted_at: new Date().toISOString(),
    };
    const res = await associationsService.add({
      sourceType: "note",
      sourceId: note.id,
      targetType: "rulebook",
      targetId: args.rulebookId,
      orgId: args.orgId ?? undefined,
      role: DISTILLATION_SOURCE_ROLE,
      label: title,
      metadata,
    });
    if (!res.ok) {
      console.error(
        "[masterwork/pastedSource] The pasted text was saved as a note but " +
          "NOT attached to the Rulebook — it will not appear in Sources.",
        { noteId: note.id, rulebookId: args.rulebookId, error: res.error },
      );
      return null;
    }
    return { noteId: note.id, sourceKey, title };
  } catch (error) {
    console.error(
      "[masterwork/pastedSource] Could not keep the Expert's pasted source — " +
        "the distillation still runs, but the text will not be listed.",
      { rulebookId: args.rulebookId, error },
    );
    return null;
  }
}
