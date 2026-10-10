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
 *  - A FAILED SAVE IS RETRIED HERE, for every kind (backoff 1s → 30s, and at
 *    once on reconnect or the tab coming back), whether or not a view is
 *    still open. A PERMANENT failure (permission, conflict) stops retrying and
 *    waits for the person (`retry` / `discard`). The record's session is held
 *    until the edit is saved or the person resolved it — never dropped with
 *    the edit unwritten.
 *  - NO SILENT LOST UPDATE. The base an edit started from is kept; when the
 *    stored state moves under unsaved work (a load, `source` read right before
 *    a save, an engine's `handle.conflict`), the entry holds a CONFLICT and
 *    nothing is written until the person chooses keep mine / take theirs /
 *    merge (`resolveConflict`; `./WorkingCopyAlert.tsx` is the choice on screen,
 *    `onConflict` the kind's announcement when no view may be open).
 *  - ENGINES BESIDE IT. A record whose body only a non-serializable editor
 *    engine can hold (a Univer document) registers that engine on its session
 *    (`createEngine`), keyed the same way; Redux carries its status and the
 *    engine is reached by key, never stored in the state.
 */

import { createCoalescedCommit, type CoalescedCommit, type CommitReason } from "./coalescedCommit";
import { createRecordSessionRegistry } from "./recordSessions";
import {
  getWorkingCopy,
  workingCopyConflicted,
  workingCopyConflictResolved,
  workingCopyDiscarded,
  workingCopyEdited,
  workingCopyKey,
  workingCopyRecordLoaded,
  workingCopyReleased,
  workingCopyReset,
  workingCopySaved,
  workingCopySaveConflicted,
  workingCopySaveFailed,
  workingCopySaveStarted,
  workingCopySettled,
  workingCopySourceLoaded,
  workingCopyTouched,
  workingCopyViewAttached,
  workingCopyViewDetached,
  type WithWorkingCopies,
  type WorkingCopyConflict,
  type WorkingCopyEntry,
} from "./workingCopySlice";

export type ConflictChoice = "mine" | "theirs" | "merge";

/** How a failed save is reported to the kind. */
export interface WorkingCopyFailureInfo {
  /** Permission / conflict: retrying will not help; the person decides. */
  permanent: boolean;
  /** Failed attempts in a row (1 = the first failure of this streak). */
  attempts: number;
}

/**
 * Thrown by a kind's `save` when the stored state moved under the edit (its
 * compare-and-swap refused the write). Not a failure: the entry opens the
 * conflict and nothing is written until the person chooses.
 */
export class WorkingCopySaveConflict extends Error {
  /** The stored text now (text records). */
  readonly theirs?: string;
  readonly version: number | null;
  /** Engine records: an opaque id of the stored state. */
  readonly ref: string | null;
  constructor(moved: { theirs?: string; version?: number | null; ref?: string | null }) {
    super("The stored record changed under this edit.");
    this.name = "WorkingCopySaveConflict";
    this.theirs = moved.theirs;
    this.version = moved.version ?? null;
    this.ref = moved.ref ?? null;
  }
}

/** Backoff for retrying a failed save (ms). */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** Attempts allowed at the cap before retries park (~5 min); reconnect, the tab returning, an edit or `retry` re-arm them. */
const RETRY_PASSES_AT_CAP = 10;

/**
 * A failure retrying will not fix: no permission, or the stored record moved
 * (a version/compare-and-swap conflict). Network, timeouts, 5xx and a lapsed
 * session (401, refreshed by the client) are transient.
 */
export function isPermanentSaveFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown; message?: unknown };
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : null;
  if (status !== null && [403, 404, 409, 412, 422].includes(status)) return true;
  if (e.code === "42501" || e.code === "PGRST116") return true;
  const text = `${typeof e.name === "string" ? e.name : ""} ${typeof e.message === "string" ? e.message : ""}`;
  return /permission|not allowed|forbidden|row[- ]level security|access denied|conflict|version mismatch/i.test(text);
}

