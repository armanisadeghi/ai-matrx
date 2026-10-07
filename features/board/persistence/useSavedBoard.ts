"use client";

// features/board/persistence/useSavedBoard.ts
//
// Open a saved board (one by id, or a meeting's) and keep it
// saved. The board page renders from `board.doc` and reports every change to
// `save(build)` — a function that builds the document, called only when a
// write actually goes out (a drag reports every pointer frame; building the
// whole document per frame was the cost). This hook debounces (~800ms),
// guards each write with the row's `version`, and flushes on unmount, and the
// moment the page is hidden or closing (`visibilitychange` → hidden, then
// `pagehide`) as a `keepalive` request, so the last edits survive closing
// the tab.
//
// The camera is NOT board content: `board.viewerCamera` is this person's own
// last view of this board (`viewerCamera.ts`) and `saveCamera` keeps it. Two
// tabs panning never conflict.
//
// Nothing fails silently: a failed load is `failed` with a retry, a failed save
// sets `saveError` AND raises a toast naming what happened. A save refused
// because another tab changed the board's CONTENT stops autosave for this tab
// (writing on would overwrite the newer board); the byline keeps saying so and
// the toast stays until "Reload board" reopens the newer version, which
// resumes saving.

import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectAccessToken, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";
import type { Camera } from "../engine/camera";
import type { BoardDocument } from "../board/document";
import { createAutosaver, type Autosaver } from "./autosave";
import {
  BoardError,
  getBoard,
  getMeetingBoard,
  getPendingCreate,
  settlePendingCreate,
  isBoardError,
  renameBoard,
  saveBoardDocument,
  touchOpened,
  type LoadedBoard,
} from "./boardsService";
import { readViewerCamera, writeViewerCamera } from "./viewerCamera";

export const AUTOSAVE_DELAY_MS = 800;

/** How long "Opening your board…" may wait before it says so and offers a retry. */
export const OPEN_TIMEOUT_MS = 20_000;

export type SavedBoardTarget =
  | { boardId: string }
  /** The person's board for one meeting, created with `seed` the first time. */
  | { meeting: { id: string; title: string; seed: () => BoardDocument } };

function targetKeyOf(target: SavedBoardTarget): string {
  if ("boardId" in target) return `board:${target.boardId}`;
  return `meeting:${target.meeting.id}`;
}

export type SavedBoardState =
  | { state: "loading" }
  | { state: "failed"; reason: string; retry: () => void }
  | {
      state: "ready";
      board: {
        id: string;
        title: string;
        organizationId: string;
        doc: BoardDocument;
        problems: string[];
        /** Where this person last looked at this board, or null (open to fit everything). */
        viewerCamera: Camera | null;
      };
      /** Debounced autosave (~800ms); last write wins within the tab. Pass a
       * builder to defer building the document until the write goes out. */
      save: (doc: BoardDocument | (() => BoardDocument)) => void;
      /** Keep this person's view of this board (not board content; never conflicts). */
      saveCamera: (camera: Camera) => void;
      saving: boolean;
      lastSavedAt: number | null;
      saveError: string | null;
      rename: (title: string) => void;
    };

/** Words for a failure, for a person. Exported for tests. */
export function describeLoadFailure(error: unknown): string {
  if (isOrganizationSelectionCancelled(error)) {
    return "Your board lives in a workspace. Choose one to open it.";
  }
  if (isBoardError(error)) return error.message;
  if (error instanceof Error && error.message) {
    return `This board could not be opened: ${error.message}`;
  }
  return `This board could not be opened.`;
}

