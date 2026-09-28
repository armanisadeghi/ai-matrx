/**
 * Pure source ↔ record transitions for the work items (chat, note, file).
 * Kept apart from the React bodies so every transition is unit-tested.
 */

import type { NodeSource } from "../board/document";
import type { PlacedItem } from "./types";

type EntitySource = Extract<NodeSource, { kind: "entity" }>;

export function isEntity(source: NodeSource, entity: string): source is EntitySource {
  return source.kind === "entity" && source.entity === entity;
}

/** The record id an entity source points at (null for a draft or a non-entity). */
export function entityId(source: NodeSource): string | null {
  return source.kind === "entity" ? source.id : null;
}

// ── chat ─────────────────────────────────────────────────────────────────────

/**
 * A chat source. `agentId` is the person's chosen agent (before the
 * conversation exists) or the conversation's own agent (after), so a reload
 * reopens it without a lookup.
 */
export function chatSource(conversationId: string | null, agentId: string | null): EntitySource {
  return {
    kind: "entity",
    entity: "chat",
    id: conversationId,
    ...(agentId ? { meta: { agentId } } : {}),
  };
}

export function chatAgentId(source: NodeSource): string | null {
  if (!isEntity(source, "chat")) return null;
  const agentId = source.meta?.agentId;
  return agentId && agentId.trim() ? agentId : null;
}

// ── note ─────────────────────────────────────────────────────────────────────
//
// A note tile moves through the notes feature's own lifecycle:
//   { id: null }                  a new tile — the body starts a note the way
//                                 /notes "New note" does (a client-only draft
//                                 in the Draft folder, no row until the first
//                                 words);
//   { id, meta.draft: "1" }       that draft — reopened by id; if a reload lost
//                                 it before the first words, it is started
//                                 again under the same id;
//   { id }                        a real note — opened in the real editor;
//   { meta.seed }                 text to become a note (paste, an agent): it is
//                                 created at once with that content (and replaces
//                                 an untouched draft).

const DRAFT = "1";

/** Text waiting to become a note (only while no real note exists yet). */
export function noteSeed(source: NodeSource): string | null {
  if (!isEntity(source, "note")) return null;
  if (source.id && !isNoteDraft(source)) return null;
  const seed = source.meta?.seed;
  return seed && seed.trim() ? seed : null;
}

/** The tile holds a client-only draft (no database row until its first words). */
export function isNoteDraft(source: NodeSource): boolean {
  return isEntity(source, "note") && source.id !== null && source.meta?.draft === DRAFT;
}

/** A draft note started for this tile. */
export function noteDraftSource(previous: NodeSource, noteId: string): EntitySource {
  const meta = isEntity(previous, "note") && previous.meta ? { ...previous.meta } : {};
  delete meta.seed;
  return { kind: "entity", entity: "note", id: noteId, meta: { ...meta, draft: DRAFT } };
}

/** The note exists in Notes: record its id and drop the seed and draft marks. */
export function noteSource(previous: NodeSource, noteId: string): EntitySource {
  const meta = isEntity(previous, "note") && previous.meta ? { ...previous.meta } : {};
  delete meta.seed;
  delete meta.draft;
  return {
    kind: "entity",
    entity: "note",
    id: noteId,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };
}

/**
 * An agent's text for a note tile: accepted while no real note exists yet (it
 * becomes the note's content); null once it does — then the text changes in
 * the note itself, through the notes surface (`note_content`).
 */
export function noteSeedEdit(source: NodeSource, text: string): EntitySource | null {
  if (!isEntity(source, "note")) return null;
  if (source.id && !isNoteDraft(source)) return null;
  return { ...source, meta: { ...source.meta, seed: text } };
}

export type NoteTilePlan =
  | { step: "create-from-seed"; seed: string }
  | { step: "start-draft" }
  | { step: "draft"; noteId: string }
  | { step: "open"; noteId: string };

/** What a note tile's body does with its source. */
export function noteTilePlan(source: NodeSource): NoteTilePlan | null {
  if (!isEntity(source, "note")) return null;
  const seed = noteSeed(source);
  if (seed) return { step: "create-from-seed", seed };
  if (!source.id) return { step: "start-draft" };
  return isNoteDraft(source) ? { step: "draft", noteId: source.id } : { step: "open", noteId: source.id };
}

/** A note's name from its first line (how pasted text is titled). */
export function noteLabelFromText(text: string): string {
  return text.trim().split("\n")[0].slice(0, 80) || "Note";
}

/** A note created at once from pasted text. */
export function noteDraftFromText(text: string): PlacedItem {
  return { title: noteLabelFromText(text), source: { kind: "entity", entity: "note", id: null, meta: { seed: text } } };
}

// ── file ─────────────────────────────────────────────────────────────────────

/** The file id of either file source shape (`entity:file` or the older `file`). */
export function fileIdOf(source: NodeSource): string | null {
  if (source.kind === "file") return source.fileId || null;
  if (isEntity(source, "file")) return source.id;
  return null;
}

export function fileItem(fileId: string, name?: string | null): PlacedItem {
  return { title: name?.trim() || "File", source: { kind: "entity", entity: "file", id: fileId } };
}
