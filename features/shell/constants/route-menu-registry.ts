// route-menu-registry.ts — Maps pathname patterns to dynamically-imported
// route menu components for Large Routes.
//
// Each entry defines:
//   - pathPattern:      regex tested against window.location.pathname
//   - iconName:         Lucide icon name shown on the switch button
//   - label:            accessible label for the switch button
//   - importFn:         dynamic import → route menu body component
//   - headerImportFn:   optional dynamic import → route header component
//                       replaces sidebar brand area content when active
//
// Menu component receives:  { expanded: boolean }
// Header component receives: { expanded: boolean }

export interface RouteMenuEntry {
  pathPattern: RegExp;
  iconName: string;
  label: string;
  importFn: () => Promise<{
    default: React.ComponentType<{ expanded: boolean }>;
  }>;
  headerImportFn?: () => Promise<{
    default: React.ComponentType<{ expanded: boolean }>;
  }>;
}

export const routeMenuRegistry: RouteMenuEntry[] = [
  {
    pathPattern: /^\/agents\/[^/]+\/run/,
    iconName: "Webhook",
    label: "Agent Runs",
    importFn: () =>
      import("@/features/agents/components/shell/AgentRunSidebarMenu"),
  },
  {
    pathPattern: /^\/chat(?:\/|$)/,
    iconName: "MessageCircle",
    label: "Chats",
    importFn: () =>
      import("@/features/agents/components/chat/ChatSidebarMenu"),
  },
];
