"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  setMessagingAvailable,
  setConversations,
  updateConversation,
  updateConversationLastMessage,
  markConversationAsRead,
  setLoading,
  setError,
} from "../redux/messagingSlice";
import { createClient } from "@/utils/supabase/client";
import { uniqueChannelTopic } from "@/utils/supabase/realtime";
import { summarizeMatrxText } from "@/features/matrx-envelope/referenceText";
import { toConversationWithDetails } from "@/features/messaging/data/conversation-list";
import {
  fetchConversationsWithDetails,
  nextConversationsCursor,
} from "@/features/messaging/data/conversationsWithDetails";
import type { ConversationWithDetails, Message } from "../types";
import {
  playNotificationSound,
  showDesktopNotification,
  unlockAudio,
} from "../utils/notificationSound";

/**
 * MessagingInitializer - Central hub for messaging state management
 *
 * Handles:
 * - Marking messaging as available
 * - Fetching and storing conversations in Redux (single source of truth)
 * - Real-time updates for:
 *   - New messages (INSERT on dm_messages) - updates conversation list and unread counts
 *   - New conversations (INSERT on dm_conversation_participants) - adds to list
 *   - Messages marked as read (UPDATE on dm_conversation_participants)
 *
 * All UI components read from Redux instead of maintaining local state.
 */
