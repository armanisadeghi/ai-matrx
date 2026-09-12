/**
 * Public type definitions for the code workspace feature.
 *
 * Everything a consumer of `features/code` needs is re-exported here.
 */

// ─── Filesystem ──────────────────────────────────────────────────────────────

export type FilesystemNodeKind = "file" | "directory";

export interface FilesystemNode {
  /** Absolute POSIX path, e.g. "/home/agent/src/index.ts" */
  path: string;
  /** Display name (basename). */
  name: string;
  kind: FilesystemNodeKind;
  /** Bytes — undefined for directories. */
  size?: number;
  /** ISO date string, if known. */
  modifiedAt?: string;
  /** If the adapter already knows this directory has no children. */
  empty?: boolean;
}

export interface FilesystemWatchEvent {
  type: "created" | "modified" | "deleted" | "moved";
  path: string;
  /** Present for "moved" events — the original path before the rename. */
  fromPath?: string;
}

export interface FilesystemStat {
  path: string;
  kind: FilesystemNodeKind | "symlink";
  size: number;
  /** Unix mode bits (e.g. 0o644). */
  mode?: number;
  /** ISO date string. */
  modifiedAt?: string;
  /** sha1 of contents — when the adapter cheaply provides it. */
  hash?: string;
  /** Symlink target, if `kind === "symlink"`. */
  target?: string;
}

export interface FilesystemSearchHit {
  path: string;
  /** 1-based line number of the match. */
  line: number;
  column?: number;
  /** The matched line contents (trimmed). */
  text: string;
}

// ─── Editor files / tabs ─────────────────────────────────────────────────────

/**
 * Tab kind. Defaults to `"editor"` when absent (legacy tabs are always
 * Monaco-backed).
 *
 *  - `"editor"`            → standard Monaco-backed text editor.
 *  - `"binary-preview"`    → renders through `BinaryFileViewer`. Bytes
 *    are fetched lazily from the active filesystem adapter via
 *    `filesystem.download(path)` — never put into Redux, never shipped
 *    to the agent context bridge.
 *  - `"cloud-file-preview"` → renders the canonical cloud-files
 *    `<FilePreview fileId={cloudFileId}>` (image / video / audio / pdf
 *    / markdown / code / data). Bytes flow through the cloud-files
 *    signed-URL + blob-cache pipeline; nothing goes through the active
 *    code-workspace filesystem adapter. The tab's `path` is a synthetic
 *    `cloud-file:/<name>` display string and the file is identified
 *    by `cloudFileId`.
 *  - `"history-triple"`    → renders `<TripleDiffView>` showing
 *    Before / With updates / Modifications-Since for one (message,
 *    file) snapshot. Read-only; no save pipeline, no selection-as-
 *    context. Identified by `historyMessageFileId`.
 *  - `"render-preview"`    → renders the live output of another open
 *    editor tab through a previewer registered in
 *    `features/code/preview/renderPreviewRegistry.ts`. The source tab
 *    is identified by `renderSourceTabId`; the previewer is selected
 *    by the source tab's library-source adapter prefix
 *    (e.g. `aga-app:` → `AgentAppRenderPreview`). Read-only; no buffer,
 *    no save pipeline. Closes automatically when its source tab closes.
 *
 * AI patch review is NOT a tab kind — when a normal `"editor"` tab has
 * pending AI patches, `EditorArea` swaps in `<TabDiffView>` (Cursor-style
 * inline diff) automatically. The tab itself stays a normal editor tab.
 */
export type EditorTabKind =
  | "editor"
  | "binary-preview"
  | "cloud-file-preview"
  | "history-triple"
  | "render-preview";

/**
 * Tabs that don't have an editable text buffer (no Monaco, no AI patches,
 * no save pipeline, no selection-as-context). Centralising the check
 * keeps every consumer in sync when a new preview kind is added.
 */
export function isPreviewTab(kind?: EditorTabKind): boolean {
  return (
    kind === "binary-preview" ||
    kind === "cloud-file-preview" ||
    kind === "history-triple" ||
    kind === "render-preview"
  );
}

