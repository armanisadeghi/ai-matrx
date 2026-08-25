/**
 * features/files/virtual-sources/types.ts
 *
 * The `VirtualSourceAdapter` contract — one adapter per "fake file" surface
 * (Notes, Agent Apps, Prompt Apps, Tool UIs, code-files snippets, …). Each
 * adapter exposes a Postgres-backed table (or set of tables) as if it were a
 * filesystem mounted under `/files`.
 *
 * This supersedes the older `LibrarySourceAdapter` at
 * `features/code/library-sources/types.ts`. We keep that one alive (marked
 * deprecated) and provide an adapt-up helper so the `/code` Library tree
 * continues working through the migration. New adapters target THIS contract.
 *
 * Design highlights:
 *  - Pure data DTOs (`VirtualNode`, `VirtualContent`) — Pydantic mirrors will
 *    use the same field names with snake_case at the wire boundary so an AI
 *    agent's `fs_read` Python tool dispatches to the same conceptual model.
 *  - `VirtualCapabilities` flags drive UI gating (rename / move / etc).
 *  - `openInRoute` is a per-feature handoff. Notes adapter returns
 *    `"/notes/<id>"` so double-click in `/files` opens the notes-v2 editor
 *    rather than the generic Monaco preview.
 *  - Optimistic concurrency standardizes on `expected_updated_at`
 *    (TIMESTAMPTZ at the wire). Adapters whose backing table tracks
 *    `version: int` instead translate internally.
 *
 * See `features/files/virtual-sources/README.md` for the full pattern doc and
 * /Users/armanisadeghi/code/common-docs/systems/media/file-service/HANDOFF.md for the server parity asks.
 */

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Stable, opaque id assigned to each node by its adapter. Survives renames;
 *  the path does not. */
export type VirtualId = string;

// ---------------------------------------------------------------------------
// Node DTOs
// ---------------------------------------------------------------------------

/** A node in a virtual tree — folder or file. Adapters that don't have nested
 *  hierarchy (Agent Apps, Prompt Apps) only emit `kind: "file"` nodes parented
 *  at root. Adapters with hierarchy (Notes, code-files snippets) emit folders. */
export interface VirtualNode {
  id: VirtualId;
  kind: "file" | "folder";
  name: string;
  /** Parent within this adapter, null = adapter root. */
  parentId: VirtualId | null;
  /** Optional badge — e.g. "Draft", "v3", "Read-only". Rendered next to name. */
  badge?: string;
  /** ISO timestamp of last server-side mutation. Drives optimistic concurrency
   *  on writes / renames / moves. */
  updatedAt?: string;
  /** Suggested filename extension (".md", ".tsx"). Files only. */
  extension?: string;
  /** Monaco language id ("typescript", "markdown", "json"). Files only. */
  language?: string;
  /** Mime hint for previewer registry ("text/markdown" etc). */
  mimeType?: string;
  /** Size in bytes. Cheap estimates are fine; null is acceptable. */
  size?: number | null;
  /** True iff content is non-empty. Drives the "empty field" dim style on
   *  multi-field rows (e.g. tool_ui_components has 5 columns; some null). */
  hasContent?: boolean;
  /** Multi-field children, populated when this folder represents a single row
   *  with multiple editable code columns. Each field becomes a leaf. */
  fields?: VirtualNodeField[];
  /** Adapter-specific metadata — icon overrides, color, etc. UI components
   *  are encouraged to ignore unknown keys. */
  metadata?: Record<string, unknown>;
}

export interface VirtualNodeField {
  fieldId: string;
  label: string;
  /** Suggested filename extension for the leaf, e.g. "tsx". */
  extension: string;
  /** Monaco language id. */
  language: string;
  /** Whether this column has any content right now. */
  hasContent: boolean;
}

/** Returned by `read()`. The `path` is the virtual path Monaco uses for its
 *  internal model — never hits a filesystem. */
