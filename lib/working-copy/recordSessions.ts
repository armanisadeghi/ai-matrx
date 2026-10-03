/**
 * lib/working-copy/recordSessions.ts
 *
 * ONE IN-MEMORY SESSION PER RECORD PER TAB, NOT ONE PER MOUNT.
 *
 * THE LAW (owner, 2026-10-02): every screen survives hide/show/remount with no
 * lost work and no repeated side effects. A record's working state lives in a
 * store keyed by the record; every editor that shows it is a VIEW of that
 * state. This module is the keyed, ref-counted half of that: the first view of
 * a record opens its session, every later view attaches to the same one, and
 * the session outlives each view.
 *
 * Lifecycle of one session:
 *   - `acquire(id)` — the first holder creates it (`open`), every holder gets
 *     the SAME object. A holder that comes back while the session is still
 *     settling its last view's work (a remount, a board tile waking, React
 *     StrictMode's double effect) gets that same live session back — never a
 *     second one built from a stale server copy.
 *   - `release()` — idempotent per holder. When the LAST holder goes,
 *     `lastViewGone(session)` runs (the place to flush pending work). The entry
 *     is dropped only once that has settled AND `canDrop(session)` says nothing
 *     is pending; until then a new holder re-attaches to it.
 *   - `close(session)` runs exactly once, when the entry is dropped.
 *
 * Every side effect a session owns (a realtime channel, a collab room, a save
 * timer, a `pagehide` listener) therefore opens once per record and closes
 * once — never once per mount.
 *
 * Consumers: `./workingCopyStore.ts` (plain values — a note's body) and
 * `features/data-tables/document-model/` (a Univer document's body).
 */

export interface RecordSessionHooks<S> {
  /** Build the session for a record. Called once per session lifetime. */
  open: (id: string) => S;
  /** The last view went away — flush here. May be async (a save in flight). */
  lastViewGone?: (session: S, id: string) => void | Promise<void>;
  /** A holder arrived on a session with no views (first view, or a return). */
  firstViewArrived?: (session: S, id: string) => void;
  /** True when the session holds no unsettled work and may be dropped. */
  canDrop?: (session: S, id: string) => boolean;
  /** Tear the session down. Called once, when the entry is dropped. */
  close?: (session: S, id: string) => void;
}

export interface RecordSessionHandle<S> {
  readonly session: S;
  /** Detach this holder. Safe to call more than once. */
  release: () => void;
}

export interface RecordSessionRegistry<S> {
  acquire: (id: string) => RecordSessionHandle<S>;
  /** The live session for a record, if any holder or unsettled work keeps it. */
  peek: (id: string) => S | undefined;
  /** How many holders a record's session has right now. */
  holders: (id: string) => number;
  /**
   * Ask the registry to drop a holder-less session whose work has settled
   * (a session calls this when its pending save lands after the last view).
   */
  settle: (id: string) => void;
  /** Ids with a live session (diagnostics / tests). */
  ids: () => string[];
}

interface Entry<S> {
  session: S;
  holders: number;
  /** Bumped on every acquire, so a stale lastViewGone completion cannot drop a re-acquired session. */
  generation: number;
}

export function createRecordSessionRegistry<S>(
  hooks: RecordSessionHooks<S>,
): RecordSessionRegistry<S> {
  const entries = new Map<string, Entry<S>>();

  const tryDrop = (id: string, entry: Entry<S>) => {
    if (entries.get(id) !== entry) return;
    if (entry.holders > 0) return;
    if (hooks.canDrop && !hooks.canDrop(entry.session, id)) return;
    entries.delete(id);
    hooks.close?.(entry.session, id);
  };

  const release = (id: string, entry: Entry<S>) => {
    if (entries.get(id) !== entry) return;
    entry.holders -= 1;
    if (entry.holders > 0) return;
    const generation = entry.generation;
    let outcome: void | Promise<void>;
    try {
      outcome = hooks.lastViewGone?.(entry.session, id);
    } catch (error) {
      // NOTHING FAILS SILENTLY — a flush that threw keeps the session (its
      // work is still unsettled) and says so.
      console.error(`[record-session] flushing ${id} on its last view failed`, error);
      return;
    }
    const after = () => {
      if (entry.generation !== generation) return; // a view came back
      tryDrop(id, entry);
    };
    if (outcome && typeof (outcome as Promise<void>).then === "function") {
      (outcome as Promise<void>).then(after, (error: unknown) => {
        console.error(`[record-session] flushing ${id} on its last view failed`, error);
      });
    } else {
      after();
    }
  };

  return {
    acquire(id) {
      let entry = entries.get(id);
      if (!entry) {
        entry = { session: hooks.open(id), holders: 0, generation: 0 };
        entries.set(id, entry);
      }
      entry.generation += 1;
      entry.holders += 1;
      if (entry.holders === 1) hooks.firstViewArrived?.(entry.session, id);
      const held = entry;
      let released = false;
      return {
        session: held.session,
        release: () => {
          if (released) return;
          released = true;
          release(id, held);
        },
      };
    },
    peek(id) {
      return entries.get(id)?.session;
    },
    holders(id) {
      return entries.get(id)?.holders ?? 0;
    },
    settle(id) {
      const entry = entries.get(id);
      if (entry) tryDrop(id, entry);
    },
    ids() {
      return Array.from(entries.keys());
    },
  };
}
