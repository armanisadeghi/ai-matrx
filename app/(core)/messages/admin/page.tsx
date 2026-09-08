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
      name: "ConversationListPane",
      filePath: "features/messaging/components/ConversationListPane.tsx",
      description:
        "@ai-matrx/messaging's conversation list inside this app's v3 right-click menu and surface scope. Shared by the route, the side sheet and the Messages window.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "ConversationPane",
      filePath: "features/messaging/components/ConversationPane.tsx",
      description:
        "@ai-matrx/messaging's conversation thread (transcript, typing, presence, composer, outbox) inside this app's right-click menu.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "MessagingChrome",
      filePath: "features/messaging/components/MessagingChrome.tsx",
      description:
        "The wrappers the package renders around its own bubbles and rows: the data attributes the menu resolves its target from, and this app's ```matrx fence renderer.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "MessagingSideSheet",
      filePath: "features/messaging/components/MessagingSideSheet.tsx",
      description: "The docked messages sheet — app frame around the same two panes.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "NewConversationDialog",
      filePath: "features/messaging/components/NewConversationDialog.tsx",
      description:
        "User picker; resolves the 1:1 conversation atomically through the package.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "MessagingHost",
      filePath: "providers/MessagingHost.tsx",
      description:
        "THE ONE @ai-matrx/messaging mount, inside RealtimeHost so it rides the app's single realtime manager. Injects identity and app chrome only.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "Messaging action surfaces",
      filePath: "features/messaging/actions/messageActionSurfaces.tsx",
      description:
        "This app's card/chip surfaces for its actionable-message kinds, handed to the package as actionRenderers. An unknown kind or version renders nothing.",
      status: "Live",
      tier: "internal",
    },
  ],
  reduxSlices: [
    {
      name: "messagingUi",
      filePath: "features/messaging/redux/messagingUiSlice.ts",
      description:
        "The side sheet's open state and dragged width — app chrome only. Conversations, unread counts and the active conversation live in @ai-matrx/messaging's store, never mirrored here.",
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
