"use client";

// lib/wizard-draft/useTabBoundRun.ts
//
// A RUN THAT LIVES IN THE TAB NEVER DIES IN SILENCE (V5-A.2, 2026-09-30).
//
// Some generation runs are orchestrated by the browser: the page fans out over
// sections, merges what comes back and saves it (flashcards' Make the deck and
// Add more cards, via `features/education/convert/segmentedGenerate.ts`). The
// agent calls run on the server, but the merge and the save run in the tab, so
// a reload mid-run loses the whole run. Before this hook nothing recorded that
// a run had been started, so after the reload the page showed no progress, no
// notice and no cards — the verifier's "37-after-reload-add.png".
//
// This hook records the run's REQUEST (what was asked: the count, the material)
// as a device-local marker in the generic `wizardDraftSlice` (persisted by the
// sync engine — IDB + localStorage mirror, pagehide flush, cross-tab broadcast;
// no new slice). The page that ran it clears the marker when the run settles —
// success or an error it showed in place. A marker that outlived its page is a
// run that stopped with the page: the next mount reports it as `stopped`, with
// the request, so the surface can say what happened and offer a one-click redo
// of the SAME request.
//
// Liveness, so another open tab's live run is never called "stopped":
//   - the running page beats the marker every RUN_BEAT_MS;
//   - `beforeunload` (which precedes the sync engine's pagehide flush) stamps
//     `closedAt`, so a reload is reported the moment the page is back;
//   - a marker with neither a close stamp nor a fresh beat (a crash, a killed
//     tab) is stopped once RUN_STALE_MS has passed since its last beat.
//
// A SAVE IS NEVER REPEATED BLIND (2026-09-30). Once the run starts its save
// the run is past the point of no return: the save may land on the server even
// if this page never hears back. So the page calls `saving()` BEFORE it sends
// the save; that stamps `savingAt` into the marker and waits until it is on
// disk. A run that stopped after that is reported `whileSaving` — the surface
// says to check what was saved and offers no one-click redo, so a reload in
// the instant after the save can never save the same cards twice. A run that
// RESOLVES clears its marker even while the page is closing.
//
// NOT a durability mechanism. A run the SERVER owns (a domain ledger, rejoin
// by id) uses `lib/durable-run/useDurableRun` and re-attaches; this hook keeps
// no run state, only the request, for runs that cannot outlive their tab. Move
// a run server-side and it leaves this hook for `useDurableRun`.
//
// React Compiler is on: no manual useMemo / useCallback.

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { SyncEngineApi } from "@/lib/sync/engine/middleware";
import {
  clearWizardDraft,
  patchWizardDraft,
  selectWizardDraft,
  type WizardDraftState,
} from "@/lib/redux/slices/wizardDraftSlice";

/** How often a running page re-stamps its marker. */
export const RUN_BEAT_MS = 3_000;
/** A marker this long past its last beat (and never closed) belongs to a dead page. */
export const RUN_STALE_MS = 10_000;
/**
 * A page that said it was closing but is still here this long later stayed
 * (a "Leave site?" answered Stay): its run is live again.
 */
export const RUN_CLOSE_GRACE_MS = 2_000;
/** A stopped run older than this is no longer worth offering again. */
export const RUN_FORGET_MS = 24 * 60 * 60 * 1000;

/** The persisted record of one tab-bound run. JSON only. */
export interface RunMarker {
  runId: string;
  startedAt: number;
  beatAt: number;
  closedAt?: number;
  /** Set (and flushed to disk) just before the run's save was sent. */
  savingAt?: number;
  /**
   * Every conversation the run (and the attempts it continues) ran in — so a
   * retry can find and continue a deck already made for one of them.
   */
  conversationIds?: string[];
  request: Record<string, unknown>;
  /**
   * What the run has done so far (JSON), written by the run as it goes — so a
   * retry continues the SAME work instead of starting it again (the study kit
   * records which outputs saved and which sections already ran).
   */
  journal?: Record<string, unknown>;
}

export type RunMarkerState =
  /** No run, a run in THIS page, or one too old to offer. */
  | "none"
  /** Another open tab is running it right now. */
  | "elsewhere"
  /** It stopped with the page that ran it. */
  | "stopped";

/** Runs alive in this page (module scope: every hook instance on the page shares it). */
const liveHere = new Set<string>();

