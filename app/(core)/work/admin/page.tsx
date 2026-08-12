import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const AI_WORK_ADMIN_MAP: FeatureAdminMap = {
  name: "AI Work",
  slug: "work",
  description:
    "User-facing composition over live conversations, chat, skills, connections, projects, tasks, War Rooms, and schedules.",
  docs: [{ label: "AI Work FEATURE.md", href: "/features/ai-work/FEATURE.md" }],
  routeScanPath: "app/(core)/work",
  routes: [
    {
      url: "/work",
      label: "AI Work overview",
      description: "Doors into every live AI work capability.",
      filePath: "app/(core)/work/page.tsx",
      status: "Live",
    },
    {
      url: "/work/conversations",
      label: "Provider conversation inbox",
      description:
        "Owner-scoped coding sessions with fidelity, canonical conversation actions, and task association.",
      filePath: "app/(core)/work/conversations/page.tsx",
      status: "Live",
    },
    {
      url: "/work/conversations/[conversationId]",
      label: "Provider conversation transcript",
      description:
        "Read-only normalized transcript for agentless provider mirrors, with task attachment and an honest new-chat door.",
      filePath: "app/(core)/work/conversations/[conversationId]/page.tsx",
      status: "Live",
    },
    {
      url: "/work/admin",
      label: "This admin map",
      description: "Admin index of AI Work resources.",
      filePath: "app/(core)/work/admin/page.tsx",
      status: "Live",
    },
  ],
  components: [
    {
      name: "AiWorkHeader",
      filePath: "features/ai-work/components/AiWorkHeader.tsx",
      description: "Shared responsive Overview / Conversations route switcher.",
      tier: "internal",
    },
    {
      name: "AiWorkOverview",
      filePath: "features/ai-work/components/AiWorkOverview.tsx",
      description: "Truthful directory of live platform capabilities.",
      tier: "internal",
    },
    {
      name: "ProviderConversationTranscript",
      filePath:
        "features/ai-work/components/ProviderConversationTranscript.tsx",
      description:
        "Read-only canonical-message transcript for external coding sessions.",
      tier: "internal",
    },
  ],
  relatedFeatures: [
    {
      name: "Agent Connections",
      description:
        "Owns the coding-session read model, provider diagnostics, MCP connections, and skills surface.",
    },
    {
      name: "Chat",
      description:
        "Owns canonical conversation rendering, actions, and AI Matrx execution.",
    },
    {
      name: "Tasks and Projects",
      description: "Owns work organization and association primitives.",
    },
    {
      name: "War Room",
      adminUrl: "/war-room/admin",
      description: "Owns multi-conversation command rooms.",
    },
  ],
};

export default function AiWorkAdminPage() {
  return <FeatureAdminPage map={AI_WORK_ADMIN_MAP} />;
}
