"use client";

// features/war-room/components/room/useActiveTileRestore.ts
//
// Wires the focused-thread RESTORE behaviour on top of the EPHEMERAL staged-tile
// view state (roomViewContext) WITHOUT moving that state into Redux/persistence.
// The staged tile stays a per-mount React-context value by design; this hook only
// MIRRORS it to/from ctx_war_room_sessions.active_tile_id so a room reopens on the
// thread you last had focused:
//
//   • SEED   — once, when the session first loads, adopt session.active_tile_id as
//     the initial staged tile (only if the user hasn't already chosen one this
//     mount, and only if that tile is still a real visible thread).
//   • PERSIST — when the resolved staged tile changes, write it back, debounced so
//     rapid thread-switching can't thrash the DB. The persist thunk is itself a
//     no-op when the row already matches.
//
// Mounted once by WarRoomShellInner (inside RoomViewProvider). Reads the same
// inputs StageView/Gallery use, so the persisted id always equals the tile the
// user is actually looking at.

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrderedGalleryTileIds,
  selectSessionById,
} from "@/features/war-room/redux/selectors";
import { persistActiveTile } from "@/features/war-room/redux/thunks";
import { useRoomView, resolveStagedId } from "./roomViewContext";

/** Debounce window for active_tile_id writes (ms) — long enough to coalesce a
 *  burst of thread switches, short enough that a reopen feels current. */
const PERSIST_DEBOUNCE_MS = 800;

export function useActiveTileRestore(sessionId: string) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSessionById(sessionId));
  const visibleIds = useAppSelector(selectOrderedGalleryTileIds(sessionId));
  const { chosenStageId, setChosenStageId } = useRoomView();

  const seededRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── SEED ──────────────────────────────────────────────────────────────
  // Adopt the persisted active tile as the initial Stage, once, after tiles
  // exist. Guard with seededRef so it fires exactly once per mount; never
  // override an explicit user choice made before tiles loaded.
  useEffect(() => {
    if (seededRef.current) return;
    if (!session) return;
    if (visibleIds.length === 0) return; // wait for tiles
    seededRef.current = true;
    const persisted = session.active_tile_id;
    if (chosenStageId) return; // user already chose this mount
    if (persisted && visibleIds.includes(persisted)) {
      setChosenStageId(persisted);
    }
  }, [session, visibleIds, chosenStageId, setChosenStageId]);

  // ── PERSIST ───────────────────────────────────────────────────────────
  // Mirror the RESOLVED staged tile (what the user is actually viewing) back to
  // the row, debounced. Only after the seed pass so we don't immediately rewrite
  // the value we just read.
  const resolvedStagedId = resolveStagedId(chosenStageId, visibleIds);
  useEffect(() => {
    if (!seededRef.current) return;
    if (!session) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void dispatch(persistActiveTile(sessionId, resolvedStagedId));
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resolvedStagedId, sessionId, session, dispatch]);
}
