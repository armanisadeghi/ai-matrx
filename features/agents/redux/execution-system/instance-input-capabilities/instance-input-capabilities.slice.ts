/**
 * Per-instance frontend input capabilities.
 *
 * This state is deliberately separate from instanceModelOverrides:
 * - it controls frontend attachment affordances;
 * - it is persisted under conversation metadata;
 * - it is NEVER serialized as Python `config_overrides`.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { UiGates } from "@/lib/redux/slices/agent-settings/ui-gates";
import { destroyInstance } from "../conversations/conversations.slice";
import { createInstanceFull } from "../create-instance-full";

export interface InstanceInputCapabilitiesEntry {
  conversationId: string;
  base: UiGates;
  overrides: Partial<UiGates>;
  persistence: "clean" | "pending" | "error";
  persistenceError?: string;
}

export interface InstanceInputCapabilitiesState {
  byConversationId: Record<string, InstanceInputCapabilitiesEntry>;
}

const initialState: InstanceInputCapabilitiesState = {
  byConversationId: {},
};

const instanceInputCapabilitiesSlice = createSlice({
  name: "instanceInputCapabilities",
  initialState,
  reducers: {
    initInputCapabilities(
      state,
      action: PayloadAction<{ conversationId: string; base?: UiGates; overrides?: Partial<UiGates> }>,
    ) {
      state.byConversationId[action.payload.conversationId] = {
        conversationId: action.payload.conversationId,
        base: action.payload.base ?? {},
        overrides: action.payload.overrides ?? {},
        persistence: "clean",
      };
    },
    setInputCapabilityOverride(
      state,
      action: PayloadAction<{
        conversationId: string;
        key: keyof UiGates;
        value: boolean;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (!entry) return;
      entry.overrides[action.payload.key] = action.payload.value;
      entry.persistence = "pending";
      delete entry.persistenceError;
    },
    resetInputCapabilityOverride(
      state,
      action: PayloadAction<{ conversationId: string; key: keyof UiGates }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (!entry) return;
      delete entry.overrides[action.payload.key];
      entry.persistence = "pending";
      delete entry.persistenceError;
    },
    resetAllInputCapabilityOverrides(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (!entry) return;
      entry.overrides = {};
      entry.persistence = "pending";
      delete entry.persistenceError;
    },
    updateBaseInputCapabilities(
      state,
      action: PayloadAction<{ conversationId: string; base: UiGates }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) entry.base = action.payload.base;
    },
    markInputCapabilitiesPersisted(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (!entry) return;
      entry.persistence = "clean";
      delete entry.persistenceError;
    },
    markInputCapabilitiesPersistenceError(
      state,
      action: PayloadAction<{ conversationId: string; error: string }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (!entry) return;
      entry.persistence = "error";
      entry.persistenceError = action.payload.error;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(createInstanceFull, (state, action) => {
      const { conversationId, inputCapabilities } = action.payload;
      state.byConversationId[conversationId] = {
        conversationId,
        base: inputCapabilities?.base ?? {},
        overrides: inputCapabilities?.overrides ?? {},
        persistence: "clean",
      };
    });
    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
    });
  },
});

export const {
  initInputCapabilities,
  setInputCapabilityOverride,
  resetInputCapabilityOverride,
  resetAllInputCapabilityOverrides,
  updateBaseInputCapabilities,
  markInputCapabilitiesPersisted,
  markInputCapabilitiesPersistenceError,
} = instanceInputCapabilitiesSlice.actions;

export default instanceInputCapabilitiesSlice.reducer;
