/**
 * Messaging CHROME state — and nothing else.
 *
 * The conversations, unread counts, active conversation, loading and error
 * state that used to live in `messagingSlice` are `@ai-matrx/messaging`'s now:
 * one store, fed by one engine, on the app's ONE realtime manager. Mirroring
 * any of it back into Redux would be a second copy of live state that drifts
 * the moment a message arrives while the mirror is mid-write — read it with
 * `useMessagingSnapshot()` / `useConversations()` instead.
 *
 * What is genuinely OURS is the app frame: whether this app's messaging side
 * sheet is open, and how wide the user dragged it.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const MESSAGING_SHEET_MIN_WIDTH = 320;
export const MESSAGING_SHEET_MAX_WIDTH = 600;
export const MESSAGING_SHEET_DEFAULT_WIDTH = 400;

interface MessagingUiState {
  isOpen: boolean;
  sheetWidth: number;
}

const initialState: MessagingUiState = {
  isOpen: false,
  sheetWidth: MESSAGING_SHEET_DEFAULT_WIDTH,
};

export const messagingUiSlice = createSlice({
  name: "messagingUi",
  initialState,
  reducers: {
    openMessaging: (state) => {
      state.isOpen = true;
    },
    closeMessaging: (state) => {
      state.isOpen = false;
    },
    toggleMessaging: (state) => {
      state.isOpen = !state.isOpen;
    },
    setMessagingSheetWidth: (state, action: PayloadAction<number>) => {
      state.sheetWidth = Math.min(
        Math.max(action.payload, MESSAGING_SHEET_MIN_WIDTH),
        MESSAGING_SHEET_MAX_WIDTH,
      );
    },
  },
});

export const {
  openMessaging,
  closeMessaging,
  toggleMessaging,
  setMessagingSheetWidth,
} = messagingUiSlice.actions;

interface WithMessagingUi {
  messagingUi: MessagingUiState;
}

export const selectMessagingIsOpen = (state: WithMessagingUi): boolean =>
  state.messagingUi.isOpen;

export const selectMessagingSheetWidth = (state: WithMessagingUi): number =>
  state.messagingUi.sheetWidth;

export default messagingUiSlice.reducer;