/** Tests only: what a fresh page load knows — no run alive in it. */
export function forgetRunsInThisPageForTest(): void {
  liveHere.clear();
}

/** The stored bag as a marker, or null when it is not one. Pure. */
export function readRunMarker(data: unknown): RunMarker | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.runId !== "string" || typeof d.startedAt !== "number" || typeof d.beatAt !== "number")
    return null;
  if (!d.request || typeof d.request !== "object" || Array.isArray(d.request)) return null;
  return {
    runId: d.runId,
    startedAt: d.startedAt,
    beatAt: d.beatAt,
    ...(typeof d.closedAt === "number" ? { closedAt: d.closedAt } : {}),
    ...(typeof d.savingAt === "number" ? { savingAt: d.savingAt } : {}),
    ...(Array.isArray(d.conversationIds)
      ? { conversationIds: d.conversationIds.filter((c): c is string => typeof c === "string") }
      : {}),
    request: d.request as Record<string, unknown>,
    ...(d.journal && typeof d.journal === "object" && !Array.isArray(d.journal)
      ? { journal: d.journal as Record<string, unknown> }
      : {}),
  };
}

/** What a marker means to a page that did not start it (or did). Pure. */
export function runMarkerState(
  marker: RunMarker | null,
  now: number,
  runningHere: boolean,
): RunMarkerState {
  if (!marker || runningHere) return "none";
  if (now - marker.startedAt > RUN_FORGET_MS) return "none";
  if (marker.closedAt !== undefined) return "stopped";
  return now - marker.beatAt > RUN_STALE_MS ? "stopped" : "elsewhere";
}

function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface TabBoundRun<R> {
  /**
   * A run that stopped with its page, with what it asked for. Null otherwise.
   * `whileSaving`: it had already sent its save, which may have landed —
   * never offer the same request again in one click.
   */
  stopped: {
    request: R;
    startedAt: number;
    whileSaving: boolean;
    /** The conversations it ran in — pass as `continues` to its retry. */
    conversationIds: string[];
    /** What it recorded with `note` before it stopped — pass as `journal` to its retry. */
    journal: Record<string, unknown>;
    /** When the page that ran it closed (or last beat, for a crash). */
    stoppedAt: number;
  } | null;
  /** Another open tab is running this right now. */
  runningElsewhere: boolean;
  /**
   * Run `work` as a tab-bound run of `request`: the marker is written before it
   * starts and cleared when it settles (resolve or throw). Use `settle()` to
   * clear it earlier, once the result is safely stored. `await saving()`
   * immediately before sending the save (see the file header). Call
   * `attach(conversationId)` as soon as each conversation of the run exists.
   * A retry passes `continues` (the stopped run's `conversationIds`), so the
   * marker keeps them if the retry is interrupted too.
   */
  track: <T>(
    request: Record<string, unknown>,
    work: (
      settle: () => void,
      saving: () => Promise<void>,
      attach: (conversationId: string) => void,
      note: (journal: Record<string, unknown>) => void,
    ) => Promise<T>,
    opts?: { continues?: readonly string[]; journal?: Record<string, unknown> },
  ) => Promise<T>;
  /** "Seen it" — drop the stopped run (the person dismissed or redid it). */
  dismiss: () => void;
}

/**
 * Record a browser-orchestrated run so a reload can never lose it in silence.
 * `key` names the run's place (one deck's top-up, the new-deck page); `restore`
 * maps the stored request back, returning null for anything it cannot use.
 */
