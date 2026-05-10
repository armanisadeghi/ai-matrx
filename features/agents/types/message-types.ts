/**
 * Message types — AI Matrx API
 *
 * This file defines the complete structure of a message that can be sent to
 * any AI endpoint. It is the single source of truth for the React team.
 *
 * A message's content is always one of:
 *   1. A plain string  → treated as a single text block.
 *   2. An array of ContentBlock objects → a mixed list of typed blocks.
 *
 * Endpoints that accept messages:
 *   POST /ai/agents/{agent_id}             field: user_input
 *   POST /ai/conversations/{conversation_id}  field: user_input
 *   POST /ai/chat                          field: messages[].content
 *
 * ---
 *
 * BLOCK CATEGORIES
 * ────────────────
 * Media blocks   — content the user provides directly (text, image, audio, etc.)
 * Structured inputs — references to server-side data that are resolved before
 *                     the message reaches the model. The client passes a typed
 *                     descriptor; the server fetches the real content and
 *                     injects it as XML.
 */

// =============================================================================
// SECTION 1 — Media blocks (client-provided content)
// =============================================================================

/**
 * Plain text.
 * This is what you get automatically when user_input is a bare string.
 * Use the explicit block form when mixing with other block types.
 *
 * `metadata.role` lets an agent author tag this text block as a named slot
 * the provider translator can read out — e.g. `"negative_prompt"` for image
 * gen, or other future named text inputs. An empty role-tagged block is
 * dropped before the request reaches the model (per the Python
 * `TextContent.replace_variables` contract). Untagged TextBlocks are the
 * "main" message text and never get dropped on empty.
 */
export interface TextBlock {
  type: "text";
  text: string;
  /** Free-form per-block metadata (e.g. `{ role: "negative_prompt" }`). */
  metadata?: Record<string, unknown>;
}

/**
 * Image — by `file_id` (preferred), public URL, native cloud URI, or raw base64.
 *
 * Identifier preference (the backend resolves in this order):
 *   1. `file_id`  — cld_files UUID. Use this for any file we own.
 *   2. `file_uri` — native cloud URI (`s3://`, `gs://`, `supabase://`).
 *   3. `url`      — any public or signed URL.
 *   4. `base64_data` — inline bytes.
 *
 * At least one of `file_id` / `file_uri` / `url` / `base64_data` is required.
 *
 * See `MediaRef` in [features/files/types.ts](../../files/types.ts) for the
 * canonical reference shape; build via the helpers in
 * [features/files/redux/converters.ts](../../files/redux/converters.ts).
 *
 * Supported by all providers.
 */
