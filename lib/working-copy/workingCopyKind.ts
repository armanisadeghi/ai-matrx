/**
 * lib/working-copy/workingCopyKind.ts — THE one working-copy primitive.
 *
 * `defineWorkingCopyKind({ entity, save, ... })` gives a record type (notes,
 * files, cloud documents…) exactly what THE LAW asks for, once:
 *
 *  - STATE OF RECORD IN REDUX. The working text, dirty, save status, versions
 *    and view count live in `workingCopies.byKey[`${entity}:${id}`]`
 *    (`./workingCopySlice.ts`). Every editor that shows the record is a VIEW of
 *    that entry — a board tile, the record's page, a side panel, a canvas tab.
 *  - ONE SESSION PER RECORD (`./recordSessions.ts`), ref-counted by its views.
 *    The last view leaving flushes; a view that comes back before that write
 *    lands (a remount, a board tile waking) re-attaches to the same session.
 *  - ONE SAVE PATH PER RECORD (`./coalescedCommit.ts`): debounced, never two
 *    writes at once, a save asked for mid-save runs once after it with what is
 *    then current, a failed save stays pending.
 *  - ENGINES BESIDE IT. A record whose body only a non-serializable editor
 *    engine can hold (a Univer document) registers that engine on its session
 *    (`createEngine`), keyed the same way; Redux carries its status and the
 *    engine is reached by key, never stored in the state.
 */

import { createCoalescedCommit, type CoalescedCommit, type CommitReason } from "./coalescedCommit";
import { createRecordSessionRegistry } from "./recordSessions";
import {
  getWorkingCopy,
  workingCopyDiscarded,
  workingCopyEdited,
  workingCopyKey,
  workingCopyReleased,
  workingCopyReset,
  workingCopySaved,
  workingCopySaveFailed,
  workingCopySaveStarted,
  workingCopySettled,
  workingCopySourceLoaded,
  workingCopyTouched,
  workingCopyViewAttached,
  workingCopyViewDetached,
  type WithWorkingCopies,
  type WorkingCopyEntry,
} from "./workingCopySlice";

/** The store a view renders from (`useAppStore()`); structural so this stays a leaf. */
export interface WorkingCopyStoreLike {
  dispatch: (action: { type: string; payload?: unknown }) => unknown;
  getState: () => unknown;
}

export interface WorkingCopySaveArgs<E> {
  id: string;
  key: string;
  /** The entry as it is when the save starts (text kinds: `entry.value` is what to write). */
  entry: WorkingCopyEntry;
  engine: E | undefined;
  reason: CommitReason;
  store: WorkingCopyStoreLike;
}

export interface WorkingCopySaveResult {
  /** Text kinds: what was written (defaults to the entry's value). */
  value?: string;
  version?: number | null;
  /** ms timestamp to show as "Saved"; null for a commit that is not a save the person sees. */
  savedAt?: number | null;
}

/** What an engine is handed to report into its record's working copy. */
export interface WorkingCopyHandle {
  readonly id: string;
  readonly key: string;
  /** An edit happened in the engine: mark dirty, schedule the save. */
  touch: () => void;
  flush: (reason?: CommitReason, force?: boolean) => Promise<void>;
  hasPending: () => boolean;
}

export interface WorkingCopyKindConfig<E> {
  entity: string;
  /** ms from the last edit to the save. */
  delay: (entry: WorkingCopyEntry | undefined) => number;
  /**
   * false: edits wait for an explicit save or for the last view leaving (a
   * save that creates a new stored version — a file — must not run every
   * few seconds). Default true.
   */
  autosave?: boolean;
  /** THE write for this record type. Throw to fail (the edit stays pending). */
  save: (args: WorkingCopySaveArgs<E>) => Promise<WorkingCopySaveResult | void> | WorkingCopySaveResult | void;
  /** The save failed (an auto flush may have no editor on screen to show it). */
  onSaveFailed?: (id: string, message: string, reason: CommitReason) => void;
  /** Build the engine for a record (once per session). */
  createEngine?: (handle: WorkingCopyHandle) => E;
  /** A view arrived on a session with none. */
  firstViewArrived?: (engine: E | undefined, handle: WorkingCopyHandle) => void;
  /** The last view left, before the flush (leave rooms, close channels). */
  lastViewGone?: (engine: E | undefined, handle: WorkingCopyHandle) => void;
  /** Extra work that must settle before the session may drop. */
  engineBusy?: (engine: E) => boolean;
  /** The session is dropped. */
  close?: (engine: E | undefined, handle: WorkingCopyHandle) => void;
  /** How long "Saved" shows before fading to idle (ms). Default 1500. */
  savedFadeMs?: number;
}

