/**
 * lib/records/types.ts
 *
 * Shared types for the durable-records system — the canonical persistence
 * contract documented in
 * `docs/concepts/full-sync-boardcast-storage/durable-records-contract.md`.
 *
 * The model in one line — every feature record is `T & RecordTracking`, edited
 * live in the ONE canonical Redux slice; `_dirty` means "differs from server";
 * recovery re-pulls from the server (single source of truth).
 */

import type { FieldFlags } from "./fieldFlags";

/**
 * One undo step. Stores the PREVIOUS value of a single field so undo restores
 * it. `byteEstimate` powers the byte-bounded stack cap.
 */
export interface UndoEntry {
  field: string;
  value: unknown;
  timestamp: number;
  byteEstimate: number;
}

/**
 * Per-field baseline = the last-saved value, captured once per clean cycle.
 * It is the "before" anchor for dirty reconciliation AND for the diff / the
 * unsaved-changes modal. It is tracking metadata on the record — NOT a second
 * copy of the record.
 */
export type FieldHistory = Record<string, unknown>;

/**
 * Runtime tracking fields stamped onto every durable record. All fields are
 * JSON-serializable (FieldFlags object, not Set) so the record survives the
 * sync engine's persistence/broadcast layers and DevTools time-travel.
 */
export interface RecordTracking {
  /** Derived: `fieldFlagsSize(_dirtyFields) > 0`. Never set independently. */
  _dirty: boolean;
  /** Which fields differ from the server baseline. */
  _dirtyFields: FieldFlags;
  /** Last-saved value per dirty field (the diff "before" side). */
  _fieldHistory: FieldHistory;
  /** A write is in flight. */
  _saving: boolean;
  /** Last save error message, or null. */
  _error: string | null;
  /** A (re)fetch is in flight. Optional — not every slice tracks it. */
  _loading?: boolean;
  /** Undo stack (most recent last). */
  _undoPast: UndoEntry[];
  /** Redo stack. */
  _undoFuture: UndoEntry[];
}

/** A record of type `T` with the durable tracking fields attached. */
export type TrackedRecord<T> = T & RecordTracking;

/**
 * Derived save state for a single record — what `<SaveStatus>` renders.
 *   - `clean`   — matches server, nothing pending
 *   - `dirty`   — has unsaved local edits
 *   - `saving`  — write in flight
 *   - `error`   — last save failed (still dirty; will retry on next edit/save)
 */
export type SaveState = "clean" | "dirty" | "saving" | "error";

/**
 * The spectrum knob. See contract §2.
 *   - `auto`   — debounced write while editing (notes / never-lose)
 *   - `hybrid` — no write while editing; explicit Save; optional leave-flush
 *   - `manual` — explicit Save only (agent builder)
 */
export type CommitMode = "auto" | "hybrid" | "manual";

/** Content-adaptive debounce, or a constant. Mirrors the notes tiers. */
export type DebounceMs =
  | number
  | ((record: unknown, recordId: string) => number);

/**
 * A single, JSON-describable change for the unsaved-changes modal (D-D) and
 * the lightweight diff summary. `before` is the server baseline
 * (`_fieldHistory[field]`); `after` is the current value.
 */
export interface RecordFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** Options for `applyFieldEdit`. */
export interface ApplyFieldEditOptions {
  /** Deep-equality used for baseline reconciliation. Default: structural. */
  isEqual?: (a: unknown, b: unknown) => boolean;
  /** Window in which repeated edits to one field coalesce into one undo entry. */
  coalesceMs?: number;
  /** Max total bytes retained across the undo stack before compression. */
  maxUndoBytes?: number;
  /** Max number of undo entries before compression. */
  maxUndoEntries?: number;
}
