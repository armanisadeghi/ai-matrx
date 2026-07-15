/**
 * Messaging Feature - Barrel Exports
 * 
 * Real-time direct messaging using Supabase Realtime
 * Uses dm_ prefixed tables and auth.users.id (UUID)
 */

// Types
export type {
  ConversationType,
  ParticipantRole,
  MessageType,
  MessageStatus,
  Conversation,
  ConversationParticipant,
  Message,
  UserBasicInfo,
  ConversationWithDetails,
  ParticipantWithUser,
  MessageWithSender,
  CreateConversationRequest,
  CreateConversationResponse,
  SendMessageRequest,
  UpdateMessageRequest,
  ConversationListResponse,
  MessagesListResponse,
  NewMessageEvent,
  MessageUpdateEvent,
  TypingEvent,
  PresenceState,
  MessagingState,
  ChatState,
  UseMessagesReturn,
  UseTypingIndicatorReturn,
  UseChatReturn,
  UseConversationsReturn,
} from './types';

// Redux Actions
export {
  openMessaging,
  closeMessaging,
  toggleMessaging,
  setSheetWidth,
  setCurrentConversation,
  clearCurrentConversation,
  setConversations,
  updateConversation,
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
} from './redux/messagingSlice';

// Redux Selectors
export {
  selectMessagingIsOpen,
  selectMessagingSheetWidth,
  selectCurrentConversationId,
  selectConversations,
  selectUnreadCounts,
  selectTotalUnreadCount,
  selectMessagingIsLoading,
  selectMessagingError,
  selectMessagingIsAvailable,
  selectCurrentConversation,
  selectConversationUnreadCount,
} from './redux/messagingSlice';

// Components
export { MessagingSideSheet } from './components/MessagingSideSheet';
export { MessagingInitializer } from './components/MessagingInitializer';
export { ConversationList } from './components/ConversationList';
export { ChatThread } from './components/ChatThread';
export { MessageBubble } from './components/MessageBubble';
export { MessageInput } from './components/MessageInput';
export { TypingIndicator } from './components/TypingIndicator';
export { OnlineIndicator } from './components/OnlineIndicator';
export { NewConversationDialog } from './components/NewConversationDialog';
export { MessageIcon } from './components/MessageIcon';