export function MessagingInitializer() {
  const dispatch = useAppDispatch();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );
  const mountedRef = useRef(true);

  // Get user from Redux
  const user = useAppSelector(selectUser);
  const userId = user?.id;

  // Track current conversation to avoid incrementing unread for active conversation
  const currentConversationId = useAppSelector(
    (state) => state.messaging.currentConversationId,
  );
  const currentConversationIdRef = useRef(currentConversationId);

  // Track known conversation IDs to filter out global events for other users' conversations
  const conversations = useAppSelector(
    (state) => state.messaging.conversations,
  );
  const knownConversationIdsRef = useRef<Set<string>>(new Set());

  // Per-conversation debounce map to deduplicate rapid fetchConversationDetails calls
  const fetchDebounceRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Get messaging preferences for notification sounds
  const messagingPreferences = useAppSelector(
    (state) => state.userPreferences.messaging,
  );
  const messagingPreferencesRef = useRef(messagingPreferences);

  // CRITICAL: Update refs synchronously during render (not just in useEffect)
  // useEffect runs after paint, leaving a window where async event handlers see stale values.
  // By updating during render, the ref is current by the time any handler reads it.
  currentConversationIdRef.current = currentConversationId;
  messagingPreferencesRef.current = messagingPreferences;
  // Keep known conversation IDs in sync with Redux state
  knownConversationIdsRef.current = new Set(conversations.map((c) => c.id));

  // Mark messaging as available
  useEffect(() => {
    dispatch(setMessagingAvailable(true));
    return () => {
      dispatch(setMessagingAvailable(false));
    };
  }, [dispatch]);

  // Unlock audio on first user interaction (no permission prompt needed)
  // This ensures notification sounds can play when messages arrive
  useEffect(() => {
    const handleInteraction = () => {
      unlockAudio();
      // Remove listeners after first interaction
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };

    document.addEventListener("click", handleInteraction, { once: true });
    document.addEventListener("keydown", handleInteraction, { once: true });
    document.addEventListener("touchstart", handleInteraction, { once: true });

    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };
  }, []);

  /**
   * Fetch a single conversation with full details
   */
  const fetchConversationDetails = useCallback(
    async (conversationId: string): Promise<ConversationWithDetails | null> => {
      if (!userId) return null;

      try {
        // ONE canonical request. It already carries participants + their
        // permitted profile fields, the last message, and the unread count —
        // never re-derive them with a participants SELECT plus a
        // `get_dm_user_info` call per participant (that N+1 turned a single
        // transport hiccup into 909 captured errors on 2026-08-21).
        // `maxAgeMs: 0` because this path runs right after a write we must see.
        const rows = await fetchConversationsWithDetails(supabase, userId, {
          maxAgeMs: 0,
        });
        const row = rows.find((r) => r.conversation_id === conversationId);
        if (!row) return null;

        return toConversationWithDetails(row, userId);
      } catch (error) {
        console.error(
          "[Messaging] Failed to fetch conversation details:",
          error,
        );
        return null;
      }
    },
    [userId, supabase],
  );

  /**
   * Load all conversations and store in Redux
   */
  const loadConversations = useCallback(async () => {
    if (!userId) {
      dispatch(setConversations([]));
      dispatch(setError(null));
      return;
    }

    dispatch(setLoading(true));
    dispatch(setError(null));

    try {
      // Use the database function for efficient loading. The shared reader
      // dedupes concurrent callers so a mount racing a realtime refresh issues
      // ONE request, not two. This is always page 1 (D247: RPC defaults to
      // p_limit=50) — ConversationList's "load more" continues from the
      // cursor built off this page's last row.
      const data = await fetchConversationsWithDetails(supabase, userId);

      if (!mountedRef.current) return;

      const conversationsWithParticipants = data.map((conversation) =>
        toConversationWithDetails(conversation, userId),
      );

      if (!mountedRef.current) return;

      // Store in Redux - this also calculates totalUnreadCount
      dispatch(
        setConversations({
          conversations: conversationsWithParticipants,
          hasMore: nextConversationsCursor(data) !== null,
        }),
      );
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("[Messaging] Failed to load conversations:", err);
      dispatch(
        setError(
          err instanceof Error
            ? err.message
            : "The conversation list could not be loaded.",
        ),
      );
    } finally {
      if (mountedRef.current) {
        dispatch(setLoading(false));
      }
    }
  }, [userId, supabase, dispatch]);

  // Initial conversations load
  useEffect(() => {
    mountedRef.current = true;
    loadConversations();

    return () => {
      mountedRef.current = false;
    };
  }, [loadConversations]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase.channel(uniqueChannelTopic(`dm_global:${userId}`));

    // 1. Listen for NEW messages - update conversation's last_message and unread count
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "communication",
        table: "dm_messages",
      },
      async (payload) => {
        const newMessage = payload.new as Message;

        // GUARD: Skip messages for conversations the user is not part of.
        // Supabase Realtime does not support per-user filters on dm_messages, so we
        // filter client-side against the known conversation list from Redux.
        if (!knownConversationIdsRef.current.has(newMessage.conversation_id)) {
          return;
        }

        const isFromOtherUser = newMessage.sender_id !== userId;
        const isActiveConversation =
          currentConversationIdRef.current === newMessage.conversation_id;

        // Play notification sound if:
        // - Message is from someone else
        // - User is not currently viewing this conversation
        // - Notification sounds are enabled
        if (isFromOtherUser && !isActiveConversation) {
          const prefs = messagingPreferencesRef.current;

          if (prefs?.notificationSoundEnabled) {
            playNotificationSound(prefs.notificationVolume);
          }

          // Show desktop notification if enabled
          if (prefs?.showDesktopNotifications) {
            const senderName = newMessage.sender_id.substring(0, 8); // Placeholder
            // Reference fences collapse to their human label — a desktop
            // notification must never show envelope JSON.
            const preview = summarizeMatrxText(newMessage.content);
            showDesktopNotification(
              "New Message",
              `${senderName}: ${preview.substring(0, 50)}${preview.length > 50 ? "..." : ""}`,
            );
          }
        }

        // STEP 1: Optimistic update — instantly update the conversation's last_message
        // and re-sort the list. No network call needed. This fixes the "stale sidebar" bug.
        dispatch(
          updateConversationLastMessage({
            conversationId: newMessage.conversation_id,
            message: newMessage,
            isFromCurrentUser: !isFromOtherUser,
          }),
        );

        // Own-send echo: the optimistic update above already moved the
        // conversation + last_message, and our unread count is by definition
        // 0 for a message we just wrote. The full N+1 refresh below exists
        // to pick up OTHER people's changes — paying it for our own echo was
        // a per-send refetch storm (realtime-echo doctrine).
        if (!isFromOtherUser) return;

        // STEP 2: Debounced background full refresh — collapses rapid message bursts
        // into a single fetchConversationDetails call per conversation to avoid
        // race conditions and wasted network traffic under high message throughput.
        const convId = newMessage.conversation_id;
        const existingTimer = fetchDebounceRef.current.get(convId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        const timer = setTimeout(async () => {
          fetchDebounceRef.current.delete(convId);
          const updatedConv = await fetchConversationDetails(convId);

          if (updatedConv) {
            const isStillActive = currentConversationIdRef.current === convId;
            if (isActiveConversation || isStillActive) {
              updatedConv.unread_count = 0;
            }

            dispatch(updateConversation(updatedConv));
          }
        }, 500);
        fetchDebounceRef.current.set(convId, timer);
      },
    );

    // 2. Listen for NEW conversation participants (new conversations for this user)
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "communication",
        table: "dm_conversation_participants",
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        const newParticipant = payload.new as { conversation_id: string };

        // Fetch the new conversation details
        const newConv = await fetchConversationDetails(
          newParticipant.conversation_id,
        );

        if (newConv) {
          dispatch(updateConversation(newConv));
        }
      },
    );

    // 3. Listen for messages marked as READ (last_read_at update)
    // No user_id filter so we also catch when OTHER participants read messages (sender read receipts).
    // Client-side filtering ensures we only process events for known conversations.
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "communication",
        table: "dm_conversation_participants",
      },
      async (payload) => {
        const oldData = payload.old as {
          user_id: string;
          last_read_at: string | null;
          conversation_id: string;
        };
        const newData = payload.new as {
          user_id: string;
          last_read_at: string | null;
          conversation_id: string;
        };

        // Only process events for conversations we know about
        if (!knownConversationIdsRef.current.has(newData.conversation_id))
          return;

        // last_read_at didn't change — nothing to do
        if (oldData.last_read_at === newData.last_read_at) return;

        if (newData.user_id === userId) {
          // Our own read state updated — clear our unread count immediately
          dispatch(markConversationAsRead(newData.conversation_id));
        } else {
          // Another participant read messages in a shared conversation (sender read receipt).
          // Trigger a debounced refresh so the conversation shows updated participant read state.
          const convId = newData.conversation_id;
          const existing = fetchDebounceRef.current.get(`read_${convId}`);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(async () => {
            fetchDebounceRef.current.delete(`read_${convId}`);
            const updated = await fetchConversationDetails(convId);
            if (updated && mountedRef.current) {
              dispatch(updateConversation(updated));
            }
          }, 300);
          fetchDebounceRef.current.set(`read_${convId}`, timer);
        }
      },
    );

    channel.subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      // Clean up all pending debounce timers
      for (const timer of fetchDebounceRef.current.values()) {
        clearTimeout(timer);
      }
      fetchDebounceRef.current.clear();
    };
  }, [userId, supabase, dispatch, fetchConversationDetails]);

  return null;
}

export default MessagingInitializer;
