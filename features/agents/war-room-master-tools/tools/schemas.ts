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
 * in `war_room`). `room_id` is the roster's `roomId` (=
 * `ctx_war_room_sessions.id`).
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// war_room_read_thread — READ a thread agent's conversation chain
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomReadThreadArgsSchema = z.object({
  /** The thread's id (the roster `threadId` = the war-room tile id). */
  thread_id: z.string().min(1),
  /**
   * Read a SPECIFIC conversation instead of the thread's primary agent chain —
   * for threads holding several agent conversations (the `conversation` rows
   * in the thread's resources). Defaults to the thread's primary.
   */
  conversation_id: z.string().min(1).optional(),
  /** How many of the most recent messages to return. Defaults to 20, capped. */
  limit: z.number().int().min(1).max(100).optional(),
  /** Also list the conversation's working documents (id + kind). */
  include_working_documents: z.boolean().optional(),
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
  /** The conversation's working documents (when requested). Read one with
   *  war_room_read_resource(entity_type='working_document', entity_id=id). */
  working_documents?: { id: string; kind: string; enabled: boolean }[];
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
   *   (task / notes / files via buildThreadAgentContextEntries) + the message.
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

// ─────────────────────────────────────────────────────────────────────────────
// war_room_read_file — READ the extracted TEXT of a file attached to a thread
// ─────────────────────────────────────────────────────────────────────────────
// Read-only, no HITL (same family + dispatcher as war_room_read_thread). Returns
// OUR extraction (the cleaned / raw text or the RAG-ready chunks of the file's
// `processed_documents` row via the unified /api/document/* reader), NOT the raw
// PDF/image bytes. The file_id is a `cld_files.id` the agent saw in the inline
// `war_room` block's <files> manifest. The handler never throws — a file with no
// extraction (or a transient read error) comes back as a clean `ok:false`.

/** How to render the extracted text. */
export const READ_FILE_MODES = ["clean", "raw", "chunks"] as const;
export type WarRoomReadFileMode = (typeof READ_FILE_MODES)[number];

/** Hard ceiling on returned text so a huge document can't blow the agent's
 *  window — independent of the per-call `max_chars` (which can only LOWER it). */
export const READ_FILE_MAX_CHARS_CAP = 200_000;
/** Default when the caller omits `max_chars`. */
export const READ_FILE_DEFAULT_MAX_CHARS = 50_000;

export const warRoomReadFileArgsSchema = z.object({
  /** The file's id (a `cld_files.id` = the `id` from the `war_room` <files> block). */
  file_id: z.string().min(1),
  /**
   * "clean" (default) — the tidied/cleaned extraction (best for reading).
   * "raw"   — the verbatim extracted text (no cleanup).
   * "chunks"— the RAG-ready fragments (parent chunks), each labeled.
   */
  mode: z.enum(READ_FILE_MODES).optional(),
  /** Truncate the returned text to this many characters (capped server-side). */
  max_chars: z.number().int().min(500).max(READ_FILE_MAX_CHARS_CAP).optional(),
});

export type WarRoomReadFileArgs = z.infer<typeof warRoomReadFileArgsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// war_room_read_resource — READ any attached resource, any registered type
// ─────────────────────────────────────────────────────────────────────────────
// The generic reader behind the `<resources>` roster: pass the row's `type` +
// `id` and get its content. Registry-driven — a bespoke adapter (conversation
// history, working-document body) when one exists, else a safe RLS-scoped row
// read of the backing table. `entity_type='thread' | 'war_room'` returns the
// container's full attachment MANIFEST (the "<more/>" escape hatch). Read-only,
// no HITL (same family/dispatcher as war_room_read_thread).

export const READ_RESOURCE_MAX_CHARS_CAP = 100_000;
export const READ_RESOURCE_DEFAULT_MAX_CHARS = 20_000;

export const warRoomReadResourceArgsSchema = z.object({
  /** The resource's entity token (the `type` attr of a `<res>` row). */
  entity_type: z.string().min(1),
  /** The resource's id (the `id` attr of a `<res>` row). */
  entity_id: z.string().min(1),
  /** Token-specific mode (currently unused by most adapters). */
  mode: z.string().optional(),
  /** Truncate the returned content to this many characters. */
  max_chars: z
    .number()
    .int()
    .min(500)
    .max(READ_RESOURCE_MAX_CHARS_CAP)
    .optional(),
});

export type WarRoomReadResourceArgs = z.infer<
  typeof warRoomReadResourceArgsSchema
>;

export interface WarRoomReadResourceResult {
  ok: boolean;
  entity_type: string;
  entity_id: string;
  /** The resource's content (adapter- or row-rendered), truncated if needed. */
  content?: string;
  /** Adapter-specific extras (e.g. message_count, truncated). */
  meta?: Record<string, unknown>;
  error?: string;
  /** A short, model-facing explanation / next step. */
  hint?: string;
  message?: string;
}

export interface WarRoomReadFileResult {
  ok: boolean;
  file_id: string;
  /** The file's display name, when resolvable. */
  file_name?: string;
  mode?: WarRoomReadFileMode;
  /** Page count of the underlying extraction (clean/raw modes). */
  pages?: number;
  /** How the text was extracted (e.g. "pymupdf", "ocr"), when uniform. */
  extraction_method?: string | null;
  /** Whether OCR was used on any page. */
  used_ocr?: boolean;
  /** The extracted text (joined pages, or labeled chunks for mode='chunks'). */
  text?: string;
  /** True when `text` was truncated to `max_chars`. */
  truncated?: boolean;
  /** Total characters available before truncation. */
  total_chars?: number;
  /** A structured reason when `ok:false` (e.g. "no_extraction"). */
  error?: string;
  /** A short, model-facing explanation / next step. */
  hint?: string;
  message?: string;
}
