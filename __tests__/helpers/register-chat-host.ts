/**
 * THE ONE SHARED TEST HELPER for suites that render real `@ai-matrx/chat` pieces which draw host
 * slots (../aidream/apps/shared/chat/src/host/ui-slots.tsx, markdown-slots.tsx). It registers the app's own
 * registrations exactly as ChatHostAdapter does at startup, so the suite sees the real host, never a
 * per-test hack. Import it first (`import "@/__tests__/helpers/register-chat-host";`).
 */
import "@/providers/chatUiRegistration";
import "@/providers/chatMarkdownRegistration";
import "@/providers/chatContentIrRegistration";
import "@/providers/chatRichDocumentRegistration";
