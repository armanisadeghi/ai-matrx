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
// Large route families own one menu here. Route pages must not recreate a
// competing page-local sidebar; sub-view choices belong in one shared header
// RouteModeNav.

import { AGENT_RUN_PATH_PATTERN } from "@/features/agents/components/shell/agent-run-route";
import { RESEARCH_TOPIC_PATH_PATTERN } from "@/features/research/components/shell/research-topic-route";
import { USER_SETTINGS_PATH_PATTERN } from "@/features/settings/route-shell/settings-route-path";
import type { ShellIconName } from "@/features/shell/shellIconMap";
import { CANVAS_WORKSPACE_MENU_PATTERN } from "./canvas-chrome-routes";

export interface RouteMenuEntry {
  pathPattern: RegExp;
  iconName: ShellIconName;
  label: string;
  importFn: () => Promise<{
    default: React.ComponentType<{ expanded: boolean }>;
  }>;
  headerImportFn?: () => Promise<{
    default: React.ComponentType<{ expanded: boolean }>;
  }>;
  /**
   * Which side the sidebar opens on in this family. Default "route" (a Large
   * Route shows its own menu). "main" keeps the app menu in front and offers
   * the route menu behind the switch — the canvas workspace's Chats (owner,
   * 2026-09-30: the normal menu by default, chat history only on a flip).
   */
  defaultView?: "main" | "route";
}

/** The side a matched family opens on — one rule for the desktop slot, the phone drawer and SSR. */
export function routeMenuDefaultView(entry: RouteMenuEntry | null): "main" | "route" {
  if (!entry) return "main";
  return entry.defaultView ?? "route";
}

export const routeMenuRegistry: RouteMenuEntry[] = [
  {
    pathPattern: USER_SETTINGS_PATH_PATTERN,
    iconName: "Settings",
    label: "Settings",
    importFn: () => import("@/features/settings/route-menu/SettingsRouteMenu"),
  },
  {
    // The account pages under /settings (Profile, Connectors, Vault, Sandbox…)
    // — their menu used to be a second sidebar + a second bottom dock inside
    // the page.
    // Two of its rows live outside /settings (Vault, Agent shortcuts); the
    // menu stays with them so a click never makes it vanish.
    pathPattern: /^\/(?:settings|vault|agents\/shortcuts)(?:\/|$)/,
    iconName: "User",
    label: "Account",
    importFn: () => import("@/features/settings/route-menu/AccountSettingsRouteMenu"),
  },
  {
    pathPattern: AGENT_RUN_PATH_PATTERN,
    iconName: "Webhook",
    label: "Agent Runs",
    importFn: () =>
      import("@/features/agents/components/shell/AgentRunSidebarMenu"),
  },
  {
    pathPattern: /^\/administration(?:\/|$)/,
    iconName: "ShieldCheck",
    label: "Administration",
    importFn: () => import("@/features/admin/components/AdminRouteSidebarMenu"),
  },
  {
    // Pages that carry their own chat panel (the Board, signed-in Education):
    // the SAME chat menu, opening conversations in that panel
    // (in-place-chat-host), behind the switch — the app menu stays in front.
    pathPattern: CANVAS_WORKSPACE_MENU_PATTERN,
    iconName: "MessageCircle",
    label: "Chats",
    defaultView: "main",
    importFn: () => import("@/features/agents/components/chat/ChatSidebarMenu"),
  },
  {
    pathPattern: /^\/chat(?:\/|$)/,
    iconName: "MessageCircle",
    label: "Chats",
    importFn: () => import("@/features/agents/components/chat/ChatSidebarMenu"),
  },
  {
    pathPattern: /^\/staff(?:\/|$)/,
    iconName: "Users",
    label: "Your staff",
    importFn: () =>
      import("@/features/personal-staff/components/StaffSidebarMenu"),
  },
  {
    pathPattern: /^\/code(?:\/|$)/,
    iconName: "Code2",
    label: "Code Workspace",
    importFn: () => import("@/features/code/shell/CodeSidebarMenu"),
  },
  {
    pathPattern: /^\/marketing(?:\/|$)/,
    iconName: "TrendingUp",
    label: "Marketing",
    importFn: () =>
      import("@/features/marketing/components/shell/MarketingSidebarMenu"),
  },
  {
    pathPattern: RESEARCH_TOPIC_PATH_PATTERN,
    iconName: "FlaskConical",
    label: "Research Topic",
    importFn: () =>
      import("@/features/research/components/shell/ResearchTopicSidebarMenu"),
  },
  {
    pathPattern: /^\/images(?:\/|$)/,
    iconName: "Images",
    label: "Images",
    importFn: () =>
      import("@/features/image-manager/components/ImagesSidebarMenu"),
  },
];
