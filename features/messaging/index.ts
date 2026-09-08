/**
 * Messaging feature — the app's frame around `@ai-matrx/messaging`.
 *
 * Conversations, messages, realtime, presence, typing, the outbox, references
 * and actionable messages are the PACKAGE's. Import them from
 * `@ai-matrx/messaging` / `@ai-matrx/messaging/react` directly; nothing is
 * re-exported through here, because a barrel that forwards a package's API is
 * a second name for it that drifts.
 *
 * What lives in this feature is app chrome: the panes that wrap the package's
 * surfaces in this app's right-click menu and surface scope, the side sheet,
 * the action-card surfaces for this app's message kinds, the notification sink,
 * and the "message this person" service other features call.
 */

export { ConversationListPane } from "./components/ConversationListPane";
export { ConversationPane } from "./components/ConversationPane";
export { MessagingSideSheet } from "./components/MessagingSideSheet";
export { MessageIcon } from "./components/MessageIcon";
export { NewConversationDialog } from "./components/NewConversationDialog";
export {
  MessagingConversationRowChrome,
  MessagingMessageChrome,
  MessagingFence,
} from "./components/MessagingChrome";
export { MESSAGE_ACTION_SURFACES } from "./actions/messageActionSurfaces";
export {
  sendDirectActionMessage,
  findOrCreateDirectConversation,
} from "./service/sendDirectActionMessage";
export {
  closeMessaging,
  openMessaging,
  toggleMessaging,
  selectMessagingIsOpen,
  selectMessagingSheetWidth,
} from "./redux/messagingUiSlice";
