"use client";

/**
 * STORE READS — a read's answer lives in Redux, keyed by what it read, and is
 * read ONCE (owner's law, 2026-10-02: every screen survives hide, show and
 * remount with no repeated side effects — including repeated READS).
 *
 * The class this closes: a view that fetched in a mount effect into its own
 * `useState`. Every wake from sleep, every remount and every second view of
 * the same record read the same rows again. Here the answer is kept by key
 * (`"<domain>.<what>:<record id>"`), the first view to ask reads it, every
 * later view (or the same view after a remount) renders it from the store, and
 * concurrent asks share the one request in flight. A fresh copy arrives only
 * through `refreshStoreRead` (an explicit refresh, a realtime event, a write
 * that knows the answer changed) or `setStoreReadData` (a local edit).
 *
 * The data must be plain JSON (rows, arrays, records) — never a Map or class.
 * A slice that already owns the records (tasks, projects) keeps owning them:
 * its read stores only that it ran (`data: null`) and the rows go to the slice.
 *
 * Hook: `useStoreRead` (`lib/redux/store-reads/useStoreRead.ts`).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { IDENTITY_RESET_ACTION_TYPE } from "@/lib/sync/engine/identityReset";

export type StoreReadStatus = "loading" | "ready" | "error";

export interface StoreReadEntry {
  status: StoreReadStatus;
  /** The last answer (kept while a refresh is in flight or after it failed). */
  data: unknown;
  /** A read has answered at least once — `data` is a real answer. */
  hasData: boolean;
  /** The latest read's failure, as a sentence; null while it is fine. */
  error: string | null;
  /** Epoch ms of the last answer. */
  at: number;
}

export interface StoreReadsState {
  byKey: Record<string, StoreReadEntry>;
}

const initialState: StoreReadsState = { byKey: {} };

const storeReadsSlice = createSlice({
  name: "storeReads",
  initialState,
  reducers: {
    storeReadStarted(state, action: PayloadAction<string>) {
      const prev = state.byKey[action.payload];
      state.byKey[action.payload] = {
        status: "loading",
        data: prev?.data ?? null,
        hasData: prev?.hasData ?? false,
        error: null,
        at: prev?.at ?? 0,
      };
    },
    storeReadSucceeded(state, action: PayloadAction<{ key: string; data: unknown }>) {
      state.byKey[action.payload.key] = {
        status: "ready",
        data: action.payload.data,
        hasData: true,
        error: null,
        at: Date.now(),
      };
    },
    storeReadFailed(state, action: PayloadAction<{ key: string; error: string }>) {
      const prev = state.byKey[action.payload.key];
      state.byKey[action.payload.key] = {
        status: "error",
        data: prev?.data ?? null,
        hasData: prev?.hasData ?? false,
        error: action.payload.error,
        at: prev?.at ?? 0,
      };
    },
    /** A local edit (optimistic patch, a created row) — the store's copy, no re-read. */
    setStoreReadData(state, action: PayloadAction<{ key: string; data: unknown }>) {
      const prev = state.byKey[action.payload.key];
      state.byKey[action.payload.key] = {
        status: prev?.status === "loading" ? "loading" : "ready",
        data: action.payload.data,
        hasData: true,
        error: null,
        at: Date.now(),
      };
    },
    /** Forget an answer (the record was deleted); the next view reads again. */
    forgetStoreRead(state, action: PayloadAction<string>) {
      delete state.byKey[action.payload];
    },
  },
  extraReducers: (builder) => {
    // A different person signs in: nothing read for the last one may show.
    builder.addMatcher(
      (action) => action.type === IDENTITY_RESET_ACTION_TYPE,
      () => initialState,
    );
  },
});

export const { storeReadStarted, storeReadSucceeded, storeReadFailed, setStoreReadData, forgetStoreRead } =
  storeReadsSlice.actions;

export default storeReadsSlice.reducer;

type StateWithStoreReads = { storeReads: StoreReadsState };

/** One key's entry, or null when nothing has asked for it. Stable per entry. */
export const selectStoreRead = (state: StateWithStoreReads, key: string | null): StoreReadEntry | null =>
  key ? (state.storeReads.byKey[key] ?? null) : null;

// ─── The read ────────────────────────────────────────────────────────────────

type Dispatch = (action: unknown) => unknown;
type GetState = () => unknown;

/** Requests in flight (and one queued refresh each), per store — a test builds many stores in one module. */
interface InFlight {
  running: Map<string, Promise<unknown>>;
  queued: Map<string, Promise<unknown>>;
}
const inFlightByStore = new WeakMap<GetState, InFlight>();

function inFlightFor(getState: GetState): InFlight {
  let entry = inFlightByStore.get(getState);
  if (!entry) {
    entry = { running: new Map(), queued: new Map() };
    inFlightByStore.set(getState, entry);
  }
  return entry;
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string" && err.message) {
    return err.message;
  }
  return "The read failed";
}

/**
 * Read `key` once. Already answered (or being answered) → nothing is read; the
 * caller gets the request in flight or the stored answer. `force` reads again
 * (a refresh): when a read is already running it may predate the change the
 * refresh is for, so ONE more read is queued behind it and every refresh asked
 * meanwhile shares that one. `joinRunning` (a refresh that is not about a known
 * change — a window focus) shares a running read instead of queueing another.
 * Resolves to the answer; never rejects (the failure is in the store).
 */
export const ensureStoreRead =
  <T>(key: string, read: () => Promise<T>, options: { force?: boolean; joinRunning?: boolean } = {}) =>
  (dispatch: Dispatch, getState: GetState): Promise<T | undefined> => {
    const { running, queued } = inFlightFor(getState);
    const run = (): Promise<T | undefined> => {
      dispatch(storeReadStarted(key));
      const request = (async () => {
        try {
          const data = await read();
          dispatch(storeReadSucceeded({ key, data }));
          return data;
        } catch (err) {
          dispatch(storeReadFailed({ key, error: messageOf(err) }));
          return undefined;
        } finally {
          running.delete(key);
        }
      })();
      running.set(key, request);
      return request;
    };

    const pending = running.get(key) as Promise<T | undefined> | undefined;
    if (pending) {
      if (!options.force || options.joinRunning) return pending;
      const waiting = queued.get(key) as Promise<T | undefined> | undefined;
      if (waiting) return waiting;
      const next = pending.then(() => {
        queued.delete(key);
        return (running.get(key) as Promise<T | undefined> | undefined) ?? run();
      });
      queued.set(key, next);
      return next;
    }
    const entry = selectStoreRead(getState() as StateWithStoreReads, key);
    if (key.includes('record-readable')) process.stderr.write('DBGENS '+key+' '+JSON.stringify(entry)+' force='+options.force+'\n');
    if (!options.force && entry && entry.status === "ready") return Promise.resolve(entry.data as T);
    return run();
  };

/** Read `key` again now (a refresh, a realtime nudge). */
export const refreshStoreRead = <T>(key: string, read: () => Promise<T>) => ensureStoreRead(key, read, { force: true });
