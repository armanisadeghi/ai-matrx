export const dynamic = "force-dynamic";

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const MESSAGES_ADMIN_MAP: FeatureAdminMap = {
  name: "Messages",
  slug: "messages",
  description:
    "Direct and group conversation UI, realtime delivery and presence, unread state, durable message actions, and the route/window renderers that share the messaging feature components.",
  docs: [
    {
      label: "Messaging system",
      href: "/features/messaging/README.md",
    },
  ],
  routeScanPath: "app/(core)/messages",
  routes: [
    {
      url: "/messages",
      label: "Conversation inbox",
      description:
        "Responsive conversation list, unread inventory, and desktop thread selector.",
      filePath: "app/(core)/messages/page.tsx",
      status: "Live",
    },
    {
      url: "/messages/[conversationId]",
      label: "Conversation thread",
      description:
        "Deep-linked transcript, realtime presence and typing, pagination, and the human-gated composer.",
      filePath: "app/(core)/messages/[conversationId]/page.tsx",
      status: "Live",
    },
    {
      url: "/messages/admin",
      label: "Messages admin map",
      description: "Admin-gated inventory of every messaging resource.",
      filePath: "app/(core)/messages/admin/page.tsx",
      status: "Live",
    },
  ],
  windowPanels: [
    {
      overlayId: "messagesWindow",
      description:
        "Inbox sidebar and conversation thread in the reusable Messages window.",
    },
    {
      overlayId: "singleMessageWindow",
      description:
        "Multi-instance single-conversation window; requires a conversation id.",
      launchFrom: {
        note: "Opens from a conversation-aware message action.",
        href: "/messages",
      },
    },
  ],
  components: [
    {
      name: "ConversationList",
      filePath: "features/messaging/components/ConversationList.tsx",
      description:
        "Canonical paginated conversation inventory shared by the route and Messages window.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "ChatThread",
      filePath: "features/messaging/components/ChatThread.tsx",
      description:
        "Canonical realtime transcript, typing state, pagination, context menu, and composer host.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "MessageBubble",
      filePath: "features/messaging/components/MessageBubble.tsx",
      description:
        "Actor-aware message renderer with delivery status and registered action chips.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "MessageInput",
      filePath: "features/messaging/components/MessageInput.tsx",
      description:
        "Human-gated message composer with reference attachments and quote insertion.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "NewConversationDialog",
      filePath: "features/messaging/components/NewConversationDialog.tsx",
      description: "User picker and direct-conversation creation flow.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "MessagingInitializer",
      filePath: "features/messaging/components/MessagingInitializer.tsx",
      description:
        "Single authenticated bootstrap and global realtime synchronization boundary.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "Messaging action registry",
      filePath: "features/messaging/actions/messageActionRegistry.tsx",
      description:
        "Typed, authorized action renderers carried by durable message payloads.",
      status: "Live",
      tier: "internal",
    },
  ],
  reduxSlices: [
    {
      name: "messaging",
      filePath: "features/messaging/redux/messagingSlice.ts",
      description:
        "Conversation inventory, selection, unread counts, loading and availability state.",
    },
  ],
  relatedFeatures: [
    {
      name: "Surfaces",
      description:
        "matrx-user/messages declares the values exposed by list and thread contexts.",
    },
    {
      name: "Context menu v3",
      description:
        "Conversation rows and messages expose canonical copy, export, attach, and AI actions.",
    },
    {
      name: "Window panels",
      description:
        "MessagesWindow and SingleMessageWindow wrap the same canonical list and thread components.",
    },
  ],
};

export default function MessagesAdminPage() {
  return <FeatureAdminPage map={MESSAGES_ADMIN_MAP} />;
}
