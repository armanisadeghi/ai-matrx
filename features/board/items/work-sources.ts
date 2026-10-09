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
export function chatSource(conversationId: string | null, agentId: string | null, list?: ChatListChoice | null): EntitySource {
  const meta: Record<string, string> = {};
  if (agentId) meta.agentId = agentId;
  if (list) meta.list = list;
  return {
    kind: "entity",
    entity: "chat",
    id: conversationId,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

// ── the chat tile's conversation list ────────────────────────────────────────
//
// A chat tile shows the board's conversations in a list beside the chat. Open or
// closed is the person's choice, saved on the tile (`meta.list`); with no choice
// it follows the tile's width — open when wide, behind a header toggle when narrow.

export type ChatListChoice = "open" | "closed";

/** Below this tile width (board px) the list starts closed. */
export const CHAT_LIST_WIDE_PX = 560;

export function chatListChoice(source: NodeSource): ChatListChoice | null {
  if (!isEntity(source, "chat")) return null;
  const v = source.meta?.list;
  return v === "open" || v === "closed" ? v : null;
}

/** Is the list showing? The person's choice, else open on a wide tile. */
export function chatListOpen(source: NodeSource, widthPx: number): boolean {
  const choice = chatListChoice(source);
  return choice ? choice === "open" : widthPx >= CHAT_LIST_WIDE_PX;
}

/** The same chat tile with the list's choice saved. */
export function withChatList(source: NodeSource, list: ChatListChoice): NodeSource {
  if (!isEntity(source, "chat")) return source;
  return chatSource(source.id, chatAgentId(source), list);
}

/**
 * What a chat tile should save for the conversation it shows, or null to keep
 * what it has. A new conversation exists only in the browser until its first
 * message is sent; saving its id then makes the tile reopen a conversation the
 * server does not have ("Couldn't load this conversation") after a reload. So
 * an unsent chat saves only the chosen agent (a reload starts a fresh chat
 * with it) and the id is saved once the server has the conversation.
 */
export function chatSourceToSave(input: {
  conversationId: string;
  serverHasIt: boolean;
  savedId: string | null;
  agentId: string | null;
  chosenAgentId: string | null;
  /** The tile's saved list choice — carried through every save. */
  list?: ChatListChoice | null;
}): EntitySource | null {
  const agentId = input.agentId ?? input.chosenAgentId;
  const list = input.list ?? null;
  if (!input.serverHasIt) {
    // The saved conversation itself, still being brought up: leave the tile alone.
    if (input.conversationId === input.savedId) return null;
    // A different, unsent conversation: forget the old id so a reload starts fresh.
    if (input.savedId !== null) return chatSource(null, agentId, list);
    return agentId && agentId !== input.chosenAgentId ? chatSource(null, agentId, list) : null;
  }
  return input.conversationId !== input.savedId ? chatSource(input.conversationId, agentId, list) : null;
}

/** What a new chat tile is called until the server titles its conversation. */
export const DEFAULT_CHAT_TITLE = "Chat";

/**
 * The tile title to save together with a changed chat source: the server's title for a
 * conversation it has, else the default — an unsent chat (after "New conversation") must
 * not keep the previous conversation's title. Undefined = leave the title as it is.
 */
export function chatTitleToSave(input: { serverHasIt: boolean; conversationTitle: string | null }): string | undefined {
  if (!input.serverHasIt) return DEFAULT_CHAT_TITLE;
  return input.conversationTitle?.trim() ? input.conversationTitle : undefined;
}

export function chatAgentId(source: NodeSource): string | null {
  if (!isEntity(source, "chat")) return null;
  const agentId = source.meta?.agentId;
  return agentId && agentId.trim() ? agentId : null;
}

// ── agent form ───────────────────────────────────────────────────────────────
//
// An agent run with no chat: the agent's inputs as a form, one Run, the reply
// rendered as its shape. Each run is its own conversation (variables apply to a
// conversation's first turn), so `id` is the LATEST run's conversation and "Run
// again" moves the tile to a new one. `meta.agentId` is the agent; `meta.inputStyle`
// is the tile's chosen inputs layout (a VariablesPanelStyle; default "form").

export const AGENT_FORM_ENTITY = "agent-form";

export function agentFormSource(
  conversationId: string | null,
  agentId: string | null,
  inputStyle?: string | null,
): EntitySource {
  const meta: Record<string, string> = {};
  if (agentId) meta.agentId = agentId;
  if (inputStyle) meta.inputStyle = inputStyle;
  return {
    kind: "entity",
    entity: AGENT_FORM_ENTITY,
    id: conversationId,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };
}

export function agentFormAgentId(source: NodeSource): string | null {
  if (!isEntity(source, AGENT_FORM_ENTITY)) return null;
  const agentId = source.meta?.agentId;
  return agentId && agentId.trim() ? agentId : null;
}

export function agentFormInputStyle(source: NodeSource): string | null {
  if (!isEntity(source, AGENT_FORM_ENTITY)) return null;
  return source.meta?.inputStyle?.trim() || null;
}

/**
 * What an agent-form tile saves for the run it shows, or null to keep what it
 * has — the chat tile's rule (`chatSourceToSave`): an unsent run is never saved
 * by id, so a reload never reopens a conversation the server does not have.
 * One difference: after "Run again" the previous run stays saved until the new
 * one is sent, so a reload before Run shows the last result instead of losing it.
 */
export function agentFormSourceToSave(input: {
  conversationId: string;
  serverHasIt: boolean;
  savedId: string | null;
  agentId: string | null;
  chosenAgentId: string | null;
  inputStyle: string | null;
}): EntitySource | null {
  if (!input.serverHasIt && input.savedId !== null && input.conversationId !== input.savedId) return null;
  const next = chatSourceToSave(input);
  if (!next) return null;
  return agentFormSource(next.id, next.meta?.agentId ?? null, input.inputStyle);
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
export function noteDraftSource(previous: NodeSource, noteId: string, label?: string): EntitySource {
  const meta = isEntity(previous, "note") && previous.meta ? { ...previous.meta } : {};
  delete meta.seed;
  // The name the person or agent gave the tile before the note had words: the draft starts with
  // it (and starts again with it after a reload), so the tile never snaps back to "New Note".
  if (label) meta.label = label;
  return { kind: "entity", entity: "note", id: noteId, meta: { ...meta, draft: DRAFT } };
}

/** The note exists in Notes: record its id and drop the seed and draft marks. */
export function noteSource(previous: NodeSource, noteId: string): EntitySource {
  const meta = isEntity(previous, "note") && previous.meta ? { ...previous.meta } : {};
  delete meta.seed;
  delete meta.draft;
  delete meta.label;
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

/** A conversation, placed under its title — the chat picker and the agent's door. */
export function chatItem(conversationId: string, title?: string | null, agentId: string | null = null): PlacedItem {
  return { title: title?.trim() || "Chat", source: chatSource(conversationId, agentId) };
}

/** A note from Notes, placed under its label — the note picker and the agent's door. */
export function noteItem(noteId: string, title?: string | null): PlacedItem {
  return { title: title?.trim() || "Note", source: { kind: "entity", entity: "note", id: noteId } };
}

export function fileItem(fileId: string, name?: string | null): PlacedItem {
  return { title: name?.trim() || "File", source: { kind: "entity", entity: "file", id: fileId } };
}
