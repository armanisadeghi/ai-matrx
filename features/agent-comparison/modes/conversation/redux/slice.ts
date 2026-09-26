/**
 * Conversation-mode slice. The battle is one source conversation and its
 * durable server forks; this holds which forks are on screen so the battle can
 * be saved, reopened by URL, and read by the shared surfaces (rank picker,
 * runs table, Alchemy) like every other mode.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ConversationBattleFork,
  ConversationBattleSource,
  ConversationBattleState,
} from "../types";

const initialState: ConversationBattleState = {
  source: null,
  forks: [],
  nextForkNumber: 1,
  activeSetId: null,
  activeSetName: null,
};

const slice = createSlice({
  name: "agentComparisonConversation",
  initialState,
  reducers: {
    setConversationBattleSource(
      state,
      action: PayloadAction<ConversationBattleSource | null>,
    ) {
      state.source = action.payload;
    },
    reserveForkNumbers(state, action: PayloadAction<number>) {
      state.nextForkNumber += action.payload;
    },
    addConversationForks(
      state,
      action: PayloadAction<ConversationBattleFork[]>,
    ) {
      state.forks.push(...action.payload);
    },
    removeConversationFork(state, action: PayloadAction<{ columnId: string }>) {
      state.forks = state.forks.filter(
        (f) => f.columnId !== action.payload.columnId,
      );
    },
    setConversationForkLoadError(
      state,
      action: PayloadAction<{ columnId: string; loadError: string | null }>,
    ) {
      const fork = state.forks.find(
        (f) => f.columnId === action.payload.columnId,
      );
      if (!fork) return;
      if (action.payload.loadError) fork.loadError = action.payload.loadError;
      else delete fork.loadError;
    },
    setConversationForks(
      state,
      action: PayloadAction<{
        forks: ConversationBattleFork[];
        nextForkNumber: number;
      }>,
    ) {
      state.forks = action.payload.forks;
      state.nextForkNumber = action.payload.nextForkNumber;
    },
    setActiveConversationSet(
      state,
      action: PayloadAction<{ id: string; name: string } | null>,
    ) {
      state.activeSetId = action.payload?.id ?? null;
      state.activeSetName = action.payload?.name ?? null;
    },
    resetConversationBattle() {
      return initialState;
    },
  },
});

export const {
  setConversationBattleSource,
  reserveForkNumbers,
  addConversationForks,
  removeConversationFork,
  setConversationForkLoadError,
  setConversationForks,
  setActiveConversationSet,
  resetConversationBattle,
} = slice.actions;

export default slice.reducer;
