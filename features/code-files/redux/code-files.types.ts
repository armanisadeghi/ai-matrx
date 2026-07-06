// features/code-files/redux/code-files.types.ts
//
// Types for the code-files Redux slice. Mirrors the notes architecture but is
// intentionally leaner: no per-file undo stacks, no multi-instance support,
// no realtime presence. Auto-save + dirty tracking + two-phase fetching only.
//
// DB shape comes from the code_files and code_file_folders tables created in
// Supabase migration. Generated DB types are not yet available, so we define
// the row shapes locally; any schema drift will surface at the thunk boundary
// where rows are cast to these interfaces.

// ── DB row shapes ───────────────────────────────────────────────────────────

/** Access driver — mirrors the `platform.visibility` enum. */
export type CodeVisibility = "private" | "internal" | "link" | "public";

export interface CodeFile {
  id: string;
  created_by: string | null;
  folder_id: string | null;
  repository_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
  task_id: string | null;
  name: string;
  path: string | null;
  language: string;
  /** File contents. Empty string when content is stored in S3. */
  content: string;
  content_hash: string | null;
  /** S3 object key (only set when content is stored in S3). */
  s3_key: string | null;
  /** S3 bucket name (only set when content is stored in S3). */
  s3_bucket: string | null;
  visibility: CodeVisibility;
  /** Soft-delete marker; NULL = live. */
  deleted_at: string | null;
  is_readonly: boolean;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CodeFolder {
  id: string;
  created_by: string | null;
  parent_folder_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
  name: string;
  description: string | null;
  icon_name: string | null;
  color: string | null;
  sort_order: number;
  visibility: CodeVisibility;
  /** Soft-delete marker; NULL = live. */
  deleted_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Fetch status ────────────────────────────────────────────────────────────

export type CodeFileFetchStatus = "list" | "full";

const FETCH_STATUS_RANK: Record<CodeFileFetchStatus, number> = {
  list: 1,
  full: 2,
};

export function shouldUpgradeCodeFileFetchStatus(
  current: CodeFileFetchStatus | null,
  incoming: CodeFileFetchStatus,
): boolean {
  if (!current) return true;
  return FETCH_STATUS_RANK[incoming] > FETCH_STATUS_RANK[current];
}

// ── Runtime record: CodeFile plus client-only tracking fields ───────────────

export interface CodeFileRecord extends CodeFile {
  /** "list" = metadata only, "full" = content loaded. */
  _fetchStatus: CodeFileFetchStatus | null;
  /** Has the local copy diverged from the server since last save? */
  _dirty: boolean;
  /** Save-in-flight flag. */
  _saving: boolean;
  /** Last save error, if any. */
  _error: string | null;
  /** True while content is being fetched from the server / S3. */
  _loading: boolean;
}

// ── Slice state ─────────────────────────────────────────────────────────────

export interface CodeFilesSliceState {
  files: Record<string, CodeFileRecord>;
  folders: Record<string, CodeFolder>;
  listStatus: "idle" | "loading" | "loaded" | "error";
  listError: string | null;
  foldersLoaded: boolean;
}

// ── Auto-save debounce config ───────────────────────────────────────────────
// Slower than notes — code files tend to be longer-lived edits.

export function getCodeAutoSaveDelay(contentLength: number): number {
  if (contentLength < 2_000) return 1_500;
  if (contentLength < 20_000) return 3_000;
  return 5_000;
}

/**
 * Threshold (bytes) at which content is offloaded to S3 instead of being
 * stored inline in the code_files.content column. Kept as a constant so the
 * thunk, service, and tests can agree without duplication.
 */
export const S3_OFFLOAD_THRESHOLD_BYTES = 50_000;

// ── Record helpers ──────────────────────────────────────────────────────────

export function createCodeFileRecord(
  row: CodeFile,
  status: CodeFileFetchStatus,
): CodeFileRecord {
  return {
    ...row,
    _fetchStatus: status,
    _dirty: false,
    _saving: false,
    _error: null,
    _loading: false,
  };
}

export function mergeServerCodeFile(
  existing: CodeFileRecord,
  incoming: Partial<CodeFile>,
  status: CodeFileFetchStatus,
): CodeFileRecord {
  // Never downgrade fetch status.
  const nextStatus = shouldUpgradeCodeFileFetchStatus(
    existing._fetchStatus,
    status,
  )
    ? status
    : existing._fetchStatus;

  // If user has uncommitted edits, don't clobber content / name / language.
  const merged: CodeFileRecord = {
    ...existing,
    ...incoming,
    _fetchStatus: nextStatus,
  };
  if (existing._dirty) {
    merged.content = existing.content;
    merged.name = existing.name;
    merged.language = existing.language;
  }
  return merged;
}