export interface VirtualContent {
  id: VirtualId;
  fieldId?: string;
  name: string;
  path: string;
  language: string;
  mimeType: string;
  /** UTF-8 text. For binary blobs (rare in fake files) the adapter exposes
   *  `getSignedUrl()` instead. */
  content: string;
  updatedAt?: string;
}

/** Props passed to an adapter's `inlinePreview` component when it's mounted
 *  by the cloud-files preview pane. The pane resolves the synthetic id back
 *  to its parts and hands them in directly. */
export interface InlinePreviewProps {
  /** The adapter-scoped row id (already de-prefixed from the synthetic id). */
  id: VirtualId;
  /** Field id for multi-field rows (Tool UIs). Single-field sources omit. */
  fieldId?: string;
  /** Initial display name. The component is free to update its own title
   *  internally on rename. */
  name: string;
}

/** Per-row version history entry, when `capabilities.versions === true`. */
export interface VirtualVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  createdBy: string | null;
  changeSummary: string | null;
}

// ---------------------------------------------------------------------------
// Capabilities + DnD policy
// ---------------------------------------------------------------------------

export interface VirtualCapabilities {
  list: boolean;
  read: boolean;
  write: boolean;
  rename: boolean;
  delete: boolean;
  move: boolean;
  /** Adapter exposes a folder hierarchy via `list({ parentId })`. */
  folders: boolean;
  /** Adapter exposes binary content via `getSignedUrl()`. */
  binary: boolean;
  /** Adapter has per-row version history (`listVersions` + `restoreVersion`). */
  versions: boolean;
  /** Each row has multiple editable code columns (folder-per-row layout). */
  multiField: boolean;
}

export interface VirtualDndPolicy {
  /** Adapter accepts drops from itself (intra-source moves). */
  acceptsOwn: boolean;
  /** Adapter accepts drops from real cloud-files (e.g. importing a `.md`
   *  into Notes). Default false; cross-source moves are deferred. */
  acceptsReal?: boolean;
  /** Adapter accepts drops from these other adapter ids. Default []. */
  acceptsForeign?: string[];
}

// ---------------------------------------------------------------------------
// Operation argument shapes
// ---------------------------------------------------------------------------

export interface ListArgs {
  /** null = adapter root. */
  parentId: VirtualId | null;
  /** Pagination — adapters not implementing this can ignore and return all. */
  limit?: number;
  offset?: number;
  /** When true, include soft-deleted rows. Adapters whose backing table has
   *  no soft-delete column ignore this. */
  includeDeleted?: boolean;
}

export interface WriteArgs {
  id: VirtualId;
  /** Field id for multi-field sources. Single-field sources omit. */
  fieldId?: string;
  content: string;
  /** Server-side optimistic concurrency. If the row's current `updated_at`
   *  doesn't match, the adapter throws `RemoteConflictError`. */
  expectedUpdatedAt?: string;
}

export interface RenameArgs {
  id: VirtualId;
  newName: string;
  expectedUpdatedAt?: string;
}

export interface MoveArgs {
  id: VirtualId;
  /** null = move to adapter root. */
  newParentId: VirtualId | null;
  expectedUpdatedAt?: string;
}

export interface CreateArgs {
  parentId: VirtualId | null;
  kind: "file" | "folder";
  name: string;
  /** Initial content for files; ignored for folders. */
  content?: string;
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

/**
 * Every virtual source registers one of these. Adapters are pure client-side
 * modules that talk to Supabase directly (or, in Phase 4, to the Python
 * `/virtual/*` dispatcher). They MUST NOT touch other features' Redux slices
 * — adapter writes flow into `cloudFiles.filesById` with synthetic ids of
 * shape `vfs:<sourceId>:<virtualId>[:<fieldId>]`.
 */
export interface VirtualSourceAdapter {
  // ---- identity ----

  /** Stable id used in synthetic file ids and routing — e.g. `"notes"`,
   *  `"aga_apps"`. Lowercase + underscores. */
  sourceId: string;
  /** Human-facing label rendered as the tree-root name — `"Notes"`,
   *  `"Agent Apps"`. Used in display paths (`/Notes/Idea.md`). */
  label: string;
  /** Lucide icon for the tree root. */
  icon: LucideIcon;
  /** Optional accent color hint for tree-root chip. */
  accentColor?: string;
  capabilities: VirtualCapabilities;
  dnd: VirtualDndPolicy;

