/**
 * Conversation Focus Slice
 *
 * Tracks which conversationId is "active" for each UI surface.
 * Eliminates the need to prop-drill onNewInstance/setInstanceId callbacks.
 *
 * Each surface has TWO focus slots:
 *   - `display` — what the conversation column / history panel shows
 *   - `input`   — what the smart input / variables panel is bound to
 *
 * In 99% of flows they're the same id. They diverge only when
 * `autoClearConversation` is ON: right after a submit, a fresh conversation
 * is prepped and bound to `input`, while `display` stays on the
 * currently-streaming conversation. On the next submit, `display` is caught
 * up to the streaming id, and a new conversation is prepped for `input`
 * again (see `smart-execute.thunk.ts` → `splitInputIntoNewConversation`).
 *
 * A surfaceKey is a stable string identifying a rendering context:
 *   - "agent-builder"
 *   - "agent-runner:<agentId>"
 *   - "overlay:<overlayId>"
 *   - "chat-assistant:<widgetId>"
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { destroyInstance } from "../conversations/conversations.slice";

export interface SurfaceFocusEntry {
  display: string;
  input: string;
}

export interface ConversationFocusState {
  bySurface: Record<string, SurfaceFocusEntry>;
  /**
   * The surfaceKey whose focus was most recently set. Lets page-agnostic
   * surfaces (e.g. the global Creator Hub opened from the sidebar) resolve
   * "the conversation the user was last actively in" without prop-drilling.
   */
  lastSurfaceKey: string | null;
}

const initialState: ConversationFocusState = {
  bySurface: {},
  lastSurfaceKey: null,
};

const conversationFocusSlice = createSlice({
  name: "conversationFocus",
  initialState,
  reducers: {
    /** Sets BOTH display and input to the same conversationId (the 99% case). */
    setFocus(
      state,
      action: PayloadAction<{ surfaceKey: string; conversationId: string }>,
    ) {
      const { surfaceKey, conversationId } = action.payload;
      state.bySurface[surfaceKey] = {
        display: conversationId,
        input: conversationId,
      };
      state.lastSurfaceKey = surfaceKey;
    },

    /** Updates only the input slot — used by the autoclear split flow. */
    setInputFocus(
      state,
      action: PayloadAction<{ surfaceKey: string; conversationId: string }>,
    ) {
      const { surfaceKey, conversationId } = action.payload;
      const entry = state.bySurface[surfaceKey];
      if (entry) {
        entry.input = conversationId;
      } else {
        state.bySurface[surfaceKey] = {
          display: conversationId,
          input: conversationId,
        };
      }
      state.lastSurfaceKey = surfaceKey;
    },

    /** Updates only the display slot — used when the streaming convo advances. */
    setDisplayFocus(
      state,
      action: PayloadAction<{ surfaceKey: string; conversationId: string }>,
    ) {
      const { surfaceKey, conversationId } = action.payload;
      const entry = state.bySurface[surfaceKey];
      if (entry) {
        entry.display = conversationId;
      } else {
        state.bySurface[surfaceKey] = {
          display: conversationId,
          input: conversationId,
        };
      }
      state.lastSurfaceKey = surfaceKey;
    },

    /** Re-aligns the input slot to the display slot (used when user toggles autoclear OFF). */
    syncInputToDisplay(state, action: PayloadAction<string>) {
      const entry = state.bySurface[action.payload];
      if (entry) {
        entry.input = entry.display;
      }
    },

    clearFocus(state, action: PayloadAction<string>) {
      delete state.bySurface[action.payload];
      if (state.lastSurfaceKey === action.payload) {
        state.lastSurfaceKey = null;
      }
    },
  },

  extraReducers: (builder) => {
    builder.addCase(destroyInstance, (state, action) => {
      const conversationId = action.payload;
      for (const key of Object.keys(state.bySurface)) {
        const entry = state.bySurface[key];
        if (entry.display === conversationId || entry.input === conversationId) {
          delete state.bySurface[key];
          if (state.lastSurfaceKey === key) {
            state.lastSurfaceKey = null;
          }
        }
      }
    });
  },
});

export const {
  setFocus,
  setInputFocus,
  setDisplayFocus,
  syncInputToDisplay,
  clearFocus,
} = conversationFocusSlice.actions;

export default conversationFocusSlice.reducer;