async function loadTarget(target: SavedBoardTarget, organizationId: string | null): Promise<LoadedBoard> {
  if ("meeting" in target) {
    return getMeetingBoard({
      meetingId: target.meeting.id,
      title: target.meeting.title,
      organizationId,
      seed: target.meeting.seed(),
    });
  }
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
  | { key: string; status: "ready"; board: LoadedBoard; title: string; viewerCamera: Camera | null };

export function useSavedBoard(target: SavedBoardTarget): SavedBoardState {
  const userId = useAppSelector(selectUserId);
  // The final save as the page hides or closes goes out as a keepalive
  // request, which needs the token in hand synchronously.
  const accessToken = useAppSelector(selectAccessToken);
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);
  // org-filter: default-for-new the organization a NEW meeting board is filed in; never picks which board opens
  const selectedOrgId = useAppSelector(selectOrganizationId);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // A board is the person's own, in any organization: switching the
  // active organization never swaps it (the active org only says where a NEW one is filed).
  const targetKey = targetKeyOf(target);
  const key = `${userId ?? ""}|${targetKey}|${attempt}`;
  // The load reads the target the key was made from (a meeting's title and seed are not part
  // of which board opens).
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });

  // The guard for the next write, outside React state: every save reads and
  // advances it, and a rename / open stamp moves the version too.
  // `base` is the document this tab last knew the stored board to hold (what it loaded, then what
  // it last wrote): the common ancestor a save merges another tab's changes against.
  const guard = useRef<{ id: string; version: number; fingerprint: string; base: BoardDocument } | null>(null);
  const blocked = useRef(false);
  const saver = useRef<Autosaver<() => BoardDocument> | null>(null);
  const conflictToast = useRef<string | number | null>(null);
  const touched = useRef<string | null>(null);
  // A board this tab just minted (optimistic "New board"): the page shows it at once while the
  // insert lands. Saves wait for the landing; a failed landing is the page's `failed` state with Retry.
  const landing = useRef<Promise<unknown> | null>(null);
  const landingFailed = useRef(false);

  const retry = () => {
    if (conflictToast.current != null) toast.dismiss(conflictToast.current);
    conflictToast.current = null;
    setAttempt((n) => n + 1);
  };

  // ── load ──
  useEffect(() => {
    // Never wait silently: a fetch or sign-in that never answers becomes a failed state with Try
    // again. A late answer still wins (the load below overwrites this).
    const slow = setTimeout(() => {
      setPhase((cur) =>
        cur?.key === key
          ? cur
          : {
              key,
              status: "failed",
              reason: userId
                ? "Opening this board is taking much longer than it should."
                : "Still waiting for you to be signed in.",
            },
      );
    }, OPEN_TIMEOUT_MS);
    if (!userId) return () => clearTimeout(slow); // auth not hydrated yet: stay "loading" (bounded)
    let alive = true;
    const loadTargetValue = targetRef.current;
    const pending = "boardId" in loadTargetValue ? getPendingCreate(loadTargetValue.boardId) : undefined;
    if (pending) {
      // Optimistic open: the empty board renders now; the insert lands in the background.
      const first = pending.board;
      guard.current = { id: first.id, version: first.version, fingerprint: first.fingerprint, base: first.doc };
      blocked.current = false;
      setSaveError(null);
      setLastSavedAt(null);
      setPhase({ key, status: "ready", board: first, title: first.title, viewerCamera: readViewerCamera(userId, first.id) });
      const run = landingFailed.current ? pending.retry() : pending.promise;
      landingFailed.current = false;
      const done = run.then(
        (row) => {
          settlePendingCreate(first.id);
          if (alive && guard.current?.id === first.id) {
            guard.current = { ...guard.current, version: row.version, fingerprint: row.fingerprint };
          }
        },
        (error: unknown) => {
          landingFailed.current = true;
          console.error("[board] creating the new board failed:", error);
          if (!alive) return;
          setPhase({
            key,
            status: "failed",
            reason: isBoardError(error)
              ? error.message
              : `The new board could not be created: ${error instanceof Error ? error.message : String(error)}`,
          });
        },
      );
      landing.current = done;
      return () => {
        alive = false;
        clearTimeout(slow);
      };
    }
    loadTarget(loadTargetValue, selectedOrgId).then( // org-filter: default-for-new the active organization only files a NEW meeting board; it never picks which board opens
      (board) => {
        if (!alive) return;
        guard.current = { id: board.id, version: board.version, fingerprint: board.fingerprint, base: board.doc };
        blocked.current = false;
        setSaveError(null);
        setLastSavedAt(null);
        setPhase({ key, status: "ready", board, title: board.title, viewerCamera: readViewerCamera(userId, board.id) });
      },
      (error: unknown) => {
        if (!alive) return;
        if (!isOrganizationSelectionCancelled(error)) {
          console.error("[board] opening a saved board failed:", error);
        }
        setPhase({ key, status: "failed", reason: describeLoadFailure(error) });
      },
    );
    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, [key, userId]); // selectedOrgId: read at load only, as the write target for a new meeting board

  const readyBoardId = phase?.key === key && phase.status === "ready" ? phase.board.id : null;

  // ── stamp "opened" once per open ──
  useEffect(() => {
    if (!readyBoardId || touched.current === key) return;
    // A board still being created already carries its opened stamp (the insert sets it).
    if (getPendingCreate(readyBoardId)) return;
    touched.current = key;
    touchOpened(readyBoardId).then(
      ({ version }) => {
        if (guard.current?.id === readyBoardId && version > guard.current.version) {
          guard.current = { ...guard.current, version };
        }
      },
      // Not worth a toast — the board is open and saving; only its "last
      // opened" order is stale. Still never silent.
      (error: unknown) => console.warn("[board] could not record that the board was opened:", error),
    );
  }, [readyBoardId, key]);

  // ── autosave, per open board ──
  useEffect(() => {
    if (!readyBoardId) return;
    const boardId = readyBoardId;
    const instance = createAutosaver<() => BoardDocument>({
      delayMs: AUTOSAVE_DELAY_MS,
      write: async (build, { urgent }) => {
        // A new board's first save waits for its row (a keepalive flush cannot wait: it goes out as is).
        if (landing.current && !urgent) await landing.current;
        if (landingFailed.current) throw new BoardError("not_found", "This new board was not created yet, so it could not be saved.", "Use Try again to create it.");
        const g = guard.current;
        if (!g || g.id !== boardId) return;
        const token = accessTokenRef.current;
        const built = build();
        const saved = await saveBoardDocument(
          boardId,
          built,
          { expectedVersion: g.version, baseFingerprint: g.fingerprint, base: g.base },
          urgent && token ? { keepalive: { accessToken: token } } : undefined,
        );
        if (guard.current?.id === boardId) {
          guard.current = {
            id: boardId,
            version: Math.max(saved.version, guard.current.version),
            fingerprint: saved.fingerprint,
            // What THIS tab holds (not the merge): the next save carries only this tab's own
            // changes on top of whatever is stored, so another tab's tiles are never undone.
            base: built,
          };
        }
        // Another tab's changes were merged in. Say so only when both tabs changed the SAME
        // tile and this tab's version was kept; a clean merge needs no words.
        if (saved.merged && saved.merged.conflicts > 0) {
          toast.warning(
            `Another tab changed ${saved.merged.conflicts === 1 ? "a tile" : `${saved.merged.conflicts} tiles`} you also changed here. Yours was kept.`,
          );
        }
      },
      onSavingChange: setSaving,
      onSaved: () => {
        setLastSavedAt(Date.now());
        setSaveError(null);
      },
      onError: (error, build) => {
        const message = isBoardError(error)
          ? error.message
          : `Your board was not saved: ${error instanceof Error ? error.message : String(error)}`;
        setSaveError(message);
        if (isBoardError(error) && error.code === "conflict") {
          blocked.current = true;
          conflictToast.current = toast.error(message, {
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
              instance.schedule(build);
              void instance.flush();
            },
          },
        });
      },
    });
    saver.current = instance;
    // The page is hidden (tab switch, minimise — and the first step of closing
    // a tab) or closing: send what is pending NOW, as a keepalive request.
    // `visibilitychange` comes before `pagehide` and with time to spare; an
    // ordinary request still in flight at unload is cancelled by the browser.
    const sendNow = () => {
      void instance.flush({ urgent: true });
    };
    // Truly leaving: a write still in flight would be cancelled, so the newest
    // value goes out beside it (autosave `leaving`).
    const leaveNow = () => {
      void instance.flush({ urgent: true, leaving: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leaveNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leaveNow);
      if (saver.current === instance) saver.current = null;
      // Unmount (or switching boards): whatever is pending still goes out.
      void instance.flush();
    };
  }, [readyBoardId]);

  if (!phase || phase.key !== key) return { state: "loading" };
  if (phase.status === "failed") return { state: "failed", reason: phase.reason, retry };

  const { board, title, viewerCamera } = phase;

  const save = (doc: BoardDocument | (() => BoardDocument)) => {
    if (blocked.current) return; // saving on would overwrite the newer board; the toast offers reload
    saver.current?.schedule(typeof doc === "function" ? doc : () => doc);
  };

  const saveCamera = (camera: Camera) => {
    if (userId) writeViewerCamera(userId, board.id, camera);
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
      doc: board.doc,
      problems: board.problems,
      viewerCamera,
    },
    save,
    saveCamera,
    saving,
    lastSavedAt,
    saveError,
    rename,
  };
}