export interface EditorFile {
  /** Stable id. Typically the absolute path prefixed with adapter id. */
  id: string;
  /** Absolute path on the adapter. */
  path: string;
  /** Basename shown on the tab. */
  name: string;
  /** Monaco language id, e.g. "typescript", "json", "plaintext". */
  language: string;
  /** Current buffer contents in memory. */
  content: string;
  /** Last-loaded content from disk — used to compute the dirty flag. */
  pristineContent: string;
  /** True iff `content !== pristineContent`. Computed by the slice. */
  dirty?: boolean;
  /**
   * A virtual inspection tab that must never accept edits or route through
   * the normal save pipeline. Git diff tabs set this explicitly; their
   * historic id prefixes remain guarded by `isReadOnlyEditorTab` as well.
   */
  readOnly?: boolean;
  /**
   * What renders this tab. Omit (or set `"editor"`) for the standard
   * Monaco-backed text editor. `"binary-preview"` swaps Monaco for the
   * `BinaryFileViewer` so we don't try to feed image / video / pdf bytes
   * into a code editor.
   */
  kind?: EditorTabKind;
  /**
   * Resolved MIME type for the file. Populated on preview tabs
   * (`"binary-preview"` / `"cloud-file-preview"`) — the previewer
   * primitives use it to pick the right player (image / video / audio
   * / pdf / generic).
   */
  mime?: string;
  /**
   * cld_files UUID. Set only on `"cloud-file-preview"` tabs and is the
   * sole identifier the previewer needs — `path` is just for the tab
   * label / breadcrumbs and never hits a filesystem adapter.
   */
  cloudFileId?: string;
  /**
   * Remote `updated_at` captured at load time for source-backed tabs
   * (prompt apps, agent apps, tool UIs). Used by the optimistic
   * concurrency check inside `useSaveActiveTab`, and refreshed live
   * via `useTabRealtimeWatcher` so the conflict path can degrade to a
   * soft warning when the remote row moves under the user's feet.
   */
  remoteUpdatedAt?: string;
  /**
   * Wall-clock timestamp of the last successful save (ISO string). Set
   * by `markTabSaved`. Used by the editor toolbar to surface a "Saved
   * 12s ago"-style indicator. Undefined until the tab has been saved
   * at least once during this session.
   */
  lastSavedAt?: string;
  /**
   * For `"history-triple"` tabs only — the message id whose snapshot
   * this tab is inspecting. Combined with `historyFileIdentityKey`
   * (the canonical `${adapter}:${path}` of the underlying file)
   * gives `<TripleDiffView>` everything it needs to look up the
   * snapshot in `codeEditHistorySlice`.
   */
  historyMessageId?: string;
  /** For `"history-triple"` tabs only — `${adapter}:${path}`. */
  historyFileIdentityKey?: string;
  /**
   * For `"render-preview"` tabs only — the id of the source editor tab
   * whose live buffer this preview renders. When the source tab closes
   * the preview tab is closed automatically. The previewer is resolved
   * by passing the source tab id to the render-preview registry.
   */
  renderSourceTabId?: string;
  /**
   * Source of the most recent buffer mutation. Set by `updateTabContent`
   * with sensible defaults. The keyboard undo binding watches this so
   * `Cmd/Ctrl+Z` only triggers `undoLastEditThunk` when an AI accept
   * was the last thing to touch the buffer; user-typing undo continues
   * to belong to Monaco.
   */
  lastMutationSource?: "user" | "ai" | "ai-undo";
}

// ─── Process / terminal ──────────────────────────────────────────────────────

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** The cwd the process ended in (adapters that track cwd). */
  cwd?: string;
}

export interface ProcessEvent {
  type: "stdout" | "stderr" | "info" | "exit";
  text: string;
  exitCode?: number;
  cwd?: string;
}

// ─── Activity bar / bottom panel IDs ────────────────────────────────────────

export type ActivityViewId =
  | "explorer"
  | "search"
  | "git"
  | "source-control"
  | "run"
  | "extensions"
  | "sandboxes"
  | "library";

export type BottomTabId =
  | "problems"
  | "output"
  | "debug"
  | "terminal"
  | "ports"
  | "sandbox-status"
  | "sandbox-files"
  | "sandbox-env"
  | "sandbox-ssh";
