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
      url: "/work/new",
      label: "Start work (composer)",
      description:
        "Eight-step progressive composer: destination, request, expert system, skills, context, home, timing, review. AI Matrx execution only; provider destinations are capability-gated.",
      filePath: "app/(core)/work/new/page.tsx",
      status: "Live",
    },
    {
      url: "/work/requests",
      label: "Saved requests",
      description:
        "The caller's own saved requests (agent.shortcut rows under the seeded AI Work category). Open reloads the composer; delete soft-deletes.",
      filePath: "app/(core)/work/requests/page.tsx",
      status: "Live",
    },
    {
      url: "/work/conversations",
      label: "Provider conversation inbox",
      description:
        "Paginated canonical AI Matrx and provider conversations with exact selected binding facts and work associations.",
      filePath: "app/(core)/work/conversations/page.tsx",
      status: "Live",
    },
    {
      url: "/work/connections",
      label: "Connections and sync",
      description:
        "Separate provider account, authorization, client, delivery, managed-runtime, and historical-sync state.",
      filePath: "app/(core)/work/connections/page.tsx",
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
      description:
        "Shared responsive Overview / Start work / Conversations / Saved requests / Connections route switcher.",
      tier: "internal",
    },
    {
      name: "AiWorkComposer",
      filePath: "features/ai-work/compose/components/AiWorkComposer.tsx",
      description:
        "The /work/new progressive form. Composes launchAgentExecution, RunSkillPicker, the resource picker, ContextLensBar, and UniversalAssociationPicker; floats the run in LiveRunWindow.",
      tier: "internal",
    },
    {
      name: "SavedRequestsList",
      filePath: "features/ai-work/compose/components/SavedRequestsList.tsx",
      description:
        "Mine-scoped saved requests with open/run/delete doors and an honest empty state.",
      tier: "internal",
    },
    {
      name: "DestinationStep / HomeStep / ComposerSection",
      filePath: "features/ai-work/compose/components/DestinationStep.tsx",
      description:
        "Composer step primitives. DestinationStep renders every destination with its real availability reason.",
      tier: "internal",
    },
    {
      name: "AiWorkConversationsInbox",
      filePath: "features/ai-work/components/AiWorkConversationsInbox.tsx",
      description:
        "Unified canonical history with selected provider facts and Project/Task/War Room organization.",
      tier: "internal",
    },
    {
      name: "AiWorkConnections",
      filePath: "features/ai-work/components/AiWorkConnections.tsx",
      description:
        "Truthful connection-state composition and managed Claude capability check.",
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