export function useTabBoundRun<R>(
  key: string,
  restore: (request: Record<string, unknown>) => R | null,
): TabBoundRun<R> {
  const draftId = `run:${key}`;
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const entry = useAppSelector(selectWizardDraft(draftId));
  const marker = readRunMarker(entry?.data);
  const [now, setNow] = useState(() => Date.now());
  const state = runMarkerState(marker, now, !!marker && liveHere.has(marker.runId));

  // A run another tab is beating: look again just after it would go stale.
  const beatAt = marker?.beatAt ?? 0;
  useEffect(() => {
    if (state !== "elsewhere") return;
    const wait = Math.max(500, beatAt + RUN_STALE_MS + 250 - Date.now());
    const t = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(t);
  }, [state, beatAt]);

  const restored = state === "stopped" && marker ? restore(marker.request) : null;

  const currentRunId = (): string | null => {
    const s = store.getState() as unknown as { wizardDraft: WizardDraftState };
    return readRunMarker(s.wizardDraft.drafts[draftId]?.data)?.runId ?? null;
  };

  const track = async <T,>(
    request: Record<string, unknown>,
    work: (
      settle: () => void,
      saving: () => Promise<void>,
      attach: (conversationId: string) => void,
      note: (journal: Record<string, unknown>) => void,
    ) => Promise<T>,
    opts: { continues?: readonly string[]; journal?: Record<string, unknown> } = {},
  ): Promise<T> => {
    const runId = newRunId();
    const startedAt = Date.now();
    const conversationIds = [...(opts.continues ?? [])];
    liveHere.add(runId);
    dispatch(clearWizardDraft(draftId));
    dispatch(
      patchWizardDraft({
        wizardId: draftId,
        patch: {
          runId,
          startedAt,
          beatAt: startedAt,
          request,
          conversationIds: [...conversationIds],
          ...(opts.journal ? { journal: opts.journal } : {}),
        },
      }),
    );
    let settled = false;
    const ours = () => !settled && currentRunId() === runId;
    const beat = setInterval(() => {
      if (ours()) dispatch(patchWizardDraft({ wizardId: draftId, patch: { beatAt: Date.now() } }));
    }, RUN_BEAT_MS);
    // Set when the page starts to unload. From then on the run's own ending
    // (the page aborts its streams, the work rejects) is the page dying, not
    // the run's outcome: the marker must reach the pagehide flush intact.
    let closing = false;
    const onClose = () => {
      if (!ours()) return;
      closing = true;
      dispatch(patchWizardDraft({ wizardId: draftId, patch: { closedAt: Date.now() } }));
      setTimeout(() => {
        // Still here: the unload was refused and the run lives on.
        closing = false;
        if (ours()) dispatch(patchWizardDraft({ wizardId: draftId, patch: { closedAt: null } }));
      }, RUN_CLOSE_GRACE_MS);
    };
    window.addEventListener("beforeunload", onClose);
    // `succeeded`: the result is stored, so the marker goes even mid-unload —
    // kept, it would offer to redo (and re-save) a run that already saved.
    const finish = (succeeded: boolean) => {
      if (settled) return;
      const mine = currentRunId() === runId;
      settled = true;
      clearInterval(beat);
      window.removeEventListener("beforeunload", onClose);
      liveHere.delete(runId);
      if (!mine) return;
      if (closing && !succeeded) {
        // Kept for the next page; dropped only if this page turns out to stay.
        setTimeout(() => {
          if (currentRunId() === runId) dispatch(clearWizardDraft(draftId));
        }, RUN_CLOSE_GRACE_MS);
        return;
      }
      dispatch(clearWizardDraft(draftId));
    };
    const settle = () => finish(true);
    const attach = (conversationId: string) => {
      if (!conversationId || conversationIds.includes(conversationId)) return;
      conversationIds.push(conversationId);
      if (ours())
        dispatch(
          patchWizardDraft({ wizardId: draftId, patch: { conversationIds: [...conversationIds] } }),
        );
    };
    const saving = async () => {
      if (!ours()) return;
      dispatch(patchWizardDraft({ wizardId: draftId, patch: { savingAt: Date.now() } }));
      // On disk BEFORE the save is sent, never 150ms after it.
      const engine = (store as unknown as { _sync?: { engineApi?: () => SyncEngineApi | null } })._sync;
      await engine?.engineApi?.()?.flushPersisted("wizardDraft");
    };
    const note = (journal: Record<string, unknown>) => {
      if (ours()) dispatch(patchWizardDraft({ wizardId: draftId, patch: { journal } }));
    };
    let result: T;
    try {
      result = await work(settle, saving, attach, note);
    } catch (err) {
      finish(false);
      throw err;
    }
    finish(true);
    return result;
  };

  return {
    stopped:
      restored && marker
        ? {
            request: restored,
            startedAt: marker.startedAt,
            whileSaving: marker.savingAt !== undefined,
            conversationIds: marker.conversationIds ?? [],
            journal: marker.journal ?? {},
            stoppedAt: marker.closedAt ?? marker.beatAt,
          }
        : null,
    runningElsewhere: state === "elsewhere",
    track,
    dismiss: () => {
      if (marker && !liveHere.has(marker.runId)) dispatch(clearWizardDraft(draftId));
    },
  };
}
