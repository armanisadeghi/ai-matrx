/**
 * Text Diff Feature Types
 */

import { TextDiff } from "./lib/parseDiff";

// ============================================================================
// Diff State Types
// ============================================================================

export interface DiffState {
  sourceId: string | null; // ID of source (e.g., note ID)
  sourceType: "note" | "custom"; // Type of source
  originalText: string;
  currentText: string;
  pendingDiffs: PendingDiff[];
  acceptedDiffs: AcceptedDiff[];
  rejectedDiffs: RejectedDiff[];
  isDirty: boolean;
  lastSaved: string | null; // ISO timestamp
  isProcessing: boolean;
  error: string | null;
}

export interface PendingDiff {
  id: string;
  diff: TextDiff;
  preview: {
    before: string;
    after: string;
    lineRange?: { start: number; end: number };
  };
  status: "pending";
  createdAt: string; // ISO timestamp
}

export interface AcceptedDiff {
  id: string;
  diff: TextDiff;
  acceptedAt: string; // ISO timestamp
  appliedText: string; // Text after this diff was applied
}

export interface RejectedDiff {
  id: string;
  diff: TextDiff;
  rejectedAt: string; // ISO timestamp
  reason?: string;
}

// ============================================================================
// Version History Types
// ============================================================================

/**
 * A note version row, as returned by the `get_note_versions` / `get_note_version`
 * RPCs (backed by the central `history.row_versions` table). Typed locally
 * because the legacy note_versions table was retired (now in history.row_versions).
 *
 * NOTE: `id` is a numeric string (the history row id), not a uuid.
 */
export interface NoteVersion {
  id: string;
  note_id: string;
  version_number: number;
  content: string;
  label: string;
  change_source: string;
  change_type: string | null;
  diff_metadata: Record<string, any>;
  created_at: string;
}

export interface VersionHistoryState {
  versions: Record<string, NoteVersion[]>; // Keyed by note_id
  loading: Record<string, boolean>; // Keyed by note_id
  error: Record<string, string | null>; // Keyed by note_id
}

// ============================================================================
// Service Types
// ============================================================================

export interface CreateVersionOptions {
  note_id: string;
  change_source?: "user" | "ai" | "system";
  change_type?: string;
  diff_metadata?: Record<string, any>;
}

export interface RestoreVersionOptions {
  note_id: string;
  version_number: number;
}

// Note: Component props are exported from their respective component files
// and available through the main index.ts barrel export
