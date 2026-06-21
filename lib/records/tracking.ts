/**
 * lib/records/tracking.ts
 *
 * The dirty-tracking core of the durable-records system — pure, Immer-safe
 * mutators that operate IN PLACE on a `TrackedRecord<T>` draft inside any
 * existing slice reducer. Standardized on the agent-builder model
 * (`features/agents/redux/agent-definition/slice.ts#applyFieldEdit`): baseline
 * captured once per clean cycle, deep-equality reconciliation so editing a
 * field back to its saved value auto-cleans it, serializable `FieldFlags`,
 * undo/redo with coalescing + byte-bounded compression.
 *
 * These are helpers, NOT a slice factory: a feature adds durability by calling
 * them from its OWN reducers on its OWN single canonical slice (contract D-A —
 * one state, edited live). No second/draft store is ever created.
 */

import isEqualDeep from "lodash/isEqual";
import {
  addField,
  createFieldFlags,
  fieldFlagsKeys,
  fieldFlagsSize,
  hasField,
  removeField,
} from "./fieldFlags";
import type {
  ApplyFieldEditOptions,
  RecordFieldChange,
  RecordTracking,
  SaveState,
  TrackedRecord,
  UndoEntry,
} from "./types";

const DEFAULT_COALESCE_MS = 600;
const DEFAULT_MAX_UNDO_ENTRIES = 50;
const DEFAULT_MAX_UNDO_BYTES = 2 * 1024 * 1024; // 2 MB

/** Stamp fresh tracking fields onto a server row to make it a clean record. */
export function createRecordTracking(): RecordTracking {
  return {
    _dirty: false,
    _dirtyFields: createFieldFlags(),
    _fieldHistory: {},
    _saving: false,
    _error: null,
    _loading: false,
    _undoPast: [],
    _undoFuture: [],
  };
}

