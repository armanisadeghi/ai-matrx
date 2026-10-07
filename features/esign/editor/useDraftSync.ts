"use client";

// features/esign/editor/useDraftSync.ts — autosave without loss (CONTRACT §15, A-F8).
//
// Single flight: only one save is ever on the wire; edits made meanwhile coalesce into the next.
// Debounce 800 ms. Flush when the page is hidden or closing (keepalive). A local mirror of the
// unsaved composition is kept per envelope and restored after a refresh or pause. On `stale_draft`
// the server's copy is merged by item id; the same item changed on both sides is a conflict the
// sender settles — nothing is silently discarded.

import { useCallback, useEffect, useRef, useState } from "react";

import type { EnvelopeDraftV1 } from "../contract/draft";
import { mergeDrafts, takeTheirs, type DraftConflict } from "./merge";
import type { EditorApi } from "./api/types";
import { DraftRefusal } from "./api/types";

export type SaveStatus = "saved" | "saving" | "dirty" | "retrying" | "readonly";

const DEBOUNCE_MS = 800;
const RETRY_MS = 3000;
const mirrorKey = (id: string) => `matrx.esign.draft.${id}`;

interface Mirror {
  draft: EnvelopeDraftV1;
  revision: number;
  at: string;
}

export function readMirror(id: string): Mirror | null {
  try {
    const raw = localStorage.getItem(mirrorKey(id));
    return raw ? (JSON.parse(raw) as Mirror) : null;
  } catch {
    return null;
  }
}

export interface UseDraftSync {
  status: SaveStatus;
  savedAt: string | null;
  conflicts: DraftConflict[];
  resolveConflicts(choice: "mine" | "theirs"): void;
  flushNow(): Promise<void>;
  /** True once nothing is waiting to be saved. */
  idle: boolean;
}

export function useDraftSync(args: {
  api: EditorApi;
  envelopeId: string | null;
  draft: EnvelopeDraftV1;
  initialRevision: number;
  /** The last composition the server confirmed (the merge base). */
  confirmed: EnvelopeDraftV1;
  readOnly?: boolean;
  onMerged(merged: EnvelopeDraftV1): void;
}): UseDraftSync {
  const { api, envelopeId, draft, readOnly, onMerged } = args;
  const [status, setStatus] = useState<SaveStatus>(readOnly ? "readonly" : "saved");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<DraftConflict[]>([]);

  const latest = useRef(draft);
  const base = useRef(args.confirmed);
  const revision = useRef(args.initialRevision);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiters = useRef<(() => void)[]>([]);
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;
  const conflictList = useRef<DraftConflict[]>([]);
  const idRef = useRef(envelopeId);
  idRef.current = envelopeId;

  // A new envelope (the draft was just created) restarts the base.
  const lastId = useRef(envelopeId);
  if (lastId.current !== envelopeId) {
    lastId.current = envelopeId;
    base.current = args.confirmed;
    revision.current = args.initialRevision;
  }

  const dirty = () => JSON.stringify(latest.current) !== JSON.stringify(base.current);

  const settle = useCallback(() => {
    const list = waiters.current;
    waiters.current = [];
    list.forEach((w) => w());
  }, []);

  const save = useCallback(async () => {
    const id = idRef.current;
    if (!id || readOnly || conflictList.current.length > 0) return;
    if (inFlight.current) return; // the running save re-checks when it ends
    if (!dirty()) {
      setStatus("saved");
      settle();
      return;
    }
    inFlight.current = true;
    setStatus("saving");
    const sent = latest.current;
    try {
      const result = await api.saveDraft(id, sent, revision.current);
      if (result.ok) {
        revision.current = result.revision;
        base.current = sent;
        setSavedAt(result.savedAt);
        if (JSON.stringify(latest.current) === JSON.stringify(sent)) {
          try {
            localStorage.removeItem(mirrorKey(id));
          } catch {
            /* a full or blocked store is not a save failure */
          }
        }
      } else {
        const { merged, conflicts: found } = mergeDrafts(base.current, latest.current, result.composition);
        revision.current = result.revision;
        base.current = result.composition;
        latest.current = merged;
        onMergedRef.current(merged);
        if (found.length > 0) {
          conflictList.current = found;
          setConflicts(found);
        }
      }
      inFlight.current = false;
      if (conflictList.current.length === 0 && dirty()) {
        timer.current = setTimeout(() => void save(), 0);
      } else {
        setStatus(conflictList.current.length ? "dirty" : "saved");
        settle();
      }
    } catch (err) {
      inFlight.current = false;
      if (err instanceof DraftRefusal && (err.code === "not_draft" || err.code === "no_access")) {
        setStatus("readonly");
        settle();
        return;
      }
      console.error("[esign] draft save failed", err);
      setStatus("retrying");
      timer.current = setTimeout(() => void save(), RETRY_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, readOnly, settle]);

  // Every change: mirror locally at once, save after the debounce.
  useEffect(() => {
    latest.current = draft;
    if (readOnly || !envelopeId) return;
    if (!dirty()) return;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    try {
      localStorage.setItem(mirrorKey(envelopeId), JSON.stringify({ draft, revision: revision.current, at: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, envelopeId, readOnly]);

  // Flush when the page is hidden or going away.
  useEffect(() => {
    if (readOnly) return undefined;
    const onHide = () => {
      const id = idRef.current;
      if (!id || !dirty() || conflictList.current.length > 0) return;
      api.saveDraftOnExit(id, latest.current, revision.current);
    };
    const onVis = () => document.visibilityState === "hidden" && onHide();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, readOnly]);

  const flushNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty() && !inFlight.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiters.current.push(resolve);
      void save();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  const resolveConflicts = useCallback(
    (choice: "mine" | "theirs") => {
      const found = conflictList.current;
      conflictList.current = [];
      setConflicts([]);
      if (choice === "theirs") {
        const next = takeTheirs(latest.current, found);
        latest.current = next;
        onMergedRef.current(next);
      }
      timer.current = setTimeout(() => void save(), 0);
    },
    [save],
  );

  return { status, savedAt, conflicts, resolveConflicts, flushNow, idle: status === "saved" || status === "readonly" };
}