export interface ImageBlock {
  type: "image";
  /** cld_files UUID. Preferred — backend skips a redirect lookup. */
  file_id?: string;
  /** Public URL pointing to the image. */
  url?: string;
  /** Native cloud URI (`s3://`, `gs://`, `supabase://`). */
  file_uri?: string;
  /** Base64-encoded image bytes. Include mime_type when using this field. */
  base64_data?: string;
  /** MIME type e.g. "image/jpeg". Auto-detected from the URL or data if omitted. */
  mime_type?: string;
  /**
   * Google only — controls detail level sent to the model.
   * "low" | "medium" | "high". Ignored by OpenAI and Anthropic.
   */
  media_resolution?: "low" | "medium" | "high";
  /**
   * Free-form per-block metadata, forwarded to the model context as-is.
   * Authors set this in the agent builder (e.g. { role: "first_frame" }).
   * Mirrors `MediaRef.metadata`.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Audio file — by public URL or raw base64.
 *
 * Two modes:
 *   auto_transcribe=false (default): passed natively to the model.
 *     Google Gemini supports native audio. OpenAI and Anthropic do NOT —
 *     those providers will silently skip this block unless you set auto_transcribe=true.
 *
 *   auto_transcribe=true: transcribed server-side via Groq Whisper first,
 *     then sent as a text block to any provider. Works everywhere.
 */
export interface AudioBlock {
  type: "audio";
  /** cld_files UUID. Preferred — see ImageBlock for the resolution order. */
  file_id?: string;
  /** Public URL pointing to the audio file. */
  url?: string;
  /** Native cloud URI (`s3://`, `gs://`, `supabase://`). */
  file_uri?: string;
  /** Base64-encoded audio bytes. */
  base64_data?: string;
  /** MIME type e.g. "audio/mp3", "audio/wav". Auto-detected if omitted. */
  mime_type?: string;
  /**
   * Default false.
   * true → transcribe via Groq Whisper then send as text (works with all providers).
   * false → send native audio bytes (Google only).
   */
  auto_transcribe?: boolean;
  /** Whisper model to use when auto_transcribe=true. Default "whisper-large-v3-turbo". */
  transcription_model?: string;
  /** ISO-639-1 language hint e.g. "en", "es". Auto-detected if omitted. */
  transcription_language?: string;
  /** Free-form per-block metadata. Mirrors `MediaRef.metadata`. */
  metadata?: Record<string, unknown>;
}

/**
 * Video file — Google Gemini only.
 * Silently skipped by OpenAI and Anthropic.
 * At least one of url, base64_data, or file_uri is required.
 */
export interface VideoBlock {
  type: "video";
  /** cld_files UUID. Preferred — see ImageBlock for the resolution order. */
  file_id?: string;
  /** Public URL pointing to the video file. */
  url?: string;
  /** Base64-encoded video bytes. */
  base64_data?: string;
  /**
   * Native cloud URI (`s3://`, `gs://`, `supabase://`) OR the Google File
   * API URI for pre-uploaded files (avoids re-uploading on every request
   * for large files).
   */
  file_uri?: string;
  /** MIME type e.g. "video/mp4". Auto-detected if omitted. */
  mime_type?: string;
  /** Free-form per-block metadata. Mirrors `MediaRef.metadata`. */
  metadata?: Record<string, unknown>;
}

/**
 * YouTube video — Google Gemini only.
 * The model can reason about the full video content, not just a thumbnail.
 * Silently skipped (with a server-side warning log) by OpenAI and Anthropic.
 */
export interface YouTubeVideoBlock {
  type: "youtube_video";
  /** Full YouTube URL: "https://youtube.com/watch?v=..." or "https://youtu.be/..." */
  url: string;
  /** Free-form per-block metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Document — PDF, DOCX, TXT, etc.
 * Supported natively by Anthropic and Google. OpenAI extracts text via server-side processing.
 * At least one of url or base64_data is required.
 */
export interface DocumentBlock {
  type: "document";
  /** cld_files UUID. Preferred — see ImageBlock for the resolution order. */
  file_id?: string;
  /** Public URL pointing to the document. */
  url?: string;
  /** Native cloud URI (`s3://`, `gs://`, `supabase://`). */
  file_uri?: string;
  /** Base64-encoded document bytes. Include mime_type when using this field. */
  base64_data?: string;
  /** MIME type e.g. "application/pdf". Auto-detected if omitted. */
  mime_type?: string;
  /** Free-form per-block metadata. Mirrors `MediaRef.metadata`. */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// SECTION 2 — Structured input blocks (server-resolved live data)
// =============================================================================
//
// These blocks are NOT passed directly to the model. Instead, the server
// fetches the referenced data before the model call and injects it as
// structured XML into the user message. The model sees clean, readable context.
//
// All structured input blocks share four control fields (see StructuredInputBase).
//
// COMMON PATTERN — editable + keep_fresh together:
//   editable: true   → the model gets CRUD tools for this data type automatically.
//   keep_fresh: true → the data is re-fetched on every turn (never stale).
//   Together: the model reads, edits, and on the next turn automatically sees
//   its own changes — without any extra wiring on either side.

/** Fields shared by every structured input block. */
interface StructuredInputBase {
  /**
   * Default true.
   * The fetched content is injected as plain text into the message.
   * Currently assumed true for all types — included for future flexibility.
   */
  convert_to_text?: boolean;

  /**
   * Default false.
   * When true: if the server fails to fetch this block's data, the block is
   * silently dropped instead of aborting the entire request. Use for
   * nice-to-have context that shouldn't block the response.
   */
  optional_context?: boolean;

  /**
   * Default false.
   * When true: the resolved content IS sent to the model for this turn, but
   * is stripped before the message is saved to the database. The block
   * descriptor (type + IDs + keep_fresh: true) is always saved.
   *
   * Effect: every turn re-fetches the data fresh from the source. The model
   * always sees the current state, and the conversation history stays lean.
   *
   * Use for: live task status, frequently-edited notes, real-time table data.
   */
  keep_fresh?: boolean;

