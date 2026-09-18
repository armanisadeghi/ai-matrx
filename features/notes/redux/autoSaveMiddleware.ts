// features/notes/redux/autoSaveMiddleware.ts
// Watches for note content/label changes and auto-saves after a debounce.
// Debounce is adaptive: smaller content = faster save, larger = slower.
// For auto-generated notes, materializes them (first DB insert) on first edit.

import type { Middleware } from "@reduxjs/toolkit";
import type { AppDispatch } from "@/lib/redux/store";
import type { NotesSliceState, NoteUndoableField } from "./notes.types";
import type { UserAuthState } from "@/lib/redux/slices/userAuthSlice";

// Minimal local state type — avoids importing RootState from store.ts (which
// imports this middleware), breaking the type-level circular dependency.
type StateWithNotes = { notes: NotesSliceState; userAuth: Pick<UserAuthState, "id"> };
import {
  updateNoteLabel,
} from "./slice";
import { getAutoSaveDelay } from "./notes.types";
import type { NoteRecord } from "./notes.types";
import { generateLabelFromContent } from "../hooks/useAutoLabel";
import { isNoteLabelEditing } from "../utils/labelEditing";
import { saveNote } from "./thunks";

// Timer map — one debounce timer per note
// Timers are scoped to this middleware instance. A second configured store
// must never cancel or inherit another store's pending note save.

/**
 * Resolve an optional materialized folder for a first-save note.
 * A folder name can legitimately exist only on the note: default folders and
 * older rows are materialized lazily, so zero rows is not an error.
 */
/**
 * Reconnect + backoff retry (audit N-05).
 *
 * The middleware is action-triggered: before this, a save that failed while
 * the wifi was down was retried only by the user's NEXT keystroke. A student
 * who stops typing when class ends and comes back online an hour later had
 * nothing re-issue the write — the note simply stayed unsaved, with a banner
 * after three failures and silence on mobile.
 *
 * `lib/sync/engine/autoSaveScheduler.ts` was the candidate home for this
 * (AUDIT N-05/N-12 point at it), but it implements per-record debounce only —
 * it contains no `online`, retry or backoff logic, and has zero production
 * consumers — so the policy lives here until Notes moves onto that engine.
 *
 * Contract: one timer for the whole store, never a per-note loop; the delay
 * doubles 1s → 30s and stays there; the loop STOPS as soon as no dirty note
 * carries a failure streak; `online` and a tab becoming visible reset the
 * backoff and re-issue immediately, because both are evidence the reason for
 * the failure may be gone.
 */
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 30_000;
/** Passes allowed at the 30s cap before the loop parks (~5 minutes). A note
 *  that fails for good must not spend a real write every 30s forever; the
 *  blocking save-failure banner is already on screen, and `online`, a tab
 *  coming back, or the user's next edit re-arm it. */
const RETRY_MAX_PASSES_AT_CAP = 10;

/** Every note whose LAST save attempt failed and whose edits the DB still
 *  does not hold. `_consecutiveSaveFailures` is written by the save path
 *  itself, so this covers saves this middleware never scheduled. */
function notesAwaitingRetry(state: StateWithNotes): string[] {
  const records = state.notes?.notes;
  if (!records) return [];
  const ids: string[] = [];
  for (const record of Object.values(records) as NoteRecord[]) {
    if (!record) continue;
    if (record._dirty && (record._consecutiveSaveFailures ?? 0) > 0) {
      ids.push(record.id);
    }
  }
  return ids;
}

export interface NotesReconnectRetry {
  /** Start (or keep) the backoff loop. No-op while a timer is already armed. */
  arm(): void;
  /** A save landed: drop the accumulated backoff. */
  reset(): void;
  /** Detach the listeners and cancel the timer. */
  dispose(): void;
}

interface RetryStoreApi {
  getState: () => unknown;
  dispatch: (action: unknown) => { unwrap: () => Promise<unknown> };
}

/**
 * ONE retry controller per store. Exported so it can be driven directly in a
 * test — the middleware owns exactly one and disposes nothing, because a
 * store lives as long as the page.
 */
