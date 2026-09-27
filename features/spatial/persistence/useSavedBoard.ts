"use client";

// features/spatial/persistence/useSavedBoard.ts
//
// Open a saved board (the person's home board, or one by id) and keep it
// saved. The board page renders from `board.doc` and hands every change to
// `save(doc)`; this hook debounces (~800ms), guards each write with the row's
// `version`, and flushes on unmount and `pagehide` so typing is never lost.
//
// Nothing fails silently: a failed load is `failed` with a retry, a failed save
// sets `saveError` AND raises a toast naming what happened. A save refused
// because another tab changed the board stops autosave for this tab (writing
// on would overwrite the newer board) and offers a reload.

import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";
import type { BoardDocument } from "../board/document";
import { createAutosaver, type Autosaver } from "./autosave";
import {
  BoardError,
  getBoard,
  getHomeBoard,
  isBoardError,
  renameBoard,
  saveBoardDocument,
  touchOpened,
  type LoadedBoard,
} from "./boardsService";

export const AUTOSAVE_DELAY_MS = 800;

export type SavedBoardTarget = { home: true } | { boardId: string };

export type SavedBoardState =
  | { state: "loading" }
  | { state: "failed"; reason: string; retry: () => void }
  | {
      state: "ready";
      board: {
        id: string;
        title: string;
        organizationId: string;
        isHome: boolean;
        doc: BoardDocument;
        problems: string[];
      };
      /** Debounced autosave (~800ms); last write wins within the tab. */
      save: (doc: BoardDocument) => void;
      saving: boolean;
      lastSavedAt: number | null;
      saveError: string | null;
      rename: (title: string) => void;
    };

/** Words for a failure, for a person. Exported for tests. */
export function describeLoadFailure(error: unknown, target: SavedBoardTarget): string {
  if (isOrganizationSelectionCancelled(error)) {
    return "Your board lives in a workspace. Choose one to open it.";
  }
  if (isBoardError(error)) return error.message;
  if (error instanceof Error && error.message) {
    return `${"home" in target ? "Your board" : "This board"} could not be opened: ${error.message}`;
  }
  return `${"home" in target ? "Your board" : "This board"} could not be opened.`;
}

async function loadTarget(target: SavedBoardTarget, organizationId: string | null): Promise<LoadedBoard> {
  if ("home" in target) return getHomeBoard(organizationId);
  const board = await getBoard(target.boardId);
  if (!board) {
    throw new BoardError(
      "not_found",
      "This board does not exist, was deleted, or is not shared with you.",
      "Open another board from your boards list.",
    );
  }
  return board;
}

type Phase =
  | { key: string; status: "failed"; reason: string }
  | { key: string; status: "ready"; board: LoadedBoard; title: string };

