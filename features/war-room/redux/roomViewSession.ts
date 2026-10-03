// features/war-room/redux/roomViewSession.ts
//
// A room on screen is a SESSION with the server — never a side effect of a
// component mounting (THE REMOUNT LAW, Arman 2026-10-02: every screen survives
// hide / show / remount with no lost work and no repeated side effects).
//
// Every place that shows a room holds a VIEW of it: the room route, each board
// tile showing it (its body and its `Keep`), anything else that renders it.
// Views are counted per room:
//
//   - the FIRST view opens the session: the room is read into the store once
//     (`hydrateWarRoomSession`, shared by every view) and "opened" is recorded
//     on the server once (`touchSessionOpened` → `last_opened_at`);
//   - later views join the open session — no read, no "opened", no skeleton;
//   - the LAST view leaving starts a grace window; a view arriving inside it
//     (a remount, a tile woken from sleep, remove + undo, React's dev double
//     mount) keeps the session as if nothing happened;
//   - the grace running out closes the session. The room's data stays in the
//     store keyed by room, so a later open paints at once and refreshes in
//     place.
//
// Release is idempotent: a release function called twice releases once.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import * as service from "../service";
import { setActiveSession } from "./slice";
import { hydrateWarRoomSession } from "./thunks";

/** How long a room's session outlives its last view (remount / undo window). */
export const ROOM_VIEW_CLOSE_GRACE_MS = 15_000;

interface RoomSession {
  views: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

/** One registry per store (the dispatch identity), so stores never share sessions. */
const sessionsByStore = new WeakMap<AppDispatch, Map<string, RoomSession>>();

function sessionsFor(dispatch: AppDispatch): Map<string, RoomSession> {
  let sessions = sessionsByStore.get(dispatch);
  if (!sessions) {
    sessions = new Map();
    sessionsByStore.set(dispatch, sessions);
  }
  return sessions;
}

/** Number of views holding a room's session right now (0 = closed or closing). */
export function roomViewCount(dispatch: AppDispatch, roomId: string): number {
  return sessionsFor(dispatch).get(roomId)?.views ?? 0;
}

/**
 * Hold a view of one room. Returns the release. Opening the session (the one
 * read and the one "opened" stamp) happens only for the first view.
 */
export const openRoomView =
  (roomId: string) =>
  (dispatch: AppDispatch): (() => void) => {
    const sessions = sessionsFor(dispatch);
    let session = sessions.get(roomId);
    if (session) {
      session.views += 1;
      if (session.closeTimer !== null) {
        clearTimeout(session.closeTimer);
        session.closeTimer = null;
      }
    } else {
      session = { views: 1, closeTimer: null };
      sessions.set(roomId, session);
      void dispatch(hydrateWarRoomSession(roomId));
      void service.touchSessionOpened(roomId);
    }

    const held = session;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      held.views -= 1;
      if (held.views > 0) return;
      held.closeTimer = setTimeout(() => {
        held.closeTimer = null;
        if (held.views === 0 && sessions.get(roomId) === held) {
          sessions.delete(roomId);
        }
      }, ROOM_VIEW_CLOSE_GRACE_MS);
    };
  };

/**
 * The room ROUTE: the room becomes THE active room for as long as the route
 * shows it, and the route holds a view like any other surface. Returns the
 * release (leaving the route clears the active room only if it is still this
 * one; the room's data stays for every other view).
 */
export const enterWarRoom =
  (roomId: string) =>
  (dispatch: AppDispatch, getState: () => RootState): (() => void) => {
    dispatch(setActiveSession(roomId));
    const release = dispatch(openRoomView(roomId));
    return () => {
      release();
      if (getState().warRoom.activeSessionId === roomId) {
        dispatch(setActiveSession(null));
      }
    };
  };