export function createNotesReconnectRetry(storeApi: RetryStoreApi): NotesReconnectRetry {
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = RETRY_BASE_DELAY_MS;
  let running = false;
  let disposed = false;
  /** True from the first failure until the loop stops (clean, or parked). A
   *  failure that arrives while the loop is NOT active is a new streak and
   *  starts again at 1s — never at the cap the last streak left behind. */
  let active = false;
  let passesAtCap = 0;

  function arm(delay: number = retryDelay): void {
    if (disposed || retryTimer) return;
    retryTimer = setTimeout(() => {
      void runPass();
    }, delay);
  }

  async function runPass(): Promise<void> {
    retryTimer = null;
    if (disposed || running) return;
    const state = storeApi.getState() as StateWithNotes;
    const ids = notesAwaitingRetry(state);
    if (ids.length === 0) {
      retryDelay = RETRY_BASE_DELAY_MS;
      active = false;
      passesAtCap = 0;
      return;
    }
    // Explicitly offline: do not spend a write. The `online` listener owns the
    // wake-up; the timer stays armed at the cap as a belt-and-braces fallback
    // because `navigator.onLine` lies on captive portals.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      arm(RETRY_MAX_DELAY_MS);
      return;
    }
    const identity = state.userAuth.id;
    running = true;
    try {
      for (const noteId of ids) {
        const current = storeApi.getState() as StateWithNotes;
        if (current.userAuth.id !== identity) return;
        const record = current.notes?.notes?.[noteId] as NoteRecord | undefined;
        if (!record || !record._dirty) continue;
        try {
          await storeApi.dispatch(saveNote(noteId)).unwrap();
        } catch {
          // `saveNote` owns durable error state and the user-visible failure;
          // the backoff below owns when we come back.
        }
      }
    } finally {
      running = false;
    }
    if (disposed) return;
    // Still failing → back off (1s, 2s, 4s … capped at 30s). Clean → stop.
    if (notesAwaitingRetry(storeApi.getState() as StateWithNotes).length > 0) {
      if (retryDelay >= RETRY_MAX_DELAY_MS) passesAtCap += 1;
      if (passesAtCap >= RETRY_MAX_PASSES_AT_CAP) {
        // Parked, loudly: the write keeps failing for a reason a retry will
        // not fix. The save-failure banner stays up; reconnect, a tab return
        // or the next edit starts a fresh streak.
        console.warn(
          `[notes] Saving still failing after ${RETRY_MAX_PASSES_AT_CAP} retries at ${RETRY_MAX_DELAY_MS / 1000}s — pausing automatic retries until you reconnect, return to the tab, or edit again.`,
        );
        active = false;
        passesAtCap = 0;
        retryDelay = RETRY_BASE_DELAY_MS;
        return;
      }
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_DELAY_MS);
      arm(retryDelay);
    } else {
      retryDelay = RETRY_BASE_DELAY_MS;
      active = false;
      passesAtCap = 0;
    }
  }

  /** A reconnect or a tab coming back is evidence the cause may be gone: drop
   *  the accumulated backoff and re-issue now. */
  function retryNow(): void {
    if (disposed) return;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryDelay = RETRY_BASE_DELAY_MS;
    passesAtCap = 0;
    if (notesAwaitingRetry(storeApi.getState() as StateWithNotes).length === 0) return;
    active = true;
    void runPass();
  }

  function onVisibility(): void {
    if (document.visibilityState === "visible") retryNow();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", onVisibility);
  }

  return {
    arm: () => {
      if (!active) {
        retryDelay = RETRY_BASE_DELAY_MS;
        passesAtCap = 0;
      }
      active = true;
      arm();
    },
    reset: () => {
      retryDelay = RETRY_BASE_DELAY_MS;
    },
    dispose: () => {
      disposed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", retryNow);
        document.removeEventListener("visibilitychange", onVisibility);
      }
    },
  };
}

/**
 * Auto-save middleware.
 * Listens for updateNoteContent and updateNoteLabel actions.
 * Schedules a debounced save to Supabase.
 * For auto-generated notes, performs INSERT instead of UPDATE on first save.
 *
 * Concurrency: UPDATE is gated by the persisted revision so a concurrent
 * collaborator write yields a conflict without a TOCTOU window.
 * Mid-save keystrokes: `markNoteSaved` receives a savedSnapshot and only
 * clears dirty fields that still match what was written.
 */
