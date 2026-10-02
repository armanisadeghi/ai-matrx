"use client";

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface AgentAssistantMarkdownDraftEntry {
  conversationId: string;
  messageKey: string;
  baseContent: string;
  draftContent: string;
  updatedAt: number;
}

export interface AgentAssistantMarkdownDraftState {
  entries: Record<string, AgentAssistantMarkdownDraftEntry>;
  lastUpdatedKey: string | null;
}

const initialState: AgentAssistantMarkdownDraftState = {
  entries: {},
  lastUpdatedKey: null,
};

export function assistantMarkdownDraftKey(
  conversationId: string,
  messageKey: string,
): string {
  return `${conversationId}::${messageKey}`;
}

export const agentAssistantMarkdownDraftSlice = createSlice({
  name: "agentAssistantMarkdownDraft",
  initialState,
  reducers: {
    upsertAssistantMarkdownDraft(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageKey: string;
        baseContent: string;
        draftContent: string;
      }>,
    ) {
      const { conversationId, messageKey, baseContent, draftContent } =
        action.payload;
      const key = assistantMarkdownDraftKey(conversationId, messageKey);
      state.entries[key] = {
        conversationId,
        messageKey,
        baseContent,
        draftContent,
        updatedAt: Date.now(),
      };
      state.lastUpdatedKey = key;
    },
    clearAssistantMarkdownDrafts(state) {
      state.entries = {};
      state.lastUpdatedKey = null;
    },
  },
});

export const { upsertAssistantMarkdownDraft, clearAssistantMarkdownDrafts } =
  agentAssistantMarkdownDraftSlice.actions;

type WithMarkdownDraft = {
  agentAssistantMarkdownDraft: AgentAssistantMarkdownDraftState;
};

export const selectAgentAssistantMarkdownDraftState = (
  state: WithMarkdownDraft,
) => state.agentAssistantMarkdownDraft;

export const selectLatestAssistantMarkdownDraft = (
  state: WithMarkdownDraft,
): AgentAssistantMarkdownDraftEntry | null => {
  const { entries, lastUpdatedKey } = state.agentAssistantMarkdownDraft;
  if (!lastUpdatedKey || !entries[lastUpdatedKey]) return null;
  return entries[lastUpdatedKey];
};

export default agentAssistantMarkdownDraftSlice.reducer;
