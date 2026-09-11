/**
 * copy-subset sessions — the module-scope registry that keeps rows, column
 * definitions, and callbacks OUT of Redux.
 *
 * Functions cannot travel through `openOverlay` data (the overlaySlice guard
 * strips them and screams), and a row array does not belong in global state.
 * `callbackManager` groups carry EVENTS, not a data snapshot, so this is a
 * sibling channel with the same shape: the opener registers the caller's
 * source here under a session id, only the id string travels through Redux,
 * and the overlay reads the session by id (compare
 * `rich-document/runtime/providerBridge.ts`).
 *
 * THE COPY LAW: `rows` is a fresh array taken when the rows are known (at
 * registration for an array source, after `loadCopySubsetSessionRows` for a
 * loader source). The overlay only reads it — filter/sort/select produce new
 * arrays — and the origin's array and query state are never referenced
 * again. Row OBJECTS are shared (shallow copy): nothing here mutates one.
 */

import { resolveCopySubsetColumns } from "@/components/agent-copy/copy-subset/serialize";
import type {
  CopySubsetColumn,
  CopySubsetSource,
} from "@/components/agent-copy/copy-subset/types";

export interface CopySubsetSession<T = unknown> {
  id: string;
  source: CopySubsetSource<T>;
  /** Snapshot: a fresh array of the caller's rows. Empty until a loader resolves. */
  rows: T[];
  /** True while a loader source has not resolved yet. */
  pending: boolean;
  columns: CopySubsetColumn<T>[];
  /** Row identity, defaulting to the row's index in the snapshot. */
  getRowId: (row: T) => string;
  createdAt: number;
}

const sessions = new Map<string, CopySubsetSession>();

let counter = 0;

function nextSessionId(): string {
  counter += 1;
  return `copy-subset-${Date.now().toString(36)}-${counter}`;
}

function snapshotRows<T>(session: CopySubsetSession<T>, rows: T[]): void {
  const copy = [...rows];
  const byIndex = new Map<T, number>();
  copy.forEach((row, index) => {
    if (!byIndex.has(row)) byIndex.set(row, index);
  });
  session.rows = copy;
  session.pending = false;
  session.columns = resolveCopySubsetColumns(session.source.columns, copy);
  session.getRowId =
    session.source.getRowId ??
    ((row: T) => {
      const index = byIndex.get(row);
      return index === undefined ? "unknown" : `row-${index}`;
    });
}

export function registerCopySubsetSession<T>(
  source: CopySubsetSource<T>,
): CopySubsetSession<T> {
  const session: CopySubsetSession<T> = {
    id: nextSessionId(),
    source,
    rows: [],
    pending: typeof source.rows === "function",
    columns: source.columns ?? [],
    getRowId: source.getRowId ?? (() => "unknown"),
    createdAt: Date.now(),
  };
  if (Array.isArray(source.rows)) snapshotRows(session, source.rows);
  sessions.set(session.id, session as CopySubsetSession);
  return session;
}

/**
 * Resolve a loader source. Safe to call again after a failure (Retry). The
 * returned session is the same object, now holding the snapshot.
 */
export async function loadCopySubsetSessionRows<T>(
  session: CopySubsetSession<T>,
): Promise<CopySubsetSession<T>> {
  const { rows } = session.source;
  if (typeof rows !== "function") return session;
  session.pending = true;
  const loaded = await rows();
  snapshotRows(session, loaded);
  return session;
}

export function getCopySubsetSession<T = unknown>(
  id: string,
): CopySubsetSession<T> | null {
  return (sessions.get(id) as CopySubsetSession<T> | undefined) ?? null;
}

export function releaseCopySubsetSession(id: string): void {
  sessions.delete(id);
}

/** Test/diagnostic hook: how many sessions are alive right now. */
export function copySubsetSessionCount(): number {
  return sessions.size;
}