export const autoSaveMiddleware: Middleware<unknown, StateWithNotes, AppDispatch> =
  (storeApi) => {
    const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
    // Audit N-05: coming back online (or back to the tab) re-issues the write.
    const reconnectRetry = createNotesReconnectRetry(storeApi as never);

    return (next) => (action) => {
    const result = next(action);

    // Content/label edits + internal follow-up after a mid-save dirty remain.
    const actionType = (action as { type?: string }).type;
    const actionMeta = (action as { meta?: { notesAutoLabel?: boolean } }).meta;
    if (
      actionType !== "notes/updateNoteContent" &&
      actionType !== "notes/updateNoteLabel" &&
      actionType !== "notes/updateNoteFolder" &&
      actionType !== "notes/updateNoteTags" &&
      actionType !== "notes/setNoteField" &&
      actionType !== "notes/setNoteFields" &&
      actionType !== "notes/requestAutoSave"
    ) {
      return result;
    }

    // Extract noteId from action payload
    const payload = (action as { payload?: { id?: string } }).payload;
    const noteId = payload?.id;
    if (!noteId) return result;
    // A generated label belongs to the timer that already captured this
    // draft's identity. Starting another timer after its synchronous dispatch
    // could capture a switched account and write this user's draft there.
    if (actionMeta?.notesAutoLabel) return result;

    // Read current note from state
    const state = storeApi.getState() as StateWithNotes;
    const record = state.notes?.notes?.[noteId] as NoteRecord | undefined;
    if (!record || !record._dirty) return result;

    // Clear existing timer for this note
    const existing = saveTimers.get(noteId);
    if (existing) clearTimeout(existing);

    // Calculate debounce based on content size
    const delay = getAutoSaveDelay(record.content?.length ?? 0);
    const scheduledUserId = state.userAuth.id;

    // Schedule save
    const timer = setTimeout(async () => {
      saveTimers.delete(noteId);

      const currentState = storeApi.getState() as StateWithNotes;
      if (currentState.userAuth.id !== scheduledUserId) return;
      const currentRecord = currentState.notes?.notes?.[noteId] as
        NoteRecord | undefined;
      if (!currentRecord || !currentRecord._dirty) return;

      // ── Auto-label: generate label from content if still "New Note" ──
      // NEVER while the user is typing the title (labelEditing signal) or
      // after they typed one (label field dirty): the generated label would
      // land in Redux mid-keystroke and clobber their in-progress name —
      // the naming rule is "if the user starts naming, hold their value and
      // commit it on blur; no freaking out".
      const shouldAutoLabel =
        (!currentRecord.label ||
          currentRecord.label.trim() === "" ||
          currentRecord.label.toLowerCase() === "new note") &&
        !isNoteLabelEditing(noteId) &&
        !currentRecord._dirtyFields.has("label");

      if (
        shouldAutoLabel &&
        currentRecord.content &&
        currentRecord.content.trim().length >= 12
      ) {
        const generated = generateLabelFromContent(currentRecord.content);
        if (generated) {
          storeApi.dispatch({
            ...updateNoteLabel({ id: noteId, label: generated }),
            meta: { notesAutoLabel: true },
          });
        }
      }

      // Re-read state after potential label update
      const stateAfterLabel = storeApi.getState() as StateWithNotes;
      const recordAfterLabel = stateAfterLabel.notes?.notes?.[noteId] as
        NoteRecord | undefined;
      if (
        stateAfterLabel.userAuth.id !== scheduledUserId ||
        !recordAfterLabel ||
        !recordAfterLabel._dirty
      ) return;

      try {
        await storeApi.dispatch(saveNote(noteId)).unwrap();
        reconnectRetry.reset();
      } catch {
        // `saveNote` owns durable error state and user-visible failure. What
        // it does NOT own is coming back: start the backoff so the write is
        // re-issued without waiting for another keystroke (audit N-05).
        reconnectRetry.arm();
      }
    }, delay);

    saveTimers.set(noteId, timer);

    return result;
  };
  };
