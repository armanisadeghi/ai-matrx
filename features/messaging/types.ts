/**
 * Messaging System Types
 * 
 * Core types for the real-time direct messaging system.
 * Uses auth.users(id) as UUID for user references.
 * Tables prefixed with dm_ to avoid conflicts.
 */

// ============================================
// Database Types (matching dm_ schema)
// ============================================

export type ConversationType = 'direct' | 'group';
export type ParticipantRole = 'owner' | 'admin' | 'member';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Conversation {
  id: string; // UUID
  type: ConversationType;
  group_name: string | null;
  group_image_url: string | null;
  created_by: string | null; // auth.users.id UUID
  created_at: string;
  updated_at: string;
}

export interface ConversationParticipant {
  id: string; // UUID
  conversation_id: string; // UUID
  user_id: string; // auth.users.id UUID
  role: ParticipantRole;
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  is_archived: boolean;
}

/**
 * Generic actionable-message envelope carried on `dm_messages.action_data`.
 * The bubble renders `kind` into deep-link chips via the message-action
 * registry; unknown kinds render nothing (forward-compatible). `agent_drift`
 * is the first kind — see features/agents drift notifications.
 */
export interface MessageActionData<
  K extends string = string,
  P = Record<string, unknown>,
> {
  kind: K;
  /** Payload schema version per kind. */
  version: number;
  payload: P;
}

/** Payload for `kind: "agent_drift"`. */
export interface AgentDriftActionPayload {
  agent_id: string;
  agent_name: string;
  alert_id?: string | null;
  severity?: string | null;
  counts?: Partial<Record<"breaking" | "silent_breaking" | "warning" | "info", number>>;
  /** Set when the notification was about one specific usage. */
  usage_type?: string;
  usage_id?: string;
  usage_label?: string;
}

export interface Message {
  id: string; // UUID
  conversation_id: string; // UUID
  sender_id: string; // auth.users.id UUID
  content: string;
  message_type: MessageType;
  media_url: string | null;
  media_thumbnail_url: string | null;
  media_metadata: Record<string, unknown> | null;
  status: MessageStatus;
  reply_to_id: string | null;
  deleted_at: string | null;
  deleted_for_everyone: boolean;
  created_at: string;
  edited_at: string | null;
  client_message_id: string | null;
  /** Generic actionable-message envelope (deep-link chips). Null for plain DMs. */
  action_data: MessageActionData | null;
}

// ============================================
// User Info Types (from auth.users)
// ============================================

export interface UserBasicInfo {
  user_id: string; // auth.users.id UUID
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// ============================================
// Extended Types with User Info
// ============================================

export interface ConversationWithDetails extends Conversation {
  participants: ParticipantWithUser[];
  last_message?: MessageWithSender | null;
  unread_count: number;
  // Computed display values for direct chats
  display_name?: string;
  display_image?: string | null;
}

export interface ParticipantWithUser extends ConversationParticipant {
  user?: UserBasicInfo;
}

export interface MessageWithSender extends Message {
  sender?: UserBasicInfo;
  reply_to?: Message | null;
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreateConversationRequest {
  type?: ConversationType;
  participant_ids: string[]; // auth.users.id UUIDs of other participants
  group_name?: string;
}

export interface CreateConversationResponse {
  success: boolean;
  data: { conversation_id: string };
  existing: boolean;
  msg: string;
}

export interface SendMessageRequest {
  conversation_id: string;
  content: string;
  message_type?: MessageType;
  media_url?: string;
  media_thumbnail_url?: string;
  media_metadata?: Record<string, unknown>;
  reply_to_id?: string;
  client_message_id: string;
}

export interface UpdateMessageRequest {
  content?: string;
  deleted?: boolean;
  deleted_for_everyone?: boolean;
}

export interface ConversationListResponse {
  success: boolean;
  data: ConversationWithDetails[];
  total: number;
  msg: string;
}

export interface MessagesListResponse {
  success: boolean;
  data: MessageWithSender[];
  msg: string;
}

// ============================================
// Real-time Event Types
// ============================================

export interface NewMessageEvent {
  type: 'new_message';
  message: Message;
}

export interface MessageUpdateEvent {
  type: 'message_update';
  message: Message;
}

export interface TypingEvent {
  user_id: string; // auth.users.id UUID
  conversation_id: string;
  is_typing: boolean;
  last_typed_at: number;
}

export interface PresenceState {
  [key: string]: {
    user_id: string;
    online_at: string;
  }[];
}

// ============================================
// UI State Types
// ============================================

export interface MessagingState {
  isOpen: boolean;
  sheetWidth: number;
  currentConversationId: string | null;
  conversations: ConversationWithDetails[];
  unreadCounts: Record<string, number>;
  totalUnreadCount: number;
  isLoading: boolean;
  error: string | null;
}

export interface ChatState {
  messages: MessageWithSender[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  hasMore: boolean;
  typingUsers: string[]; // auth.users.id UUIDs of users currently typing
  onlineUsers: string[]; // auth.users.id UUIDs of users currently online
}

// ============================================
// Hook Return Types
// ============================================

export interface UseMessagesReturn {
  messages: MessageWithSender[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  hasMore: boolean;
  sendMessage: (content: string, options?: Partial<SendMessageRequest>) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  markAsRead: () => Promise<void>;
}

export interface UseTypingIndicatorReturn {
  typingUsers: UserBasicInfo[];
  setTyping: (isTyping: boolean) => void;
  isAnyoneTyping: boolean;
  typingText: string;
}

export interface UseChatReturn extends UseMessagesReturn, UseTypingIndicatorReturn {
  onlineUsers: UserBasicInfo[];
}

export interface UseConversationsReturn {
  conversations: ConversationWithDetails[];
  isLoading: boolean;
  error: string | null;
  totalUnreadCount: number;
  createConversation: (participantId: string) => Promise<string>;
  refreshConversations: () => Promise<void>;
}
