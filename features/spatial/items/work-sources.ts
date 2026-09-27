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

/** Pasted text waiting to become a note (only while the note does not exist). */
export function noteSeed(source: NodeSource): string | null {
  if (!isEntity(source, "note") || source.id) return null;
  const seed = source.meta?.seed;
  return seed && seed.trim() ? seed : null;
}

/** The note now exists: record its id and drop the seed (it lives in the note). */
export function noteSource(previous: NodeSource, noteId: string): EntitySource {
  const meta = isEntity(previous, "note") && previous.meta ? { ...previous.meta } : {};
  delete meta.seed;
  return {
    kind: "entity",
    entity: "note",
    id: noteId,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };
}

/** A draft note that is created at once from pasted text. */
export function noteDraftFromText(text: string): PlacedItem {
  const label = text.trim().split("\n")[0].slice(0, 80) || "Note";
  return { title: label, source: { kind: "entity", entity: "note", id: null, meta: { seed: text } } };
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
