// features/war-room/redux/thunks.ts
//
// Async thunks bridging the warRoom slice and Supabase via service.ts.
// Optimistic where it helps; loud (toast) on failure.

import { toast } from "sonner";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import * as service from "../service";
import type {
  CreateSessionInput,
  CreateTileInput,
  TileTab,
  WarRoomSession,
  WarRoomTile,
} from "../types";
import {
  audioSessionsLoadedForTile,
  clearSessionTiles,
  sessionRemoved,
  sessionsLoaded,
  sessionUpserted,
  setActiveSession,
  setListError,
  setListStatus,
  setTileActiveTab,
  setTileHidden,
  setTilePinned,
  setTilesStatus,
  setTileSaveState,
  tileRemoved,
  tilesLoadedForSession,
  tileUpserted,
} from "./slice";

// ── Sessions ──────────────────────────────────────────────────────────

export const loadSessionsList = () => async (dispatch: AppDispatch) => {
  dispatch(setListStatus("loading"));
  try {
    const sessions = await service.listSessions();
    dispatch(sessionsLoaded(sessions));
    return sessions;
  } catch (err) {
    dispatch(setListError(err instanceof Error ? err.message : "Failed to load"));
    toast.error("Couldn't load your War Rooms");
    return [];
  }
};

export const createWarRoomSession =
  (input: CreateSessionInput = {}) =>
  async (dispatch: AppDispatch): Promise<WarRoomSession | null> => {
    try {
      const session = await service.createSession(input);
      dispatch(sessionUpserted(session));
      return session;
    } catch {
      toast.error("Couldn't create the War Room");
      return null;
    }
  };

export const renameSession =
  (id: string, title: string) => async (dispatch: AppDispatch) => {
    try {
      const session = await service.updateSession(id, { title });
      dispatch(sessionUpserted(session));
    } catch {
      toast.error("Couldn't rename the War Room");
    }
  };

export const deleteSession = (id: string) => async (dispatch: AppDispatch) => {
  // Optimistic removal — revert by reload on failure.
  dispatch(sessionRemoved(id));
  try {
    await service.softDeleteSession(id);
    toast.success("War Room deleted");
  } catch {
    toast.error("Couldn't delete the War Room");
    dispatch(loadSessionsList());
  }
};

/** Load one room fully: session + tiles + audio links, set active, bump opened. */
export const loadWarRoomSession =
  (id: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(setActiveSession(id));
    dispatch(setTilesStatus({ sessionId: id, status: "loading" }));
    try {
      const existing = getState().warRoom.sessionsById[id];
      const [session, tiles, audioLinks] = await Promise.all([
        existing ? Promise.resolve(existing) : service.getSession(id),
        service.listTiles(id),
        service.listSessionAudioLinks(id),
      ]);

      if (!session) {
        dispatch(setTilesStatus({ sessionId: id, status: "error" }));
        toast.error("War Room not found");
        return null;
      }

      dispatch(sessionUpserted(session));
      dispatch(tilesLoadedForSession({ sessionId: id, tiles }));

      // Group audio links per tile.
      const byTile = new Map<
        string,
        { ids: string[]; activeId: string | null }
      >();
      for (const link of audioLinks) {
        const entry = byTile.get(link.tile_id) ?? { ids: [], activeId: null };
        entry.ids.push(link.studio_session_id);
        if (link.is_active) entry.activeId = link.studio_session_id;
        byTile.set(link.tile_id, entry);
      }
      for (const [tileId, { ids, activeId }] of byTile) {
        dispatch(
          audioSessionsLoadedForTile({
            tileId,
            studioSessionIds: ids,
            activeId: activeId ?? ids[0] ?? null,
          }),
        );
      }

      void service.touchSessionOpened(id);
      return session;
    } catch (err) {
      console.error("[war-room] loadWarRoomSession failed:", err);
      dispatch(setTilesStatus({ sessionId: id, status: "error" }));
      toast.error("Couldn't open the War Room");
      return null;
    }
  };

export const leaveWarRoomSession =
  (id: string) => (dispatch: AppDispatch) => {
    dispatch(clearSessionTiles(id));
    dispatch(setActiveSession(null));
  };

// ── Tiles ─────────────────────────────────────────────────────────────

export const createTile =
  (input: CreateTileInput) =>
  async (dispatch: AppDispatch): Promise<WarRoomTile | null> => {
    try {
      const tile = await service.createTile(input);
      dispatch(tileUpserted(tile));
      return tile;
    } catch {
      toast.error("Couldn't create the tile");
      return null;
    }
  };

export const deleteTile =
  (id: string, sessionId: string) => async (dispatch: AppDispatch) => {
    dispatch(tileRemoved({ id, sessionId }));
    try {
      await service.softDeleteTile(id);
    } catch {
      toast.error("Couldn't remove the tile");
    }
  };

export const setTileActiveTabPersisted =
  (id: string, tab: TileTab) => async (dispatch: AppDispatch) => {
    dispatch(setTileActiveTab({ id, tab }));
    try {
      await service.updateTile(id, { active_tab: tab });
    } catch {
      /* tab is a soft preference; swallow */
    }
  };

export const toggleTilePin =
  (id: string, pinned: boolean) => async (dispatch: AppDispatch) => {
    dispatch(setTilePinned({ id, pinned }));
    try {
      await service.updateTile(id, { is_pinned: pinned });
    } catch {
      toast.error("Couldn't update pin");
      dispatch(setTilePinned({ id, pinned: !pinned }));
    }
  };

export const toggleTileHide =
  (id: string, hidden: boolean) => async (dispatch: AppDispatch) => {
    dispatch(setTileHidden({ id, hidden }));
    try {
      await service.updateTile(id, { is_hidden: hidden });
    } catch {
      toast.error("Couldn't update tile");
      dispatch(setTileHidden({ id, hidden: !hidden }));
    }
  };

export const persistTilePositions =
  (updates: { id: string; position: number }[]) =>
  async (_dispatch: AppDispatch) => {
    try {
      await service.persistTilePositions(updates);
    } catch {
      toast.error("Couldn't save tile order");
    }
  };

export { setTileSaveState };
