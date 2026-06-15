/**
 * War Room MASTER tool argument schemas + result envelopes.
 *
 * One schema per tool. The dispatcher validates every delegated call against
 * these before resolving the target and running the action. Unlike the per-tile
 * war-room tools (which are HITL-gated writes), these run immediately — so the
 * schema is the FIRST safety gate: refuse a malformed call cleanly rather than
 * acting on garbage.
 *
 * `thread_id` is the roster's `threadId` (= the war-room TILE id the master sees
 * in `war_room_overview`). `room_id` is the roster's `roomId` (=
 * `ctx_war_room_sessions.id`).
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// war_room_read_thread — READ a thread agent's conversation chain
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomReadThreadArgsSchema = z.object({
  /** The thread's id (the roster `threadId` = the war-room tile id). */
  thread_id: z.string().min(1),
  /** How many of the most recent messages to return. Defaults to 20, capped. */
  limit: z.number().int().min(1).max(100).optional(),
});

export type WarRoomReadThreadArgs = z.infer<typeof warRoomReadThreadArgsSchema>;

/** One message in a thread's recent chain, flattened for the model. */
export interface ThreadMessageSummary {
  role: string;
  /** Plain-text rendering of the message content (tool calls summarized). */
  text: string;
}

export interface WarRoomReadThreadResult {
  ok: boolean;
  thread_id: string;
  conversation_id?: string | null;
  message_count?: number;
  messages?: ThreadMessageSummary[];
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// war_room_message_thread — message a thread's agent (fresh or fork)
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomMessageThreadArgsSchema = z.object({
  /** The thread's id (the roster `threadId` = the war-room tile id). */
  thread_id: z.string().min(1),
  /** The message to send to the thread's agent. */
  message: z.string().min(1).max(100000),
  /**
   * "fresh" — start a NEW conversation seeded with the thread's full context
   *   (task / notes / files via buildTileAgentContextEntries) + the message.
   *   No prior chat history. The default — a clean, well-scoped ask.
   * "fork" — branch the thread's EXISTING conversation (full history) and send
   *   the message on the fork. Use when continuity with what was already said
   *   matters. Requires the thread to already have a conversation.
   */
  mode: z.enum(["fresh", "fork"]).optional(),
});

export type WarRoomMessageThreadArgs = z.infer<
  typeof warRoomMessageThreadArgsSchema
>;

export interface WarRoomMessageThreadResult {
  ok: boolean;
  thread_id: string;
  mode: "fresh" | "fork";
  /** The conversation the message was sent on (new fresh convo or the fork). */
  conversation_id?: string;
  /** The thread agent's reply text, once the run completed (best-effort). */
  reply?: string;
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// war_room_create_room — create a new War Room (session)
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomCreateRoomArgsSchema = z.object({
  /** The room title. */
  title: z.string().min(1).max(300),
  /** Optional short description. */
  description: z.string().max(2000).optional(),
});

export type WarRoomCreateRoomArgs = z.infer<typeof warRoomCreateRoomArgsSchema>;

export interface WarRoomCreateRoomResult {
  ok: boolean;
  room?: { id: string; title: string };
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// war_room_rename_room — rename a War Room (session)
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomRenameRoomArgsSchema = z.object({
  /** The room's id (the roster `roomId`). */
  room_id: z.string().min(1),
  /** The new title. Empty is rejected. */
  title: z.string().min(1).max(300),
});

export type WarRoomRenameRoomArgs = z.infer<typeof warRoomRenameRoomArgsSchema>;

export interface WarRoomRenameRoomResult {
  ok: boolean;
  room?: { id: string; title: string };
  message?: string;
}