  /**
   * Default false.
   * When true: the server automatically injects the CRUD/patch tools for this
   * content type into the model's tool list. The model can read, update, and
   * patch the item without the agent definition pre-configuring those tools.
   *
   * Tool sets injected per block type:
   *   input_notes  → note_get, note_list, note_create, note_update, note_patch, note_delete
   *   input_task   → task_get, task_list, task_create, task_update, task_delete
   *   input_table  → usertable_get_all, usertable_get_metadata, usertable_get_fields,
   *                  usertable_get_data, usertable_search_data, usertable_add_rows,
   *                  usertable_update_row, usertable_delete_row, usertable_create_advanced
   *   input_list   → userlist_get_all, userlist_get_details, userlist_update_item,
   *                  userlist_batch_update, userlist_create, userlist_create_simple
   *   input_webpage → (none — external content is read-only)
   *   input_data    → (none — raw DB refs are read-only by default)
   *
   * Pairs naturally with keep_fresh: the model edits the item, and the next
   * turn automatically re-fetches and shows the updated version.
   */
  editable?: boolean;
}

// ─── input_webpage ────────────────────────────────────────────────────────────

/**
 * Scrape one or more public URLs server-side and inject the content as
 * structured <web_context> XML. Scraping runs concurrently for all URLs.
 *
 * On success: clean, AI-optimised article text is injected.
 * On failure: a visible <webpage status="failed"> notice is injected so the
 *   model knows the page was unavailable and can tell the user. A
 *   "structured_input_warning" stream event is also emitted to the client.
 *
 * optional_context=false (default) raises only if ALL URLs fail.
 * Partial failures are always included as failure notices regardless.
 *
 * editable has no effect — web content is external and read-only.
 */
export interface WebpageInputBlock extends StructuredInputBase {
  type: "input_webpage";
  /** One or more public URLs to scrape. */
  urls: string[];
}

// ─── input_notes ──────────────────────────────────────────────────────────────

/**
 * Fetch one or more user notes by ID and inject as LLM-friendly XML.
 *
 * When editable=true, injects:
 *   note_get, note_list, note_create, note_update, note_patch, note_delete
 */
export interface NotesInputBlock extends StructuredInputBase {
  type: "input_notes";
  /** One or more note IDs to fetch. */
  note_ids: string[];
  /** XML rendering template. Default "full". */
  template?: "full" | "compact" | "minimal";
}

// ─── input_task ───────────────────────────────────────────────────────────────

/**
 * Fetch one or more task objects by ID and inject as LLM-friendly XML.
 *
 * When editable=true, injects:
 *   task_get, task_list, task_create, task_update, task_delete
 */
export interface TaskInputBlock extends StructuredInputBase {
  type: "input_task";
  /** One or more task IDs to fetch. */
  task_ids: string[];
  /** XML rendering template. Default "full". */
  template?: "full" | "compact";
}

// ─── input_table ──────────────────────────────────────────────────────────────
// Bookmark shapes — the exact JSON the UI copies to the clipboard.

/** Fetch an entire user table. */
export interface FullTableBookmark {
  type: "full_table";
  table_id: string;
  /** Cosmetic label used in the injected XML. */
  table_name?: string;
}

/** Fetch all values in a single column. */
export interface TableColumnBookmark {
  type: "table_column";
  table_id: string;
  column_name: string;
  table_name?: string;
}

/** Fetch a single row. */
export interface TableRowBookmark {
  type: "table_row";
  table_id: string;
  row_id: string;
  table_name?: string;
}

/** Fetch a single cell value. */
export interface TableCellBookmark {
  type: "table_cell";
  table_id: string;
  row_id: string;
  column_name: string;
  table_name?: string;
}

export type TableBookmark =
  | FullTableBookmark
  | TableColumnBookmark
  | TableRowBookmark
  | TableCellBookmark;

/**
 * Fetch one or more user table bookmarks and inject as XML.
 * Pass the bookmark object exactly as the UI generates it.
 *
 * When editable=true, injects the full usertable_* tool suite:
 *   usertable_get_all, usertable_get_metadata, usertable_get_fields,
 *   usertable_get_data, usertable_search_data, usertable_add_rows,
 *   usertable_update_row, usertable_delete_row, usertable_create_advanced
 */
export interface TableInputBlock extends StructuredInputBase {
  type: "input_table";
  bookmarks: TableBookmark[];
}

// ─── input_list ───────────────────────────────────────────────────────────────
// Bookmark shapes — the exact JSON the UI copies to the clipboard.

/** Fetch an entire user list. */
export interface FullListBookmark {
  type: "full_list";
  list_id: string;
  /** Cosmetic label used in the injected XML. */
  list_name?: string;
}

/** Fetch all items in a specific group within a list. */
export interface ListGroupBookmark {
  type: "list_group";
  list_id: string;
  group_name: string;
  list_name?: string;
}

/** Fetch a single list item. */
export interface ListItemBookmark {
  type: "list_item";
  list_id: string;
  item_id: string;
  list_name?: string;
}

export type ListBookmark =
  | FullListBookmark
  | ListGroupBookmark
  | ListItemBookmark;

/**
 * Fetch one or more user list bookmarks and inject as XML.
 * Pass the bookmark object exactly as the UI generates it.
 *
 * When editable=true, injects:
 *   userlist_get_all, userlist_get_details, userlist_update_item,
 *   userlist_batch_update, userlist_create, userlist_create_simple
 */
export interface ListInputBlock extends StructuredInputBase {
  type: "input_list";
  bookmarks: ListBookmark[];
}

// ─── input_data ───────────────────────────────────────────────────────────────
// Typed references to system tables. The server fetches and wraps results
// in <data_context> XML. Only tables in the server allowlist are accessible.

/** Allowed tables for all DataRef types. */
export type DataRefTable =
  | "notes"
  | "tasks"
  | "projects"
  | "workspaces"
  | "organizations"
  | "contacts"
  | "contact_groups";

/** Fetch a single row by primary key. */
export interface DbRecordRef {
  ref_type: "db_record";
  /** Must be in the server allowlist (see DataRefTable). */
  table: DataRefTable;
  /** Primary key of the row. */
  id: string;
  /** Cosmetic label for the XML wrapper. Defaults to table name. */
  label?: string;
  /** Project only these fields. Omit to include all allowed fields. */
  fields?: string[];
  /** When true, a fetch failure silently drops this single ref. */
  optional_context?: boolean;
}

/** Fetch multiple rows matching a filter. */
export interface DbQueryRef {
  ref_type: "db_query";
  /** Must be in the server allowlist. */
  table: DataRefTable;
  /** Cosmetic label for the XML wrapper. */
  label?: string;
  /**
   * Equality filters applied as WHERE clauses.
   * { "field_name": value }. Field must be in the table's allowlist.
   */
  filter?: Record<string, unknown>;
  /** Project only these fields. Omit to include all allowed fields. */
  fields?: string[];
  /** Sort order. */
  sort?: { field: string; direction: "asc" | "desc" };
  /** Max rows returned. Default 50. */
  limit?: number;
  optional_context?: boolean;
}

/** Fetch the value of a single field from a single row. */
export interface DbFieldRef {
  ref_type: "db_field";
  /** Must be in the server allowlist. */
  table: DataRefTable;
  /** Primary key of the row. */
  id: string;
  /** Field name to retrieve. Must be in the table's allowlist. */
  field_name: string;
  /** Cosmetic label for the XML wrapper. */
  label?: string;
  optional_context?: boolean;
}

export type DataRef = DbRecordRef | DbQueryRef | DbFieldRef;

/**
 * Fetch data from system tables using typed DataRef descriptors.
 * All results are wrapped in a single <data_context> XML block.
 *
 * editable has no effect — raw DB refs are read-only by default.
 */
export interface DataInputBlock extends StructuredInputBase {
  type: "input_data";
  /** One or more typed data references. Fetched concurrently. */
  refs: DataRef[];
}

// =============================================================================
// SECTION 3 — ContentBlock union and UserInput
// =============================================================================

/**
 * Every block type that can appear in a user message content array.
 *
 * Media blocks:
 *   TextBlock | ImageBlock | AudioBlock | VideoBlock |
 *   YouTubeVideoBlock | DocumentBlock
 *
 * Structured inputs (server-resolved live data):
 *   WebpageInputBlock | NotesInputBlock | TaskInputBlock |
 *   TableInputBlock | ListInputBlock | DataInputBlock
 */
export type ContentBlock =
  // Media
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | YouTubeVideoBlock
  | DocumentBlock
  // Structured inputs
  | WebpageInputBlock
  | NotesInputBlock
  | TaskInputBlock
  | TableInputBlock
  | ListInputBlock
  | DataInputBlock;

/**
 * The user_input field accepted by agent and conversation endpoints.
 *
 *   string          → treated as a single TextBlock. Use for simple text messages.
 *   ContentBlock[]  → a mixed array of typed blocks. Use when attaching images,
 *                     referencing notes/tasks, scraping URLs, etc.
 *
 * The array can contain any mix of types in any order. There is no limit on
 * the number of blocks, though providers impose their own token/context limits.
 *
 * Examples:
 *
 *   // Simple text
 *   "Summarise this week's tasks."
 *
 *   // Text + image
 *   [
 *     { "type": "text", "text": "What is in this image?" },
 *     { "type": "image", "url": "https://example.com/chart.png" }
 *   ]
 *
 *   // Text + live notes + editable task (model can update it)
 *   [
 *     { "type": "text", "text": "Review my notes and update the task status." },
 *     { "type": "input_notes", "note_ids": ["abc123"], "keep_fresh": true },
 *     { "type": "input_task", "task_ids": ["task-xyz"], "editable": true, "keep_fresh": true }
 *   ]
 *
 *   // Live table the model can edit
 *   [
 *     { "type": "text", "text": "Fill in the missing values in my benchmark table." },
 *     {
 *       "type": "input_table",
 *       "bookmarks": [{ "type": "full_table", "table_id": "3b81bb2e-..." }],
 *       "editable": true,
 *       "keep_fresh": true
 *     }
 *   ]
 */
export type UserInput = string | ContentBlock[];
