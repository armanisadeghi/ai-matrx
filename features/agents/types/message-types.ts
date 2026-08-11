/**
 * Canonical user-input attachment types.
 *
 * Every export in this compatibility module is derived from the generated
 * OpenAPI `UserInputPart` union. It intentionally contains no hand-authored
 * wire fields, literals, or allowlists: regenerate the API types and every
 * consumer changes with the server contract.
 */

import type { UserInputPart } from "./request.types";

export type TextBlock = Extract<UserInputPart, { type: "text" }>;

type MediaBlock = Extract<UserInputPart, { type: "media" }>;
export type ImageBlock = Extract<MediaBlock, { kind: "image" }>;
export type AudioBlock = Extract<MediaBlock, { kind: "audio" }>;
export type VideoBlock = Extract<MediaBlock, { kind: "video" }>;
export type DocumentBlock = Extract<MediaBlock, { kind: "document" }>;
export type YouTubeVideoBlock = Extract<MediaBlock, { kind: "youtube" }>;

export type WebpageInputBlock = Extract<
  UserInputPart,
  { type: "input_webpage" }
>;
export type NotesInputBlock = Extract<UserInputPart, { type: "input_notes" }>;
export type TaskInputBlock = Extract<UserInputPart, { type: "input_task" }>;
export type TableInputBlock = Extract<UserInputPart, { type: "input_table" }>;
export type ListInputBlock = Extract<UserInputPart, { type: "input_list" }>;
export type DataInputBlock = Extract<UserInputPart, { type: "input_data" }>;

export type TableBookmark = NonNullable<TableInputBlock["bookmarks"]>[number];
export type FullTableBookmark = Extract<TableBookmark, { type: "full_table" }>;
export type TableSchemaBookmark = Extract<
  TableBookmark,
  { type: "table_schema" }
>;
export type TableColumnBookmark = Extract<
  TableBookmark,
  { type: "table_column" }
>;
export type TableRowBookmark = Extract<TableBookmark, { type: "table_row" }>;
export type TableCellBookmark = Extract<TableBookmark, { type: "table_cell" }>;

export type ListBookmark = NonNullable<ListInputBlock["bookmarks"]>[number];
export type FullListBookmark = Extract<ListBookmark, { type: "full_list" }>;
export type ListGroupBookmark = Extract<ListBookmark, { type: "list_group" }>;
export type ListItemBookmark = Extract<ListBookmark, { type: "list_item" }>;

export type DataRef = NonNullable<DataInputBlock["refs"]>[number];
export type DbRecordRef = Extract<DataRef, { ref_type: "db_record" }>;
export type DbQueryRef = Extract<DataRef, { ref_type: "db_query" }>;
export type DbFieldRef = Extract<DataRef, { ref_type: "db_field" }>;
export type DataRefTable = DataRef["table"];

/** Every structured input shares only fields that exist on the generated union. */
export type StructuredInputBase = Pick<
  WebpageInputBlock,
  | "convert_to_text"
  | "optional_context"
  | "keep_fresh"
  | "editable"
  | "metadata"
>;

export type ContentBlock = UserInputPart;
export type UserInput = string | UserInputPart[];