  // ---- path helpers ----

  /** Path prefix used when displaying full paths — e.g. `"/Notes"`. Should
   *  match `label` with leading slash. The canonical normalized form
   *  `vfs://<sourceId>/<...>` is built by `path.ts` from this. */
  pathPrefix: string;
  /** Build a `/code` workspace tab id from a row (+ optional field). Kept
   *  for compatibility with the existing `LibrarySourceAdapter` consumers. */
  makeTabId(id: VirtualId, fieldId?: string): string;
  /** Inverse of `makeTabId` — returns null if the id doesn't belong here. */
  parseTabId(tabId: string): { id: VirtualId; fieldId?: string } | null;

  // ---- data ops ----

  /** List immediate children of a folder (or roots when `parentId === null`). */
  list(
    supabase: SupabaseClient,
    userId: string,
    args: ListArgs,
  ): Promise<VirtualNode[]>;

  /** Load a specific row + (optional) field. */
  read(
    supabase: SupabaseClient,
    userId: string,
    id: VirtualId,
    fieldId?: string,
  ): Promise<VirtualContent>;

  /** Persist content. Returns the new `updated_at` for optimistic-concurrency
   *  bookkeeping on the caller side. */
  write(
    supabase: SupabaseClient,
    userId: string,
    args: WriteArgs,
  ): Promise<{ updatedAt: string }>;

  /** Rename. Returns the new `updated_at`. */
  rename(
    supabase: SupabaseClient,
    userId: string,
    args: RenameArgs,
  ): Promise<{ updatedAt: string }>;

  /** Move (re-parent). Optional — adapters without folder hierarchy omit. */
  move?(
    supabase: SupabaseClient,
    userId: string,
    args: MoveArgs,
  ): Promise<{ updatedAt: string }>;

  /** Soft-delete by default; pass `hard = true` for adapters that support
   *  permanent removal (rare). */
  delete(
    supabase: SupabaseClient,
    userId: string,
    id: VirtualId,
    hard?: boolean,
  ): Promise<void>;

  /** Optional — create a new row or folder. */
  create?(
    supabase: SupabaseClient,
    userId: string,
    args: CreateArgs,
  ): Promise<VirtualNode>;

  // ---- inline preview / editor ----

  /**
   * Per-source inline viewer/editor for the cloud-files preview pane. When
   * provided, the preview pane mounts this component instead of the generic
   * `<FilePreview>` registry. The component is responsible for fetching its
   * own content (typically via `adapter.read()`) and saving on edit
   * (typically via `adapter.write()`) — the cloud-files preview pane just
   * provides the chrome (action bar + close button).
   *
   * Notes wraps `NoteEditorCore`; code-shaped sources wrap `SmallCodeEditor`.
   * Adapters that omit this fall back to the generic Monaco preview through
   * `useFileBlob` / `readAny`.
   */
  inlinePreview?: ComponentType<InlinePreviewProps>;

  // ---- routing handoff (secondary action) ----

  /**
   * Optional URL the user can click "Open in <feature>" to navigate to.
   * **Not the primary activation behavior** — double-click in `/files`
   * always opens the inline preview first. Surfaces as a button in the
   * preview pane's action bar.
   *
   * Returning `null` hides the button (no dedicated route exists).
   */
  openInRoute?(node: VirtualNode): string | null;

  // ---- versions (optional) ----

  listVersions?(
    supabase: SupabaseClient,
    id: VirtualId,
  ): Promise<VirtualVersion[]>;

  restoreVersion?(
    supabase: SupabaseClient,
    id: VirtualId,
    versionId: string,
  ): Promise<void>;

  // ---- binary (optional) ----

  getSignedUrl?(
    supabase: SupabaseClient,
    id: VirtualId,
  ): Promise<{ url: string; expiresIn: number }>;
}