/** Sessions with a failed save waiting to retry — woken at once by `online` / the tab returning. */
const retryWakers = new Set<() => void>();
let wakeListening = false;
function listenForWake(): void {
  if (wakeListening || typeof window === "undefined") return;
  wakeListening = true;
  const wake = () => {
    for (const fn of Array.from(retryWakers)) fn();
  };
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
  });
}

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
  /**
   * The stored state moved under this record's unsaved work (a collaborator's
   * snapshot). Nothing is written until the person chooses. No unsaved work:
   * not a conflict — the engine shows the new state itself.
   */
  conflict: (moved: { version?: number | null; ref?: string | null }) => void;
  flush: (reason?: CommitReason, force?: boolean) => Promise<void>;
  hasPending: () => boolean;
}

export interface WorkingCopyKindConfig<E> {
  entity: string;
  /** ms from the last edit to the save. */
  delay: (entry: WorkingCopyEntry | undefined) => number;
  /** Longest an unbroken run of edits waits before saving anyway (ms). Default: no cap. */
  maxWait?: number;
  /**
   * false: edits wait for an explicit save or for the last view leaving (a
   * save that creates a new stored version — a file — must not run every
   * few seconds). Default true.
   */
  autosave?: boolean;
  /** THE write for this record type. Throw to fail (the edit stays pending). */
  save: (args: WorkingCopySaveArgs<E>) => Promise<WorkingCopySaveResult | void> | WorkingCopySaveResult | void;
  /** The save failed (an auto flush may have no editor on screen to show it). */
  onSaveFailed?: (id: string, message: string, reason: CommitReason, failure: WorkingCopyFailureInfo) => void;
  /** Which failures retrying will not fix. Default `isPermanentSaveFailure`. */
  isPermanentFailure?: (error: unknown) => boolean;
  /**
   * The record's stored state NOW (text kinds), read right before every save:
   * a move under unsaved work becomes a conflict instead of a blind write.
   * Undefined: not readable here (the save goes on).
   */
  source?: (id: string, store: WorkingCopyStoreLike) => { value: string; version?: number | null } | undefined;
  /** A conflict opened (announce it — the record may have no view on screen). */
  onConflict?: (id: string, conflict: WorkingCopyConflict) => void;
  /** The conflict is gone (chosen, discarded, or the stored text came to equal the person's). */
  onConflictResolved?: (id: string) => void;
  /**
   * Text kinds: the person chose (`entry` is the copy after the choice). The
   * record's own store adopts it here — e.g. takes the stored row for
   * "theirs", or rebases the edit onto the stored version for "mine"/"merge".
   */
  conflictChosen?: (
    id: string,
    choice: ConflictChoice,
    entry: WorkingCopyEntry,
    conflict: WorkingCopyConflict,
    store: WorkingCopyStoreLike,
  ) => void;
  /** The person threw the unsaved edit away (`entry` is the copy after it). */
  discarded?: (id: string, entry: WorkingCopyEntry, store: WorkingCopyStoreLike) => void;
  /** Engine kinds: apply the person's choice to the engine before the entry settles. */
  resolveConflict?: (
    engine: E | undefined,
    choice: ConflictChoice,
    conflict: WorkingCopyConflict,
    handle: WorkingCopyHandle,
  ) => void | Promise<void>;
  /** The copy went from saved to unsaved or back (text kinds mirror it onto their record). */
  onDirtyChanged?: (id: string, dirty: boolean, store: WorkingCopyStoreLike) => void;
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
  /**
   * Keep the record's session (its Redux entry and engine) this long after
   * the last view leaves and its work settles, so a view that returns soon
   * reads nothing again. Default 0.
   */
  keepAliveMs?: number;
}

interface Session<E> {
  key: string;
  store: WorkingCopyStoreLike | null;
  commit: CoalescedCommit;
  engine: E | undefined;
  handle: WorkingCopyHandle;
  fadeTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryDelay: number;
  failures: number;
  passesAtCap: number;
  wake: () => void;
}

