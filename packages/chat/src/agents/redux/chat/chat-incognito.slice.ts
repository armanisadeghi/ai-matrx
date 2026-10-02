import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

interface ChatIncognitoState {
  isActive: boolean;
}

const initialState: ChatIncognitoState = {
  isActive: false,
};

const chatIncognitoSlice = createSlice({
  name: "chatIncognito",
  initialState,
  reducers: {
    setChatIncognitoActive(state, action: PayloadAction<boolean>) {
      state.isActive = action.payload;
    },
    toggleChatIncognito(state) {
      state.isActive = !state.isActive;
    },
  },
});

export const { setChatIncognitoActive, toggleChatIncognito } =
  chatIncognitoSlice.actions;

export default chatIncognitoSlice.reducer;

export const selectChatIncognitoActive = (state: RootState): boolean =>
  state.chatIncognito.isActive;
