"use client";

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  SmsState,
  SmsConversation,
  SmsMessage,
  SmsNotificationPreferences,
  SmsPhoneNumber,
} from "../types";

const initialState: SmsState = {
  conversations: [],
  currentConversationId: null,
  messages: {},
  preferences: null,
  phoneNumbers: [],
  isLoading: false,
  isSending: false,
  error: null,
  totalConversations: 0,
  unreadTotal: 0,
};

const smsSlice = createSlice({
  name: "sms",
  initialState,
  reducers: {
    // ---- Loading ----
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setSending(state, action: PayloadAction<boolean>) {
      state.isSending = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    // ---- Conversations ----
    setConversations(
      state,
      action: PayloadAction<{ data: SmsConversation[]; total: number }>,
    ) {
      state.conversations = action.payload.data;
      state.totalConversations = action.payload.total;
      state.unreadTotal = action.payload.data.reduce(
        (sum, c) => sum + c.unread_count,
        0,
      );
    },
    updateConversation(state, action: PayloadAction<SmsConversation>) {
      const index = state.conversations.findIndex(
        (c) => c.id === action.payload.id,
      );
      if (index !== -1) {
        state.conversations[index] = action.payload;
      } else {
        state.conversations.unshift(action.payload);
      }
      state.unreadTotal = state.conversations.reduce(
        (sum, c) => sum + c.unread_count,
        0,
      );
    },
    setCurrentConversation(state, action: PayloadAction<string | null>) {
      state.currentConversationId = action.payload;
    },
    markConversationRead(state, action: PayloadAction<string>) {
      const conv = state.conversations.find((c) => c.id === action.payload);
      if (conv) {
        state.unreadTotal -= conv.unread_count;
        conv.unread_count = 0;
      }
    },

    // ---- Messages ----
    setMessages(
      state,
      action: PayloadAction<{ conversationId: string; messages: SmsMessage[] }>,
    ) {
      state.messages[action.payload.conversationId] = action.payload.messages;
    },
    appendMessage(
      state,
      action: PayloadAction<{ conversationId: string; message: SmsMessage }>,
    ) {
      const { conversationId, message } = action.payload;
      if (!state.messages[conversationId]) {
        state.messages[conversationId] = [];
      }
      // Insert at beginning (messages are newest-first from API)
      state.messages[conversationId].unshift(message);
    },
    updateMessageStatus(
      state,
      action: PayloadAction<{
        messageId: string;
        conversationId: string;
        status: string;
      }>,
    ) {
      const msgs = state.messages[action.payload.conversationId];
      if (msgs) {
        const msg = msgs.find((m) => m.id === action.payload.messageId);
        if (msg) {
          msg.status = action.payload.status as SmsMessage["status"];
        }
      }
    },

    // ---- Preferences ----
    setPreferences(
      state,
      action: PayloadAction<SmsNotificationPreferences | null>,
    ) {
      state.preferences = action.payload;
    },

    // ---- Phone Numbers ----
    setPhoneNumbers(state, action: PayloadAction<SmsPhoneNumber[]>) {
      state.phoneNumbers = action.payload;
    },

    // ---- Reset ----
    resetSms() {
      return initialState;
    },
  },
});

export const {
  setLoading,
  setSending,
  setError,
  setConversations,
  updateConversation,
  setCurrentConversation,
  markConversationRead,
  setMessages,
  appendMessage,
  updateMessageStatus,
  setPreferences,
  setPhoneNumbers,
  resetSms,
} = smsSlice.actions;

// ---- Selectors ----
type WithSms = { sms: SmsState };

export const selectSmsConversations = (state: WithSms) =>
  state.sms.conversations;
export const selectSmsCurrentConversationId = (state: WithSms) =>
  state.sms.currentConversationId;
const EMPTY_SMS_MESSAGES: never[] = [];
export const selectSmsMessages = (state: WithSms, conversationId: string) =>
  state.sms.messages[conversationId] || EMPTY_SMS_MESSAGES;
export const selectSmsPreferences = (state: WithSms) => state.sms.preferences;
export const selectSmsPhoneNumbers = (state: WithSms) =>
  state.sms.phoneNumbers;
export const selectSmsIsLoading = (state: WithSms) => state.sms.isLoading;
export const selectSmsIsSending = (state: WithSms) => state.sms.isSending;
export const selectSmsError = (state: WithSms) => state.sms.error;
export const selectSmsTotalConversations = (state: WithSms) =>
  state.sms.totalConversations;
export const selectSmsUnreadTotal = (state: WithSms) => state.sms.unreadTotal;
export const selectSmsCurrentConversation = (state: WithSms) =>
  state.sms.conversations.find(
    (c) => c.id === state.sms.currentConversationId,
  ) || null;

export default smsSlice.reducer;
