"use client";

import type { LucideIcon } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Library source adapters let the `/code` Code Library surface rows from
 * any Supabase table as native editor tabs while preserving the project
 * rule of *single source of truth*: edits write back to the same row,
 * same column, no mirroring into `code_files`.
 *
 * Each adapter owns a tab-id prefix (`prompt-app:`, `aga-app:`, etc.) so
 * the save router in `useSaveActiveTab` can dispatch to the right adapter
 * purely from the tab id.
 *
 * Multi-code-column rows (e.g. `tool_ui_components`) are modelled as
 * folders with one leaf per non-null code field. The `SourceEntry.fields`
 * array tells the tree how to render children.
 */

/** A row from a source table, as shown in the Library tree. */
export interface SourceEntry {
  /** Row id (the PK of the source table). */
  rowId: string;
  /** Display name for the entry (folder header or leaf label). */
  name: string;
  /** Optional subtitle / tooltip. */
  description?: string;
  /** Remote `updated_at` for optimistic-concurrency guards. */
  updatedAt?: string;
  /** Per-field breakdown for multi-column sources. Undefined for
   *  single-field sources, which are opened directly as leaves. */
  fields?: SourceEntryField[];
  /** Optional badge shown next to the name (e.g. "Draft"). */
  badge?: string;
}

/** A single editable code column inside a multi-column source row. */
export interface SourceEntryField {
  /** Stable identifier for the column (e.g. "inline", "overlay"). */
  fieldId: string;
  /** Display label (e.g. "Inline", "Overlay"). */
  label: string;
  /** Suggested filename extension, e.g. "tsx". */
  extension: string;
  /** Monaco language id. */
  language: string;
  /** True iff the column currently has content. Null columns still
   *  render as a leaf so the user can create them. */
  hasContent: boolean;
}

/** Content + metadata loaded for a specific tab. */
export interface LoadedSourceEntry {
  rowId: string;
  fieldId?: string;
  /** Filename shown on the tab (e.g. "my-app.tsx"). */
  name: string;
  /** Virtual path used by Monaco — does not hit any filesystem. */
  path: string;
  /** Monaco language id. */
  language: string;
  /** Current code for this column. */
  content: string;
  /** Remote `updated_at` at load time — stored on the tab and passed
   *  back with `save()` to detect remote changes. */
  updatedAt?: string;
}

/** Thrown by `adapter.save()` when the remote row has changed since load. */
export class RemoteConflictError extends Error {
  readonly isConflict = true;
  constructor(
    public readonly sourceId: string,
    public readonly rowId: string,
    public readonly fieldId?: string,
  ) {
    super(
      `Remote row has been updated since it was loaded (source=${sourceId}, row=${rowId}${
        fieldId ? `, field=${fieldId}` : ""
      }).`,
    );
  }
}

export function isRemoteConflictError(
  err: unknown,
): err is RemoteConflictError {
  return Boolean(err) && (err as RemoteConflictError)?.isConflict === true;
}

/** Arguments passed to `adapter.save()`. */
export interface SaveSourceArgs {
  rowId: string;
  content: string;
  fieldId?: string;
  /** The `updated_at` that was loaded; the adapter uses this to
   *  detect remote overwrites (optimistic concurrency). */
  expectedUpdatedAt?: string;
}

/** Returned from `adapter.save()` on success. */
export interface SaveSourceResult {
  updatedAt: string;
}

/** Arguments passed to `adapter.rename()`. */
export interface RenameSourceArgs {
  rowId: string;
  /**
   * New filename as the user typed it — typically with an extension
   * (e.g. `"foo.tsx"`). The adapter is responsible for splitting basename
   * vs extension, mapping the extension back to the source's
   * language/type column (where applicable), and writing both updates
   * atomically.
   *
   * Empty extension is allowed for sources whose row name doesn't carry
   * a file extension (e.g. prompt-app slugs).
   */
  newName: string;
  /** Multi-field source field id, when renaming a single column inside a row. */
  fieldId?: string;
  /** Same optimistic-concurrency token used by `save()`. */
  expectedUpdatedAt?: string;
}

/** Returned from `adapter.rename()` on success. */
export interface RenameSourceResult {
  updatedAt: string;
  /**
   * The canonical name the adapter chose to persist (after sanitisation).
   * The tree should display this rather than echoing `newName` verbatim.
   */
  appliedName: string;
}

/**
 * Contract every library source implements. Adapters must be pure
 * client-side modules that talk to Supabase directly — no Redux, no
 * server actions, no next/router — so the `/code` workspace can run
 * them concurrently without coupling.
 */
export interface LibrarySourceAdapter {
  /** Stable id, matches the row in the registry. */
  sourceId: string;
  /** Display label for the Library tree root. */
  label: string;
  /** Icon for the Library tree root. */
  icon: LucideIcon;
  /** Tab-id prefix, including trailing colon (e.g. "prompt-app:"). */
  tabIdPrefix: string;
  /** Whether rows expose multiple code columns (folder-per-row). */
  multiField: boolean;

  /** Parse a tab id like "prompt-app:<uuid>" → `{ rowId }` or
   *  "tool-ui:<uuid>:<field>" → `{ rowId, fieldId }`. Returns null if
   *  the id doesn't belong to this adapter. */
  parseTabId(tabId: string): { rowId: string; fieldId?: string } | null;

  /** Build a tab id from a row (+ field for multi-column sources). */
  makeTabId(rowId: string, fieldId?: string): string;

  /** List entries the current user is allowed to edit. */
  list(supabase: SupabaseClient, userId: string | null): Promise<SourceEntry[]>;

  /** Load a specific (row, field) pair. */
  load(
    supabase: SupabaseClient,
    rowId: string,
    fieldId?: string,
  ): Promise<LoadedSourceEntry>;

  /** Persist the content back to the source row + column. */
  save(
    supabase: SupabaseClient,
    args: SaveSourceArgs,
  ): Promise<SaveSourceResult>;

  /**
   * Optional — rename the row's display name (and, when relevant, the
   * underlying language/type column derived from the file extension).
   *
   * Adapters that don't expose a meaningful rename (e.g. catalog rows
   * whose names are server-managed) can omit this; the UI hides the
   * Rename action when this is missing.
   */
  rename?(
    supabase: SupabaseClient,
    args: RenameSourceArgs,
  ): Promise<RenameSourceResult>;
}