interface Session<E> {
  key: string;
  store: WorkingCopyStoreLike | null;
  commit: CoalescedCommit;
  engine: E | undefined;
  handle: WorkingCopyHandle;
  fadeTimer: ReturnType<typeof setTimeout> | null;
}

export interface WorkingCopyKind<E> {
  readonly entity: string;
  key: (id: string) => string;
  /** A view holds the record; returns its release (the last one flushes). */
  attach: (id: string, store: WorkingCopyStoreLike) => () => void;
  /** Text: every view shows `value` now; one save follows. `now` saves immediately. */
  edit: (id: string, value: string, options?: { now?: boolean }) => void;
  /** Engine kinds: an edit happened. */
  touch: (id: string) => void;
  /** The record's stored value arrived / moved; a dirty copy keeps the person's text. */
  load: (id: string, value: string, options?: { version?: number | null; draft?: string | null }) => void;
  /** The record already holds `value` (a resolved conflict): show it, drop pending. */
  reset: (id: string, value: string) => void;
  discard: (id: string) => void;
  /** Save now; resolves when every requested save has run. */
  flush: (id: string, reason?: CommitReason, force?: boolean) => Promise<void>;
  hasPending: (id: string) => boolean;
  /** The record's entry now (non-React read). */
  entry: (id: string) => WorkingCopyEntry | undefined;
  engine: (id: string) => E | undefined;
  /** Ids with a live session (diagnostics / tests). */
  openIds: () => string[];
}

