/**
 * features/war-room/redux/watchSlice.ts
 *
 * Ephemeral UI state for the War Room MASTER agent's LIVE-WATCH layer.
 *
 * When the master agent messages a thread (war_room_message_thread) it opens a
 * watch window on the new conversation so the user SEES the thread agent's reply
 * stream in real time and can step in. The toast "Watch" action does the same.
 * This slice is the single source of truth for "which conversations have a watch
 * window open" — `MasterWatchLayer` (mounted in `WarRoomAllView`) renders one
 * inline `WindowPanel` per id.
 *
 * Why Redux (not local React state on the view): the OPENER is a Redux thunk
 * (the master tool dispatcher + the toast action callback), which has no handle
 * to the view's `useState`. A tiny slice lets any dispatch open/close a watch
 * window. Pure ephemeral UI — nothing here is persisted.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

export interface WarRoomWatchState {
  /** Conversation ids that currently have a live-watch window open. */
  openConversationIds: string[];
}

const initialState: WarRoomWatchState = {
  openConversationIds: [],
};

const warRoomWatchSlice = createSlice({
  name: "warRoomWatch",
  initialState,
  reducers: {
    /** Open a watch window for a conversation (idempotent — no duplicates). */
    openWatch(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (!id) return;
      if (!state.openConversationIds.includes(id)) {
        state.openConversationIds.push(id);
      }
    },
    /** Close a conversation's watch window. */
    closeWatch(state, action: PayloadAction<string>) {
      state.openConversationIds = state.openConversationIds.filter(
        (cid) => cid !== action.payload,
      );
    },
    /** Close every watch window (e.g. leaving the /all view). */
    closeAllWatches(state) {
      state.openConversationIds = [];
    },
  },
});

export const { openWatch, closeWatch, closeAllWatches } =
  warRoomWatchSlice.actions;

export default warRoomWatchSlice.reducer;

// ── Selectors ─────────────────────────────────────────────────────────────

const EMPTY_IDS: string[] = [];

/** All conversation ids with an open watch window. */
export const selectWatchConversationIds = (state: RootState): string[] =>
  state.warRoomWatch?.openConversationIds ?? EMPTY_IDS;
