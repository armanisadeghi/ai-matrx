/**
 * Messaging Redux Slice
 *
 * Manages global messaging state:
 * - Side sheet open/close state
 * - Sheet width (for resizable panel)
 * - Current conversation selection
 * - Conversations list with unread counts
 * - Total unread count (for header badge)
 *
 * Uses auth.users.id (UUID) for user identification
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ConversationWithDetails, Message } from "../types";

// ============================================
// State Interface
// ============================================

interface MessagingState {
  // Sheet UI state
  isOpen: boolean;
  sheetWidth: number;

  // Current selection
  currentConversationId: string | null;

  // Conversations data (cached for quick access)
  conversations: ConversationWithDetails[];

  // Unread counts
  unreadCounts: Record<string, number>;
  totalUnreadCount: number;

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Feature flags
  isAvailable: boolean;
}

const initialState: MessagingState = {
  isOpen: false,
  sheetWidth: 400,
  currentConversationId: null,
  conversations: [],
  unreadCounts: {},
  totalUnreadCount: 0,
  isLoading: false,
  error: null,
  isAvailable: false,
};

// ============================================
// Slice
// ============================================

export const messagingSlice = createSlice({
  name: "messaging",
  initialState,
  reducers: {
    // ========== Sheet UI Actions ==========

    /**
     * Open messaging sheet, optionally to a specific conversation
     */
    openMessaging: (state, action: PayloadAction<string | undefined>) => {
      state.isOpen = true;
      if (action.payload) {
        state.currentConversationId = action.payload;
      }
    },

    /**
     * Close messaging sheet
     */
    closeMessaging: (state) => {
      state.isOpen = false;
      // Keep currentConversationId for reopening
    },

    /**
     * Toggle messaging sheet
     */
    toggleMessaging: (state) => {
      state.isOpen = !state.isOpen;
    },

    /**
     * Set sheet width (for resizable panel)
     */
    setSheetWidth: (state, action: PayloadAction<number>) => {
      state.sheetWidth = action.payload;
    },

    // ========== Conversation Selection ==========

    /**
     * Set current conversation
     * Header badge counts conversations with unread, not total messages
     */
    setCurrentConversation: (state, action: PayloadAction<string | null>) => {
      state.currentConversationId = action.payload;

      // Clear unread count for this conversation (user is viewing it)
      if (action.payload && state.unreadCounts[action.payload] > 0) {
        // Only decrement badge by 1 (one less conversation with unread)
        state.totalUnreadCount = Math.max(0, state.totalUnreadCount - 1);
        state.unreadCounts[action.payload] = 0;

        // Update conversation in list
        const conv = state.conversations.find((c) => c.id === action.payload);
        if (conv) {
          conv.unread_count = 0;
        }
      }
    },

    /**
     * Clear current conversation selection
     */
    clearCurrentConversation: (state) => {
      state.currentConversationId = null;
    },

    // ========== Conversations Data ==========

    /**
     * Set conversations list
     * Note: totalUnreadCount = number of CONVERSATIONS with unread (for header badge)
     *       unreadCounts = individual unread message counts per conversation
     *
     * IMPORTANT: Forces unread_count=0 for the currently active conversation
     * to prevent stale database values from re-showing unread badges.
     */
    setConversations: (
      state,
      action: PayloadAction<ConversationWithDetails[]>,
    ) => {
      state.conversations = action.payload;

      // Recalculate unread counts
      state.unreadCounts = {};
      let conversationsWithUnread = 0;

      action.payload.forEach((conv) => {
        // Safety net: if this is the currently active conversation, force unread to 0
        const isActive = state.currentConversationId === conv.id;
        const count = isActive ? 0 : conv.unread_count || 0;

        // Update the conversation object itself so the UI reflects this
        if (isActive && conv.unread_count > 0) {
          conv.unread_count = 0;
        }

        state.unreadCounts[conv.id] = count;
        if (count > 0) {
          conversationsWithUnread++;
        }
      });

      // Header badge shows number of conversations with unread messages
      state.totalUnreadCount = conversationsWithUnread;
    },

    /**
     * Update a single conversation (e.g., new message received)
     * Updates unread counts and header badge (conversation count, not message sum)
     *
     * IMPORTANT: Forces unread_count=0 for the currently active conversation
     * to prevent stale database values from re-showing unread badges.
     */
    updateConversation: (
      state,
      action: PayloadAction<ConversationWithDetails>,
    ) => {
      const newConv = action.payload;
      const index = state.conversations.findIndex((c) => c.id === newConv.id);

      // Safety net: if this is the currently active conversation, force unread to 0
      // The user is literally viewing it -- it cannot be "unread"
      const isActiveConversation = state.currentConversationId === newConv.id;
      if (isActiveConversation) {
        newConv.unread_count = 0;
      }

      // Track if this affects the header badge (conversations with unread count)
      const oldUnreadCount =
        index >= 0 ? state.conversations[index].unread_count || 0 : 0;
      const newUnreadCount = newConv.unread_count || 0;

      // Header badge counts conversations with unread, not total unread messages
      const hadUnread = oldUnreadCount > 0;
      const hasUnread = newUnreadCount > 0;

      if (!hadUnread && hasUnread) {
        // Conversation now has unread messages
        state.totalUnreadCount += 1;
      } else if (hadUnread && !hasUnread) {
        // Conversation no longer has unread messages
        state.totalUnreadCount = Math.max(0, state.totalUnreadCount - 1);
      }
      // If both had and have unread (or neither), no change to totalUnreadCount

      // Update per-conversation unread count
      state.unreadCounts[newConv.id] = newUnreadCount;

      if (index >= 0) {
        state.conversations[index] = newConv;
      } else {
        // New conversation - if it has unread, we already incremented above
        state.conversations.unshift(newConv);
      }

      // Sort by last_message time or updated_at (most recent first)
      state.conversations.sort((a, b) => {
        const aTime = a.last_message?.created_at || a.updated_at;
        const bTime = b.last_message?.created_at || b.updated_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
    },

    /**
     * Optimistically update a conversation's last_message from a real-time event.
     * This avoids the need to refetch the entire conversation from the database,
     * which can suffer from replication lag or race conditions.
     *
     * Also increments unread_count if the message is from another user
     * and the conversation is not currently active.
     */
    updateConversationLastMessage: (
      state,
      action: PayloadAction<{
        conversationId: string;
        message: Message;
        isFromCurrentUser: boolean;
      }>,
    ) => {
      const { conversationId, message, isFromCurrentUser } = action.payload;
      const index = state.conversations.findIndex(
        (c) => c.id === conversationId,
      );

      if (index < 0) return; // Conversation not in list — full fetch needed

      const conv = state.conversations[index];
      const isActiveConversation =
        state.currentConversationId === conversationId;

      // Update last_message
      conv.last_message = {
        ...message,
        status: "sent" as const,
      };
      conv.updated_at = message.created_at;

      // Update unread count (only for messages from other users, not active conversation)
      if (!isFromCurrentUser && !isActiveConversation) {
        const oldUnread = conv.unread_count || 0;
        conv.unread_count = oldUnread + 1;
        state.unreadCounts[conversationId] = oldUnread + 1;

        // If this is the first unread message, increment the total unread conversations count
        if (oldUnread === 0) {
          state.totalUnreadCount += 1;
        }
      }

      // Re-sort conversations (most recent first)
      state.conversations.sort((a, b) => {
        const aTime = a.last_message?.created_at || a.updated_at;
        const bTime = b.last_message?.created_at || b.updated_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
    },

    /**
     * Remove a conversation from the list
     */
    removeConversation: (state, action: PayloadAction<string>) => {
      const convId = action.payload;

      // Update total unread
      if (state.unreadCounts[convId]) {
        state.totalUnreadCount -= state.unreadCounts[convId];
        delete state.unreadCounts[convId];
      }

      // Remove from list
      state.conversations = state.conversations.filter((c) => c.id !== convId);

      // Clear selection if this was the current conversation
      if (state.currentConversationId === convId) {
        state.currentConversationId = null;
      }
    },

    // ========== Unread Counts ==========

    /**
     * Update unread count for a conversation
     * Header badge counts conversations with unread, not total messages
     */
    updateUnreadCount: (
      state,
      action: PayloadAction<{ conversationId: string; count: number }>,
    ) => {
      const { conversationId, count } = action.payload;
      const oldCount = state.unreadCounts[conversationId] || 0;

      // Track if this affects the header badge
      const hadUnread = oldCount > 0;
      const hasUnread = count > 0;

      state.unreadCounts[conversationId] = count;

      // Header badge counts conversations with unread
      if (!hadUnread && hasUnread) {
        state.totalUnreadCount += 1;
      } else if (hadUnread && !hasUnread) {
        state.totalUnreadCount = Math.max(0, state.totalUnreadCount - 1);
      }

      // Update conversation in list
      const conv = state.conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.unread_count = count;
      }
    },

    /**
     * Increment unread count for a conversation (when receiving new message)
     * Header badge counts conversations with unread, not total messages
     */
    incrementUnreadCount: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;

      // Don't increment if this is the current conversation
      // (user is viewing it either in the side sheet or full page)
      if (state.currentConversationId === conversationId) {
        return;
      }

      const oldCount = state.unreadCounts[conversationId] || 0;
      const newCount = oldCount + 1;

      state.unreadCounts[conversationId] = newCount;

      // Only increment header badge if conversation went from 0 to 1 unread
      if (oldCount === 0) {
        state.totalUnreadCount += 1;
      }

      // Update conversation in list
      const conv = state.conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.unread_count = newCount;
      }
    },

    /**
     * Mark conversation as read (clear unread count)
     * Header badge counts conversations with unread, not total messages
     */
    markConversationAsRead: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      const oldCount = state.unreadCounts[conversationId] || 0;

      state.unreadCounts[conversationId] = 0;

      // Only decrement header badge if conversation had unread messages
      if (oldCount > 0) {
        state.totalUnreadCount = Math.max(0, state.totalUnreadCount - 1);
      }

      // Update conversation in list
      const conv = state.conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.unread_count = 0;
      }
    },

    /**
     * Reset all unread counts
     */
    resetUnreadCounts: (state) => {
      state.unreadCounts = {};
      state.totalUnreadCount = 0;
      state.conversations.forEach((conv) => {
        conv.unread_count = 0;
      });
    },

    /**
     * Set total unread count directly (for global badge)
     */
    setTotalUnreadCount: (state, action: PayloadAction<number>) => {
      state.totalUnreadCount = action.payload;
    },

    // ========== Loading States ==========

    /**
     * Set loading state
     */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    /**
     * Set error state
     */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    // ========== Feature Flags ==========

    /**
     * Set messaging availability (called by layouts)
     */
    setMessagingAvailable: (state, action: PayloadAction<boolean>) => {
      state.isAvailable = action.payload;
    },

    // ========== Reset ==========

    /**
     * Reset messaging state (call on logout)
     */
    resetMessaging: () => initialState,
  },
});