export function defineWorkingCopyKind<E = never>(config: WorkingCopyKindConfig<E>): WorkingCopyKind<E> {
  const keyOf = (id: string) => workingCopyKey(config.entity, id);
  /** The store the last view attached with — for a write that arrives with no view (an agent, a flush). */
  let lastStore: WorkingCopyStoreLike | null = null;
  const storeOf = (session: Session<E>) => session.store ?? lastStore;
  const readEntry = (session: Session<E>) => {
    const store = storeOf(session);
    return store ? getWorkingCopy(store.getState() as WithWorkingCopies, session.key) : undefined;
  };
  const dispatch = (session: Session<E>, action: { type: string; payload?: unknown }) => {
    const store = storeOf(session);
    if (!store) {
      // NOTHING FAILS SILENTLY: an edit with no store to hold it would vanish.
      throw new Error(`No editor holds ${session.key} yet — the change was not applied.`);
    }
    store.dispatch(action);
  };

  const registry = createRecordSessionRegistry<Session<E>>({
    open: (id) => {
      const key = keyOf(id);
      const session = { key, store: null, engine: undefined, fadeTimer: null } as unknown as Session<E>;
      session.commit = createCoalescedCommit<WorkingCopyEntry | undefined>({
        delay: (entry) => config.delay(entry),
        read: () => readEntry(session),
        run: (entry, reason) => runSave(id, session, entry, reason),
        onError: (error) =>
          console.error(`[working-copy:${config.entity}] saving ${id} failed — the edit stays pending`, error),
      });
      session.handle = {
        id,
        key,
        touch: () => {
          dispatch(session, workingCopyTouched({ key }));
          pend(session);
        },
        flush: (reason = "flush", force = false) => session.commit.flush(reason, force),
        hasPending: () => session.commit.hasPending() || session.commit.isBusy(),
      };
      if (config.createEngine) session.engine = config.createEngine(session.handle);
      return session;
    },
    firstViewArrived: (session) => config.firstViewArrived?.(session.engine, session.handle),
    lastViewGone: (session) => {
      config.lastViewGone?.(session.engine, session.handle);
      return session.commit.flush("flush");
    },
    canDrop: (session) =>
      !session.commit.hasPending() &&
      !session.commit.isBusy() &&
      !(session.engine !== undefined && config.engineBusy?.(session.engine)),
    close: (session) => {
      session.commit.cancel();
      if (session.fadeTimer) clearTimeout(session.fadeTimer);
      config.close?.(session.engine, session.handle);
      // No view, nothing pending: the record's own store is the truth again.
      dispatch(session, workingCopyReleased({ key: session.key }));
    },
  });

  /**
   * The ONE write for a record. Synchronous when the kind's `save` is (a note's
   * commit is a Redux dispatch — it must land before an unmount returns).
   */
  function runSave(
    id: string,
    session: Session<E>,
    entry: WorkingCopyEntry | undefined,
    reason: CommitReason,
  ): void | Promise<void> {
    const store = storeOf(session);
    if (!store) throw new Error(`No store holds ${session.key}; its edit stays pending.`);
    const current = entry ?? getWorkingCopy(store.getState() as WithWorkingCopies, session.key);
    // Nothing unsaved: no write (an explicit Save still writes a snapshot).
    if (!current || (!current.dirty && reason !== "manual")) return;
    const key = session.key;
    store.dispatch(workingCopySaveStarted({ key }));
    const fail = (error: unknown): never => {
      const message = error instanceof Error ? error.message : String(error);
      store.dispatch(workingCopySaveFailed({ key, error: message }));
      config.onSaveFailed?.(id, message, reason);
      throw error;
    };
    const done = (result: WorkingCopySaveResult | void) => {
      const savedAt = result && result.savedAt !== undefined ? result.savedAt : Date.now();
      store.dispatch(
        workingCopySaved({
          key,
          value: result && result.value !== undefined ? result.value : current.value,
          version: result ? result.version : undefined,
          savedAt,
        }),
      );
      if (savedAt !== null) {
        if (session.fadeTimer) clearTimeout(session.fadeTimer);
        session.fadeTimer = setTimeout(() => {
          session.fadeTimer = null;
          store.dispatch(workingCopySettled({ key }));
        }, config.savedFadeMs ?? 1500);
      }
      // A save that landed after the last view left lets the session drop.
      queueMicrotask(() => registry.settle(id));
    };
    let outcome: Promise<WorkingCopySaveResult | void> | WorkingCopySaveResult | void;
    try {
      outcome = config.save({ id, key, entry: current, engine: session.engine, reason, store });
    } catch (error) {
      return fail(error);
    }
    if (outcome && typeof (outcome as Promise<unknown>).then === "function") {
      return (outcome as Promise<WorkingCopySaveResult | void>).then(done, fail);
    }
    done(outcome as WorkingCopySaveResult | void);
  }

  const pend = (session: Session<E>) => {
    if (config.autosave === false) session.commit.mark();
    else session.commit.schedule();
  };

  /** Run against a record's session, holding it for the duration when no view does. */
  const withSession = <R>(id: string, fn: (session: Session<E>) => R): R => {
    const live = registry.peek(id);
    if (live && registry.holders(id) > 0) return fn(live);
    const held = registry.acquire(id);
    try {
      return fn(held.session);
    } finally {
      held.release();
    }
  };

  return {
    entity: config.entity,
    key: keyOf,
    attach(id, store) {
      const held = registry.acquire(id);
      held.session.store = store;
      lastStore = store;
      store.dispatch(workingCopyViewAttached({ key: held.session.key }));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        store.dispatch(workingCopyViewDetached({ key: held.session.key }));
        held.release();
      };
    },
    edit(id, value, options) {
      withSession(id, (session) => {
        dispatch(session, workingCopyEdited({ key: session.key, value }));
        if (options?.now) void session.commit.flush("flush", true);
        else pend(session);
      });
    },
    touch(id) {
      const session = registry.peek(id);
      session?.handle.touch();
    },
    load(id, value, options) {
      const session = registry.peek(id);
      if (!session) return;
      dispatch(
        session,
        workingCopySourceLoaded({ key: session.key, value, version: options?.version, draft: options?.draft }),
      );
      // A restored draft (or text the new source does not hold) is unsaved work.
      if (readEntry(session)?.dirty && !session.commit.hasPending()) pend(session);
    },
    reset(id, value) {
      const session = registry.peek(id);
      if (!session) return;
      session.commit.cancel();
      dispatch(session, workingCopyReset({ key: session.key, value }));
    },
    discard(id) {
      const session = registry.peek(id);
      if (!session) return;
      session.commit.cancel();
      dispatch(session, workingCopyDiscarded({ key: session.key }));
    },
    flush(id, reason = "flush", force = false) {
      const session = registry.peek(id);
      return session ? session.commit.flush(reason, force) : Promise.resolve();
    },
    hasPending(id) {
      const session = registry.peek(id);
      return session ? session.handle.hasPending() : false;
    },
    entry(id) {
      const session = registry.peek(id);
      return session ? readEntry(session) : undefined;
    },
    engine: (id) => registry.peek(id)?.engine,
    openIds: () => registry.ids(),
  };
}
