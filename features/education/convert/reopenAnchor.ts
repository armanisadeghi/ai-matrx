// features/education/convert/reopenAnchor.ts
//
// Recover the MATERIAL behind any lineage anchor — the read that makes
// "make more from this kit" possible.
//
// `reopenSource` already answers this for the canonical anchor (a durable
// `cld_files` row): re-read the original bytes and hand back the text. But a kit
// is anchored on whatever it was made FROM, and an entity-sourced convert
// (note→deck, deck→quiz, assessment→deck) anchors on the origin ENTITY instead —
// `recordSourceLineage.resolveAnchor` writes exactly those two shapes. Without
// this file, "add a quiz to this material" would work for uploaded kits and dead-
// end for entity kits, which is the same fragmentation the kit page exists to end.
//
// So this is the ONE anchor→text read, and it owns no serialization of its own:
// each entity kind is serialized by the SAME function its own convert surface
// already uses (`serializeDeck` / `serializeAssessment` / the note's content), so
// a kit top-up grounds on byte-identical material to the original conversion.

import { resolveEntityToken } from "@/features/scopes/registry/entityRegistry";
import { fcService } from "@/features/flashcards/data/fcService";
import { serializeDeck } from "@/features/education/media/audio/audioBrief";
import { assessmentService } from "@/features/education/assessment/data/assessmentService";
import { serializeAssessment } from "@/features/education/assessment/data/serializeAssessment";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { reopenSource, type ReopenSourceDeps } from "./reopenSource";
import type { ConvertSource } from "./types";

/** A recovered source, plus how it was recovered (for an honest UI line). */
export interface ReopenedAnchor extends ConvertSource {
  method: "inline" | "processed_document" | "pdf" | "entity";
}

/**
 * The material behind a kit's anchor, ready to convert again.
 *
 * `sourceType` is the anchor's entity token as the kit carries it (`file` for
 * every ingested kit; `note` / `fc_set` / `assessment` for an entity-sourced
 * one). Throws with a line the learner can act on when the material genuinely
 * cannot be re-read — never returns empty text, because a generator handed an
 * empty source produces a confident, empty artifact.
 */
export async function reopenAnchor(
  sourceType: string,
  sourceId: string,
  deps: ReopenSourceDeps,
): Promise<ReopenedAnchor> {
  const token = resolveEntityToken(sourceType);

  if (token === "file") return reopenSource(sourceId, deps);

  if (token === "note") {
    const note = await NotesAPI.getById(sourceId);
    const text = (note?.content ?? "").trim();
    if (!text) throw new Error(unreadable("note"));
    return {
      text,
      title: note?.label?.trim() || "Your notes",
      ref: { kind: "note", entityType: "note", entityId: sourceId },
      method: "entity",
    };
  }

  if (token === "fc_set") {
    const res = await fcService.getSetWithCards(sourceId);
    if (res.error || !res.data || res.data.cards.length === 0) {
      throw new Error(unreadable("deck"));
    }
    const { set, cards } = res.data;
    return {
      text: serializeDeck(set, cards).markdown,
      title: set.name,
      ref: { kind: "deck", entityType: "fc_set", entityId: sourceId },
      method: "entity",
    };
  }

  if (token === "assessment") {
    const res = await assessmentService.getAssessmentWithItems(sourceId);
    if (res.error || !res.data || res.data.items.length === 0) {
      throw new Error(unreadable("quiz"));
    }
    const { assessment, items } = res.data;
    return {
      text: serializeAssessment(assessment, items).markdown,
      title: assessment.title,
      ref: { kind: "assessment", entityType: "assessment", entityId: sourceId },
      method: "entity",
    };
  }

  // An anchor kind nothing can serialize is a real gap, not a silent no-op:
  // say what it is so the next agent can add the one branch it needs.
  throw new Error(
    `We can't re-read this material to make more from it (${token}). Open the original and convert it from there.`,
  );
}

function unreadable(what: string): string {
  return `We can't re-read that ${what} to make more from it — open it and check it still has content.`;
}