// ============================================
// Actions
// ============================================

export const {
  openMessaging,
  closeMessaging,
  toggleMessaging,
  setSheetWidth,
  setCurrentConversation,
  clearCurrentConversation,
  setConversations,
  updateConversation,
  updateConversationLastMessage,
  removeConversation,
  updateUnreadCount,
  incrementUnreadCount,
  markConversationAsRead,
  resetUnreadCounts,
  setTotalUnreadCount,
  setLoading,
  setError,
  setMessagingAvailable,
  resetMessaging,
} = messagingSlice.actions;

// ============================================
// Selectors
// ============================================

type WithMessaging = { messaging: MessagingState };

export const selectMessagingIsOpen = (state: WithMessaging) =>
  state.messaging.isOpen;
export const selectMessagingSheetWidth = (state: WithMessaging) =>
  state.messaging.sheetWidth;
export const selectCurrentConversationId = (state: WithMessaging) =>
  state.messaging.currentConversationId;
export const selectConversations = (state: WithMessaging) =>
  state.messaging.conversations;
export const selectUnreadCounts = (state: WithMessaging) =>
  state.messaging.unreadCounts;
export const selectTotalUnreadCount = (state: WithMessaging) =>
  state.messaging.totalUnreadCount;
export const selectMessagingIsLoading = (state: WithMessaging) =>
  state.messaging.isLoading;
export const selectMessagingError = (state: WithMessaging) => state.messaging.error;
export const selectMessagingIsAvailable = (state: WithMessaging) =>
  state.messaging.isAvailable;

/**
 * Get the current conversation with details
 */
export const selectCurrentConversation = (
  state: WithMessaging,
): ConversationWithDetails | null => {
  const { conversations, currentConversationId } = state.messaging;
  if (!currentConversationId) return null;
  return conversations.find((c) => c.id === currentConversationId) || null;
};

/**
 * Get unread count for a specific conversation
 */
export const selectConversationUnreadCount =
  (conversationId: string) =>
  (state: WithMessaging): number => {
    return state.messaging.unreadCounts[conversationId] || 0;
  };

// ============================================
// Export Reducer
// ============================================

export default messagingSlice.reducer;
