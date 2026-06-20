/**
 * Data Source Types for Prompt Execution (LEGACY prompt system).
 *
 * Defines types for referencing user-generated table data. These mirror the
 * CANONICAL Matrx reference item for the `table*` taxonomy
 * (docs/protocol/MATRX_REFERENCES.md): identity ids (`table_id`, `row_id`,
 * `column_name`) are authoritative; `table_name`, `column_display_name`, and
 * `description` are non-authoritative display hints. Field names are aligned to
 * the canonical wire shape so a bookmark maps 1:1 to a reference item via
 * `features/matrx-envelope/bookmarkToReference`.
 */

export type TableBookmarkType = 'full_table' | 'table_row' | 'table_column' | 'table_cell';

export interface TableBookmarkBase {
  /** Authoritative identity. */
  table_id: string;
  /** Display hint — re-fetched live; never authoritative. */
  table_name: string;
  /** Display hint — clipboard/preview prose only. */
  description: string;
}

export interface FullTableBookmark extends TableBookmarkBase {
  type: 'full_table';
}

export interface TableRowBookmark extends TableBookmarkBase {
  type: 'table_row';
  row_id: string;
}

export interface TableColumnBookmark extends TableBookmarkBase {
  type: 'table_column';
  column_name: string;
  column_display_name: string;
}

export interface TableCellBookmark extends TableBookmarkBase {
  type: 'table_cell';
  row_id: string;
  column_name: string;
  column_display_name: string;
}

export type TableBookmark = 
  | FullTableBookmark 
  | TableRowBookmark 
  | TableColumnBookmark 
  | TableCellBookmark;

/**
 * Extended variable source that supports table bookmarks
 */
export type VariableDataSource = 
  | { type: 'text'; value: string }
  | { type: 'table-bookmark'; bookmark: TableBookmark; data?: string }
  | { type: 'file'; fileId: string; content?: string }
  | { type: 'url'; url: string; content?: string };

