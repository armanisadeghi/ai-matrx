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
} from "../redux/messagingSlice";
import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type {
  ConversationType,
  ConversationWithDetails,
  Message,
  ParticipantRole,
} from "../types";
import {
  playNotificationSound,
  showDesktopNotification,
  unlockAudio,
} from "../utils/notificationSound";

type DmConversationRpcRow =
  Database["public"]["Functions"]["get_dm_conversations_with_details"]["Returns"][number];

function toConversationType(value: string): ConversationType {
  return value === "group" ? "group" : "direct";
}

function toParticipantRole(value: string | null | undefined): ParticipantRole {
  if (value === "owner" || value === "admin" || value === "member") {
    return value;
  }
  return "member";
}

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
        // Get conversation basic info
        const { data: convData, error: convError } = await supabase
          .schema("communication")
          .from("dm_conversations")
          .select("*")
          .eq("id", conversationId)
          .single();

        if (convError || !convData) return null;

        // Get participants with user info
        const { data: participants } = await supabase
          .schema("communication")
          .from("dm_conversation_participants")
          .select("*")
          .eq("conversation_id", conversationId);

        const participantsWithUser = await Promise.all(
          (participants || []).map(async (p) => {
            const { data: userInfo } = await supabase.rpc("get_dm_user_info", {
              p_user_id: p.user_id,
            });
            return {
              ...p,
              user: userInfo?.[0] ?? undefined,
            };
          }),
        );

        // Get last message
        const { data: lastMsgData } = await supabase
          .schema("communication")
          .from("dm_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1);

        const lastMessage = lastMsgData?.[0] || null;

        // Get unread count
        const { data: unreadData } = await supabase.rpc("get_dm_unread_count", {
          p_conversation_id: conversationId,
          p_user_id: userId,
        });

        // Find the other participant for direct chats
        const otherParticipant = participantsWithUser.find(
          (p) => p.user_id !== userId,
        );

        return {
          id: convData.id,
          type: convData.type,
          group_name: convData.group_name,
          group_image_url: convData.group_image_url,
          created_by: convData.created_by,
          created_at: convData.created_at,
          updated_at: convData.updated_at,
          participants: participantsWithUser,
          last_message: lastMessage
            ? {
                ...lastMessage,
                status: "sent" as const,
              }
            : null,
          unread_count: unreadData || 0,
          display_name:
            convData.type === "direct" && otherParticipant
              ? otherParticipant.user?.display_name ||
                otherParticipant.user?.email ||
                "Unknown"
              : convData.group_name || "Group Chat",
          display_image:
            convData.type === "direct" && otherParticipant
              ? otherParticipant.user?.avatar_url
              : convData.group_image_url,
        } as unknown as ConversationWithDetails;
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
      return;
    }

    dispatch(setLoading(true));

    try {
      // Use the database function for efficient loading
      const { data, error: fetchError } = await supabase.rpc(
        "get_dm_conversations_with_details",
        { p_user_id: userId },
      );

      if (!mountedRef.current) return;

      if (fetchError) {
        console.error(
          "[Messaging] Error loading conversations:",
          fetchError.message,
        );
        dispatch(setLoading(false));
        return;
      }

      // Fetch participants for each conversation
      const conversationsWithParticipants = await Promise.all(
        (data || []).map(async (conv: DmConversationRpcRow) => {
          const { data: participants } = await supabase
            .schema("communication")
            .from("dm_conversation_participants")
            .select("*")
            .eq("conversation_id", String(conv.conversation_id));

          // Fetch user info for each participant
          const participantsWithUser = await Promise.all(
            (participants || []).map(async (p) => {
              const { data: userInfo } = await supabase.rpc(
                "get_dm_user_info",
                { p_user_id: p.user_id },
              );
              return {
                ...p,
                role: toParticipantRole(p.role),
                is_muted: p.is_muted ?? false,
                is_archived: p.is_archived ?? false,
                user: userInfo?.[0] ?? undefined,
              };
            }),
          );

          // For direct chats, compute display name/image from the other participant
          const otherParticipant = participantsWithUser.find(
            (p) => p.user_id !== userId,
          );

          const conversation: ConversationWithDetails = {
            id: conv.conversation_id,
            type: toConversationType(conv.conversation_type),
            group_name: conv.group_name,
            group_image_url: conv.group_image_url,
            created_by: null,
            created_at: conv.conversation_created_at,
            updated_at: conv.conversation_updated_at,
            participants: participantsWithUser || [],
            last_message: conv.last_message_content
              ? {
                  id: "",
                  conversation_id: conv.conversation_id,
                  sender_id: conv.last_message_sender_id,
                  content: conv.last_message_content,
                  message_type: "text",
                  media_url: null,
                  media_thumbnail_url: null,
                  media_metadata: null,
                  status: "sent",
                  reply_to_id: null,
                  deleted_at: null,
                  deleted_for_everyone: false,
                  created_at: conv.last_message_at,
                  edited_at: null,
                  client_message_id: null,
                  action_data: null,
                }
              : null,
            unread_count: conv.unread_count,
            display_name:
              conv.conversation_type === "direct" && otherParticipant
                ? otherParticipant.user?.display_name ||
                  otherParticipant.user?.email ||
                  "Unknown"
                : conv.group_name || "Group Chat",
            display_image:
              conv.conversation_type === "direct" && otherParticipant
                ? otherParticipant.user?.avatar_url
                : conv.group_image_url,
          };

          return conversation;
        }),
      );

      if (!mountedRef.current) return;

      // Store in Redux - this also calculates totalUnreadCount
      dispatch(setConversations(conversationsWithParticipants));
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("[Messaging] Failed to load conversations:", err);
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

    const channel = supabase.channel(`dm_global:${userId}`);

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
            showDesktopNotification(
              "New Message",
              `${senderName}: ${newMessage.content.substring(0, 50)}${newMessage.content.length > 50 ? "..." : ""}`,
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