/** Cheap byte estimate for undo-stack budgeting. Never throws. */
function estimateBytes(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Three-phase compression: protect the head (oldest, the true baseline) and the
 * recent tail, thin the middle. Keeps undo useful while bounding memory.
 */
function compressStack(
  stack: UndoEntry[],
  maxEntries: number,
  maxBytes: number,
): UndoEntry[] {
  let total = stack.reduce((sum, e) => sum + e.byteEstimate, 0);
  if (stack.length <= maxEntries && total <= maxBytes) return stack;

  const next = [...stack];
  // Drop from the middle (keep first entry + the most recent ~half).
  const keepTail = Math.max(1, Math.floor(maxEntries / 2));
  while (
    next.length > maxEntries ||
    (total > maxBytes && next.length > keepTail + 1)
  ) {
    // index 0 is the protected baseline; remove the oldest middle entry.
    const removeAt = 1;
    if (next.length <= keepTail + 1) break;
    total -= next[removeAt]?.byteEstimate ?? 0;
    next.splice(removeAt, 1);
  }
  return next;
}

/** Push an undo entry, coalescing rapid edits to the same field. */
function pushUndoEntry(
  record: TrackedRecord<unknown>,
  field: string,
  previousValue: unknown,
  coalesceMs: number,
  maxEntries: number,
  maxBytes: number,
): void {
  const now = Date.now();
  const top = record._undoPast[record._undoPast.length - 1];

  if (top && top.field === field && now - top.timestamp < coalesceMs) {
    top.timestamp = now; // keep the older value; just refresh the window
  } else {
    record._undoPast.push({
      field,
      value: previousValue,
      timestamp: now,
      byteEstimate: estimateBytes(previousValue),
    });
  }
  record._undoFuture = [];
  record._undoPast = compressStack(record._undoPast, maxEntries, maxBytes);
}

/**
 * Apply a user edit with dirty tracking, baseline capture, and undo.
 * Captures the baseline ONCE per field per clean cycle; reconciles via deep
 * equality so edit-back-to-original removes the dirty flag (no false positives).
 */
export function applyFieldEdit<T, K extends keyof T & string>(
  record: TrackedRecord<T>,
  field: K,
  value: T[K],
  opts: ApplyFieldEditOptions = {},
): void {
  const isEqual = opts.isEqual ?? isEqualDeep;
  const previousValue = record[field];
  const wasDirty = hasField(record._dirtyFields, field);

  if (!wasDirty) {
    record._fieldHistory[field] = previousValue;
  }

  pushUndoEntry(
    record as TrackedRecord<unknown>,
    field,
    previousValue,
    opts.coalesceMs ?? DEFAULT_COALESCE_MS,
    opts.maxUndoEntries ?? DEFAULT_MAX_UNDO_ENTRIES,
    opts.maxUndoBytes ?? DEFAULT_MAX_UNDO_BYTES,
  );

  record[field] = value;

  const baseline = record._fieldHistory[field];
  if (wasDirty && isEqual(value, baseline)) {
    removeField(record._dirtyFields, field);
    delete record._fieldHistory[field];
  } else {
    addField(record._dirtyFields, field);
  }
  record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
}

/** Flip the in-flight write flag. */
export function markSaving<T>(record: TrackedRecord<T>, saving: boolean): void {
  record._saving = saving;
}

/** Record a save failure; stays dirty so the next edit/save retries. */
export function markSaveError<T>(
  record: TrackedRecord<T>,
  error: string | null,
): void {
  record._error = error;
  record._saving = false;
}

/**
 * Mark a record clean after a successful save. Clears dirty state, baseline,
 * and undo stacks — the current draft becomes the new clean baseline. Optional
 * `serverPatch` writes back server-canonical fields (e.g. `version`,
 * `updated_at`) without re-dirtying.
 */
export function markRecordClean<T>(
  record: TrackedRecord<T>,
  serverPatch?: Partial<T>,
): void {
  if (serverPatch) Object.assign(record, serverPatch);
  record._dirty = false;
  record._dirtyFields = createFieldFlags();
  record._fieldHistory = {};
  record._error = null;
  record._saving = false;
  record._undoPast = [];
  record._undoFuture = [];
}

/**
 * Revert local edits in place by restoring each dirty field to its server
 * baseline, then clearing tracking. Use when the caller cannot re-fetch (the
 * canonical recovery is a server re-pull; this is the offline-safe equivalent).
 */
export function revertTracking<T>(record: TrackedRecord<T>): void {
  for (const field of fieldFlagsKeys(record._dirtyFields)) {
    if (field in record._fieldHistory) {
      (record as Record<string, unknown>)[field] = record._fieldHistory[field];
    }
  }
  record._dirty = false;
  record._dirtyFields = createFieldFlags();
  record._fieldHistory = {};
  record._error = null;
  record._undoPast = [];
  record._undoFuture = [];
}

/** Undo the last edit. No-op if the stack is empty. */
export function undoEdit<T>(record: TrackedRecord<T>): void {
  const entry = record._undoPast.pop();
  if (!entry) return;
  const current = (record as Record<string, unknown>)[entry.field];
  record._undoFuture.push({
    field: entry.field,
    value: current,
    timestamp: Date.now(),
    byteEstimate: estimateBytes(current),
  });
  (record as Record<string, unknown>)[entry.field] = entry.value;
  reconcileField(record, entry.field);
}

/** Redo the last undone edit. No-op if the redo stack is empty. */
export function redoEdit<T>(record: TrackedRecord<T>): void {
  const entry = record._undoFuture.pop();
  if (!entry) return;
  const current = (record as Record<string, unknown>)[entry.field];
  record._undoPast.push({
    field: entry.field,
    value: current,
    timestamp: Date.now(),
    byteEstimate: estimateBytes(current),
  });
  (record as Record<string, unknown>)[entry.field] = entry.value;
  reconcileField(record, entry.field);
}

/** Re-derive a single field's dirty flag against its baseline (post undo/redo). */
function reconcileField<T>(record: TrackedRecord<T>, field: string): void {
  const r = record as Record<string, unknown>;
  if (field in record._fieldHistory) {
    if (isEqualDeep(r[field], record._fieldHistory[field])) {
      removeField(record._dirtyFields, field);
      delete record._fieldHistory[field];
    } else {
      addField(record._dirtyFields, field);
    }
  }
  record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
}

// ── Read helpers (pure; safe to call from selectors) ─────────────────────────

/** Derive the `<SaveStatus>` state for a record. */
export function getSaveState(record: RecordTracking | undefined): SaveState {
  if (!record) return "clean";
  if (record._saving) return "saving";
  if (record._error) return "error";
  if (record._dirty) return "dirty";
  return "clean";
}

/**
 * The exact unsaved changes for the mandatory leave-modal (D-D) and the diff
 * summary: one entry per dirty field with its server `before` and current
 * `after`. Drives "what you'll lose" and "what changed" from one computation.
 */
export function getRecordChanges<T>(
  record: TrackedRecord<T> | undefined,
): RecordFieldChange[] {
  if (!record || !record._dirty) return [];
  const r = record as Record<string, unknown>;
  return fieldFlagsKeys(record._dirtyFields).map((field) => ({
    field,
    before: record._fieldHistory[field],
    after: r[field],
  }));
}

/** Only the dirty fields, as a partial — the minimal write payload. */
export function getDirtyPatch<T>(
  record: TrackedRecord<T> | undefined,
): Partial<T> {
  if (!record || !record._dirty) return {};
  const r = record as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of fieldFlagsKeys(record._dirtyFields))
    patch[field] = r[field];
  return patch as Partial<T>;
}
