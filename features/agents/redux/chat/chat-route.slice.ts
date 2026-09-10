import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

interface ChatRouteState {
  /** Bumped when the user explicitly starts a new chat (+). Drives reminting
   *  on fresh routes even when the URL stays on `/chat/new`. */
  freshSessionNonce: number;
}

const initialState: ChatRouteState = {
  freshSessionNonce: 0,
};

const chatRouteSlice = createSlice({
  name: "chatRoute",
  initialState,
  reducers: {
    bumpFreshSession(state) {
      state.freshSessionNonce += 1;
    },
  },
});

export const { bumpFreshSession } = chatRouteSlice.actions;

export default chatRouteSlice.reducer;

export const selectChatFreshSessionNonce = (state: RootState): number =>
  state.chatRoute.freshSessionNonce;