export function useSavedBoard(target: SavedBoardTarget): SavedBoardState {
  const userId = useAppSelector(selectUserId);
  const selectedOrgId = useAppSelector(selectOrganizationId);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const targetId = "home" in target ? null : target.boardId;
  // The home board is per organization, so switching organization opens that
  // organization's home board. A board by id does not depend on the selection.
  const key = `${userId ?? ""}|${targetId ?? `home:${selectedOrgId ?? ""}`}|${attempt}`;

  // The guard for the next write, outside React state: every save reads and
  // advances it, and a rename / open stamp moves the version too.
  const guard = useRef<{ id: string; version: number; fingerprint: string } | null>(null);
  const blocked = useRef(false);
  const saver = useRef<Autosaver<BoardDocument> | null>(null);
  const touched = useRef<string | null>(null);

  const retry = () => setAttempt((n) => n + 1);

  // ── load ──
  useEffect(() => {
    if (!userId) return; // auth not hydrated yet: stay "loading"
    let alive = true;
    const loadTargetValue: SavedBoardTarget = targetId ? { boardId: targetId } : { home: true };
    loadTarget(loadTargetValue, selectedOrgId).then(
      (board) => {
        if (!alive) return;
        guard.current = { id: board.id, version: board.version, fingerprint: board.fingerprint };
        blocked.current = false;
        setSaveError(null);
        setLastSavedAt(null);
        setPhase({ key, status: "ready", board, title: board.title });
      },
      (error: unknown) => {
        if (!alive) return;
        if (!isOrganizationSelectionCancelled(error)) {
          console.error("[spatial] opening a saved board failed:", error);
        }
        setPhase({ key, status: "failed", reason: describeLoadFailure(error, loadTargetValue) });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, userId, targetId, selectedOrgId]);

  const readyBoardId = phase?.key === key && phase.status === "ready" ? phase.board.id : null;

  // ── stamp "opened" once per open ──
  useEffect(() => {
    if (!readyBoardId || touched.current === key) return;
    touched.current = key;
    touchOpened(readyBoardId).then(
      ({ version }) => {
        if (guard.current?.id === readyBoardId && version > guard.current.version) {
          guard.current = { ...guard.current, version };
        }
      },
      // Not worth a toast — the board is open and saving; only its "last
      // opened" order is stale. Still never silent.
      (error: unknown) => console.warn("[spatial] could not record that the board was opened:", error),
    );
  }, [readyBoardId, key]);

  // ── autosave, per open board ──
  useEffect(() => {
    if (!readyBoardId) return;
    const boardId = readyBoardId;
    const instance = createAutosaver<BoardDocument>({
      delayMs: AUTOSAVE_DELAY_MS,
      write: async (doc) => {
        const g = guard.current;
        if (!g || g.id !== boardId) return;
        const saved = await saveBoardDocument(boardId, doc, {
          expectedVersion: g.version,
          baseFingerprint: g.fingerprint,
        });
        if (guard.current?.id === boardId) {
          guard.current = {
            id: boardId,
            version: Math.max(saved.version, guard.current.version),
            fingerprint: saved.fingerprint,
          };
        }
      },
      onSavingChange: setSaving,
      onSaved: () => {
        setLastSavedAt(Date.now());
        setSaveError(null);
      },
      onError: (error, doc) => {
        const message = isBoardError(error)
          ? error.message
          : `Your board was not saved: ${error instanceof Error ? error.message : String(error)}`;
        setSaveError(message);
        if (isBoardError(error) && error.code === "conflict") {
          blocked.current = true;
          toast.error(message, {
            duration: Infinity,
            action: { label: "Reload board", onClick: retry },
          });
          return;
        }
        if (isBoardError(error) && error.code === "not_found") {
          blocked.current = true;
          toast.error(message, { duration: Infinity });
          return;
        }
        toast.error(message, {
          action: {
            label: "Try again",
            onClick: () => {
              instance.schedule(doc);
              void instance.flush();
            },
          },
        });
      },
    });
    saver.current = instance;
    const onPageHide = () => {
      void instance.flush();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      if (saver.current === instance) saver.current = null;
      // Unmount (or switching boards): whatever is pending still goes out.
      void instance.flush();
    };
  }, [readyBoardId]);

  if (!phase || phase.key !== key) return { state: "loading" };
  if (phase.status === "failed") return { state: "failed", reason: phase.reason, retry };

  const { board, title } = phase;

  const save = (doc: BoardDocument) => {
    if (blocked.current) return; // saving on would overwrite the newer board; the toast offers reload
    saver.current?.schedule(doc);
  };

  const rename = (next: string) => {
    const previous = title;
    const trimmed = next.trim();
    if (!trimmed || trimmed === previous) return;
    setPhase((p) => (p && p.status === "ready" && p.board.id === board.id ? { ...p, title: trimmed } : p));
    renameBoard(board.id, trimmed).then(
      ({ title: saved, version }) => {
        if (guard.current?.id === board.id && version > guard.current.version) {
          guard.current = { ...guard.current, version };
        }
        setPhase((p) => (p && p.status === "ready" && p.board.id === board.id ? { ...p, title: saved } : p));
      },
      (error: unknown) => {
        setPhase((p) => (p && p.status === "ready" && p.board.id === board.id ? { ...p, title: previous } : p));
        toast.error(isBoardError(error) ? error.message : "The board could not be renamed. Try again.");
      },
    );
  };

  return {
    state: "ready",
    board: {
      id: board.id,
      title,
      organizationId: board.organizationId,
      isHome: board.isHome,
      doc: board.doc,
      problems: board.problems,
    },
    save,
    saving,
    lastSavedAt,
    saveError,
    rename,
  };
}
