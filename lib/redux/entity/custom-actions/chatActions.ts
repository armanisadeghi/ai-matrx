/** @deprecated Legacy entity chat actions — compile-only tombstone. */

import { createAsyncThunk } from "@reduxjs/toolkit";

const legacyResolved = createAsyncThunk("legacyChat/resolved", async () => ({}));

function noopSync<T = unknown>(type: string) {
  return (payload?: T) => ({ type, payload });
}

function noopAsync(type: string) {
  const thunk = () => legacyResolved();
  thunk.unwrap = () => Promise.resolve({});
  void type;
  return thunk;
}

export function getChatActionsWithThunks() {
  return {
    initialize: noopSync("legacyChat/initialize"),
    fetchMessagesForActiveConversation: noopSync("legacyChat/fetchMessages"),
    setIsNotStreaming: noopSync("legacyChat/setIsNotStreaming"),
    updateMessageStatus: noopSync<{ status: string }>("legacyChat/updateMessageStatus"),
    updateConversationCustomData: noopSync("legacyChat/updateConversationCustomData"),
    saveConversationAndMessage: noopAsync("legacyChat/saveConversationAndMessage"),
    coordinateActiveConversationAndMessageFetch: noopSync("legacyChat/coordinateFetch"),
    setExternalConversationLoading: noopSync("legacyChat/setExternalConversationLoading"),
    updateMode: noopSync<{ value: string }>("legacyChat/updateMode"),
    updateMultipleNestedFields: noopSync("legacyChat/updateMultipleNestedFields"),
    updateModel: noopSync<{ value: string }>("legacyChat/updateModel"),
    updateFiles: noopSync("legacyChat/updateFiles"),
    updateMessageContent: noopSync("legacyChat/updateMessageContent"),
    fetchAdditionalConversations: noopSync("legacyChat/fetchAdditionalConversations"),
    createConversationAndMessage: noopSync("legacyChat/createConversationAndMessage"),
    updateAvailableBrokers: noopSync("legacyChat/updateAvailableBrokers"),
    updateAvailableTools: noopSync("legacyChat/updateAvailableTools"),
    updateSelectedRecipe: noopSync("legacyChat/updateSelectedRecipe"),
    updateTechStack: noopSync("legacyChat/updateTechStack"),
  };
}
