/**
 * lib/working-copy/workingCopyStore.ts
 *
 * A record's WORKING COPY — the text a person is typing, before it reaches the
 * record's store — kept once per record, keyed by id, shared by every view.
 *
 * Before this, each editor held its own copy in component state and its own
 * debounce timer. Two views of one note (a board tile and the notes side
 * panel) were two buffers fighting over one record (last debounce wins), the
 * second view lagged the first by a debounce, and a view's unmount cleared a
 * buffer the other view was still using (notes audit N-07). Now:
 *
 *  - `edit(id, v)` — every attached view shows `v` at once; ONE commit (the
 *    record's own write path, e.g. a Redux dispatch) runs after the debounce.
 *  - `adopt(id, v)` — the record's source moved (realtime, undo, a fetch).
 *    Views take it unless local work is pending; never clobbers typing.
 *  - `attach(id)` — a view holds the copy. When the LAST view goes the pending
 *    work is committed synchronously-first and the copy is released, so the
 *    record's own store is the truth again and a remount reads it.
 *  - `flush(id)` — commit now (before undo, save, a mode switch).
 *
 * Built on `./recordSessions.ts` (one session per record) and
 * `./coalescedCommit.ts` (one save path per record).
 */

import { createCoalescedCommit, type CoalescedCommit } from "./coalescedCommit";
import { createRecordSessionRegistry } from "./recordSessions";

export interface WorkingCopyStoreOptions<T> {
  /** Shown in diagnostics. */
  name: string;
  /** Debounce from the last edit to the commit, per record. */
  commitDelay: (value: T) => number;
  /** THE one write path for a record's working copy. */
  commit: (id: string, value: T) => void | Promise<void>;
  equals?: (a: T, b: T) => boolean;
}

export interface WorkingCopyStore<T> {
  /** The working copy, or undefined when no view holds unsaved state (read the record). */
  get: (id: string) => T | undefined;
  /** A local edit: every view updates now; one commit follows. */
  edit: (id: string, value: T, options?: { commit?: "debounced" | "now" }) => void;
  /** The record's source moved. Taken unless local work is pending. True when taken. */
  adopt: (id: string, value: T) => boolean;
  /**
   * The record already holds `value` (a conflict resolution, a restore wrote
   * it): views show it and any pending commit is dropped — committing the old
   * edit over it would undo the resolution.
   */
  reset: (id: string, value: T) => void;
  /** Commit pending work now. */
  flush: (id: string) => Promise<void>;
  hasPending: (id: string) => boolean;
  /** A view holds the copy; returns its release. */
  attach: (id: string) => () => void;
  /** How many views hold the copy. */
  views: (id: string) => number;
  /** Notified on every change of `get(id)`. */
  subscribe: (id: string, listener: () => void) => () => void;
}

interface Copy<T> {
  value: T | undefined;
  commit: CoalescedCommit;
}

export function createWorkingCopyStore<T>(
  options: WorkingCopyStoreOptions<T>,
): WorkingCopyStore<T> {
  const equals = options.equals ?? Object.is;
  const listeners = new Map<string, Set<() => void>>();

  const notify = (id: string) => {
    const set = listeners.get(id);
    if (!set) return;
    for (const listener of Array.from(set)) listener();
  };

  // Edits made with no view attached (an agent write, a host flush) still need
  // a copy; they get a transient holder that the commit releases.
  const sessions = createRecordSessionRegistry<Copy<T>>({
    open: (id) => {
      const copy: Copy<T> = {
        value: undefined,
        commit: createCoalescedCommit<T | undefined>({
          read: () => copy.value,
          delay: (value) => (value === undefined ? 0 : options.commitDelay(value)),
          run: (value) => {
            if (value === undefined) return;
            return options.commit(id, value);
          },
          onError: (error) =>
            console.error(`[working-copy:${options.name}] committing ${id} failed — the edit stays pending`, error),
        }),
      };
      return copy;
    },
    // The last view left: write what it was holding, then let the record's own
    // store be the truth (a remount reads the committed value).
    lastViewGone: (copy, id) => {
      const done = copy.commit.flush("flush");
      const release = () => {
        if (sessions.holders(id) > 0) return;
        if (copy.commit.hasPending()) return;
        if (copy.value !== undefined) {
          copy.value = undefined;
          notify(id);
        }
      };
      release();
      return done.then(release);
    },
    canDrop: (copy) => !copy.commit.hasPending() && !copy.commit.isBusy(),
    close: (copy) => copy.commit.cancel(),
  });

  /** Run `fn` against a record's copy, holding it for the duration if no view does. */
  const withCopy = <R>(id: string, fn: (copy: Copy<T>) => R): R => {
    const existing = sessions.peek(id);
    if (existing && sessions.holders(id) > 0) return fn(existing);
    const handle = sessions.acquire(id);
    try {
      return fn(handle.session);
    } finally {
      handle.release();
    }
  };

  return {
    get: (id) => sessions.peek(id)?.value,
    edit(id, value, editOptions) {
      withCopy(id, (copy) => {
        const changed = copy.value === undefined || !equals(copy.value, value);
        copy.value = value;
        if (changed) notify(id);
        if (editOptions?.commit === "now") void copy.commit.flush("flush", true);
        else copy.commit.schedule();
      });
    },
    adopt(id, value) {
      const copy = sessions.peek(id);
      if (!copy || sessions.holders(id) === 0) return false;
      // No copy: every view already reads the record itself.
      if (copy.value === undefined) return false;
      if (copy.commit.hasPending() || copy.commit.isBusy()) return false;
      if (equals(copy.value, value)) return false;
      copy.value = value;
      notify(id);
      return true;
    },
    reset(id, value) {
      const copy = sessions.peek(id);
      if (!copy || sessions.holders(id) === 0) return;
      copy.commit.cancel();
      if (copy.value !== undefined && equals(copy.value, value)) return;
      copy.value = value;
      notify(id);
    },
    flush(id) {
      const copy = sessions.peek(id);
      return copy ? copy.commit.flush("flush") : Promise.resolve();
    },
    hasPending(id) {
      const copy = sessions.peek(id);
      return copy ? copy.commit.hasPending() || copy.commit.isBusy() : false;
    },
    attach(id) {
      return sessions.acquire(id).release;
    },
    views: (id) => sessions.holders(id),
    subscribe(id, listener) {
      let set = listeners.get(id);
      if (!set) {
        set = new Set();
        listeners.set(id, set);
      }
      set.add(listener);
      return () => {
        set!.delete(listener);
        if (set!.size === 0) listeners.delete(id);
      };
    },
  };
}