export interface WorkingCopyKind<E> {
  readonly entity: string;
  key: (id: string) => string;
  /** A view holds the record; returns its release (the last one flushes). */
  attach: (id: string, store: WorkingCopyStoreLike) => () => void;
  /** Text: every view shows `value` now; one save follows. `now` saves immediately. */
  edit: (id: string, value: string, options?: { now?: boolean }) => void;
  /** Engine kinds: an edit happened. Text kinds: the record's other fields changed (one save follows). */
  touch: (id: string) => void;
  /**
   * The record has unsaved work and no view may hold it (a rename from a list,
   * an agent's write, Save): hold its session until that work is saved —
   * retried, offline-aware, conflict-checked like any edit. `now` saves at once.
   * Resolves when the save requested here has run.
   */
  request: (
    id: string,
    store: WorkingCopyStoreLike,
    options?: {
      now?: boolean;
      /** Text kinds: the record's text was changed outside the views (undo, an agent): every view shows it. */
      value?: string;
    },
  ) => Promise<void>;
  /** The record's stored value arrived / moved; a dirty copy keeps the person's text. */
  load: (
    id: string,
    value: string,
    options?: {
      version?: number | null;
      draft?: string | null;
      /** The stored version the draft was typed on; another version loaded = a conflict. */
      draftBaseVersion?: number | null;
      /** The text the draft was typed on (lets that conflict merge). */
      draftBase?: string | null;
    },
  ) => void;
  /** The record already holds `value` (a resolved conflict): show it, drop pending. */
  reset: (id: string, value: string) => void;
  /** The record's metadata was read or written (kept for every view, read once). */
  setRecord: (id: string, record: unknown) => void;
  /** Throw the unsaved edit away (also how a person resolves a failed save). */
  discard: (id: string) => void;
  /** Retry a failed save now (also re-arms parked or permanent ones). */
  retry: (id: string) => Promise<void>;
  /** The person's choice for an open conflict; `merged` with "merge" (see `mergeText`). */
  resolveConflict: (id: string, choice: ConflictChoice, merged?: string) => Promise<void>;
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
    const before = getWorkingCopy(store.getState() as WithWorkingCopies, session.key);
    store.dispatch(action);
    observe(session, store, before);
  };

  /** After any change: report a dirty flip and a newly opened conflict. */
  const observe = (session: Session<E>, store: WorkingCopyStoreLike, before: WorkingCopyEntry | undefined) => {
    const after = getWorkingCopy(store.getState() as WithWorkingCopies, session.key);
    const id = session.handle.id;
    if (config.onDirtyChanged && (before?.dirty ?? false) !== (after?.dirty ?? false)) {
      config.onDirtyChanged(id, after?.dirty ?? false, store);
    }
    if (after?.conflict && !before?.conflict) {
      // The person decides first: no retry spends a write meanwhile.
      stopRetry(session);
      config.onConflict?.(id, after.conflict);
    } else if (before?.conflict && !after?.conflict) {
      config.onConflictResolved?.(id);
    }
  };

  const stopRetry = (session: Session<E>) => {
    if (session.retryTimer) clearTimeout(session.retryTimer);
    session.retryTimer = null;
    retryWakers.delete(session.wake);
  };

  const resetRetry = (session: Session<E>) => {
    stopRetry(session);
    session.retryDelay = RETRY_BASE_MS;
    session.failures = 0;
    session.passesAtCap = 0;
  };

  /** Arm the next retry of a transient failure; null when retries park. */
  const armRetry = (session: Session<E>): number | null => {
    if (session.retryTimer) clearTimeout(session.retryTimer);
    session.retryTimer = null;
    listenForWake();
    retryWakers.add(session.wake);
    const delay = session.retryDelay;
    if (delay >= RETRY_MAX_MS) session.passesAtCap += 1;
    if (session.passesAtCap > RETRY_PASSES_AT_CAP) {
      // Parked, loudly — the edit stays held and on screen as unsaved; a
      // reconnect, the tab returning, an edit or Retry starts again.
      console.warn(
        `[working-copy:${config.entity}] saving ${session.handle.id} still fails after ${RETRY_PASSES_AT_CAP} retries — pausing automatic retries until you reconnect, return to the tab, edit or retry`,
      );
      return null;
    }
    session.retryDelay = Math.min(delay * 2, RETRY_MAX_MS);
    const fire = () => {
      session.retryTimer = null;
      // Explicitly offline: spend no write; `online` wakes it sooner.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        session.retryTimer = setTimeout(fire, RETRY_MAX_MS);
        return;
      }
      void session.commit.flush("retry").then(() => registry.settle(session.handle.id));
    };
    session.retryTimer = setTimeout(fire, delay);
    return Date.now() + delay;
  };

  const registry = createRecordSessionRegistry<Session<E>>({
    open: (id) => {
      const key = keyOf(id);
      const session = {
        key,
        store: null,
        engine: undefined,
        fadeTimer: null,
        retryTimer: null,
        retryDelay: RETRY_BASE_MS,
        failures: 0,
        passesAtCap: 0,
      } as unknown as Session<E>;
      session.wake = () => {
        const entry = readEntry(session);
        if (!entry?.failure || entry.conflict) return;
        session.retryDelay = RETRY_BASE_MS;
        session.passesAtCap = 0;
        if (session.retryTimer) clearTimeout(session.retryTimer);
        session.retryTimer = null;
        void session.commit.flush("retry").then(() => registry.settle(id));
      };
      session.commit = createCoalescedCommit<WorkingCopyEntry | undefined>({
        delay: (entry) => config.delay(entry),
        maxWait: config.maxWait,
        read: () => readEntry(session),
        run: (entry, reason) => runSave(id, session, entry, reason),
        onError: (error) =>
          console.error(
            `[working-copy:${config.entity}] saving ${id} failed — the edit stays pending and is retried`,
            error,
          ),
      });
      session.handle = {
        id,
        key,
        touch: () => {
          dispatch(session, workingCopyTouched({ key }));
          pend(session);
        },
        conflict: ({ version, ref }) => {
          if (!session.handle.hasPending() && !readEntry(session)?.dirty) return;
          dispatch(session, workingCopyConflicted({ key, theirsVersion: version, theirsRef: ref }));
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
    keepAliveMs: config.keepAliveMs,
    canDrop: (session) =>
      !session.commit.hasPending() &&
      !session.commit.isBusy() &&
      !readEntry(session)?.conflict &&
      !(session.engine !== undefined && config.engineBusy?.(session.engine)),
    close: (session) => {
      session.commit.cancel();
      stopRetry(session);
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
    const key = session.key;
    const read = () => getWorkingCopy(store.getState() as WithWorkingCopies, key);
    let current = entry ?? read();
    // Nothing unsaved: no write (an explicit Save still writes a snapshot).
    if (!current || (!current.dirty && reason !== "manual")) return;
    // NO BLIND WRITE: the stored state now, compared with the base this edit
    // started from — a move under it is a conflict, not something to overwrite.
    if (!current.conflict && config.source && current.value !== undefined) {
      const stored = config.source(id, store);
      if (stored) {
        const before = current;
        store.dispatch(workingCopySourceLoaded({ key, value: stored.value, version: stored.version }));
        observe(session, store, before);
        current = read() ?? current;
      }
    }
    if (current.conflict) {
      // The person chooses first; the edit stays pending (and the session held).
      session.commit.mark();
      return;
    }
    store.dispatch(workingCopySaveStarted({ key, writing: current.value }));
    const conflicted = (moved: WorkingCopySaveConflict): void => {
      resetRetry(session);
      const before = read();
      store.dispatch(
        workingCopySaveConflicted({ key, theirs: moved.theirs, version: moved.version, ref: moved.ref }),
      );
      observe(session, store, before);
      // Still unsaved: the session is held and the person's choice saves it.
      session.commit.mark();
      if (!read()?.conflict) session.commit.schedule();
    };
    const fail = (error: unknown): void => {
      if (error instanceof WorkingCopySaveConflict) {
        conflicted(error);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const permanent = (config.isPermanentFailure ?? isPermanentSaveFailure)(error);
      session.failures += 1;
      let retryAt: number | null = null;
      if (permanent) stopRetry(session);
      else retryAt = armRetry(session);
      store.dispatch(
        workingCopySaveFailed({ key, error: message, permanent, attempts: session.failures, retryAt }),
      );
      config.onSaveFailed?.(id, message, reason, { permanent, attempts: session.failures });
      throw error;
    };
    const done = (result: WorkingCopySaveResult | void) => {
      resetRetry(session);
      const before = read();
      const savedAt = result && result.savedAt !== undefined ? result.savedAt : Date.now();
      store.dispatch(
        workingCopySaved({
          key,
          value: result && result.value !== undefined ? result.value : current.value,
          version: result ? result.version : undefined,
          savedAt,
        }),
      );
      observe(session, store, before);
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
      fail(error);
      return;
    }
    if (outcome && typeof (outcome as Promise<unknown>).then === "function") {
      return (outcome as Promise<WorkingCopySaveResult | void>).then(done, fail);
    }
    done(outcome as WorkingCopySaveResult | void);
  }

  const pend = (session: Session<E>) => {
    // A new edit after retries parked starts a fresh streak.
    if (!session.retryTimer) {
      session.retryDelay = RETRY_BASE_MS;
      session.passesAtCap = 0;
    }
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
    request(id, store, options) {
      const held = registry.acquire(id);
      const session = held.session;
      // No view holds it: the store asking is the one that holds the record.
      if (!session.store || registry.holders(id) === 1) session.store = store;
      lastStore = store;
      let requested: Promise<void>;
      try {
        if (options?.value !== undefined && readEntry(session)?.value !== undefined) {
          dispatch(session, workingCopyEdited({ key: session.key, value: options.value }));
        }
        dispatch(session, workingCopyTouched({ key: session.key }));
        if (options?.now) {
          session.commit.mark();
          requested = session.commit.flush("manual");
        }
        else {
          pend(session);
          requested = Promise.resolve();
        }
      } finally {
        // The session is held by its pending save (debounced like any edit,
        // or now) until that save lands or the person resolves it — no view
        // needs to stay for it, and this release flushes nothing early.
        held.release({ quiet: true });
      }
      return requested.then(() => registry.settle(id));
    },
    load(id, value, options) {
      const session = registry.peek(id);
      if (!session) return;
      dispatch(
        session,
        workingCopySourceLoaded({
          key: session.key,
          value,
          version: options?.version,
          draft: options?.draft,
          draftBaseVersion: options?.draftBaseVersion,
          draftBase: options?.draftBase,
        }),
      );
      // A restored draft (or text the new source does not hold) is unsaved work.
      if (readEntry(session)?.dirty && !session.commit.hasPending()) pend(session);
    },
    reset(id, value) {
      const session = registry.peek(id);
      if (!session) return;
      session.commit.cancel();
      resetRetry(session);
      dispatch(session, workingCopyReset({ key: session.key, value }));
      registry.settle(id);
    },
    setRecord(id, record) {
      const session = registry.peek(id);
      if (!session) return;
      dispatch(session, workingCopyRecordLoaded({ key: session.key, record }));
    },
    discard(id) {
      const session = registry.peek(id);
      if (!session) return;
      session.commit.cancel();
      resetRetry(session);
      dispatch(session, workingCopyDiscarded({ key: session.key }));
      const store = storeOf(session);
      const after = readEntry(session);
      if (store && after) config.discarded?.(id, after, store);
      // Resolved: a session no view holds may drop now.
      registry.settle(id);
    },
    retry(id) {
      const session = registry.peek(id);
      if (!session) return Promise.resolve();
      resetRetry(session);
      return session.commit.flush("retry").then(() => registry.settle(id));
    },
    async resolveConflict(id, choice, merged) {
      const session = registry.peek(id);
      if (!session) return;
      const conflict = readEntry(session)?.conflict;
      if (!conflict) return;
      if (config.resolveConflict) {
        await config.resolveConflict(session.engine, choice, conflict, session.handle);
      }
      dispatch(session, workingCopyConflictResolved({ key: session.key, choice, merged }));
      resetRetry(session);
      const store = storeOf(session);
      const after = readEntry(session);
      if (store && after) config.conflictChosen?.(id, choice, after, conflict, store);
      if (readEntry(session)?.dirty) {
        // Mine (or the merge) goes on top of what is stored now.
        await session.commit.flush("flush");
        registry.settle(id);
      } else {
        session.commit.cancel();
        registry.settle(id);
      }
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
