// route-menu-registry.ts — Maps pathname patterns to dynamically-imported
// route menu components for Large Routes.
//
// Each entry defines:
//   - pathPattern:      regex tested against window.location.pathname
//   - iconName:         Lucide icon name shown on the switch button
//   - label:            accessible label for the switch button
//   - importFn:         loader → route menu body component (its import() lives in the
//                       "use client" route-menu-loaders.ts: this file is read on the server too)
//   - headerImportFn:   optional dynamic import → route header component
//                       replaces sidebar brand area content when active
//
// Menu component receives:  { expanded: boolean }
// Header component receives: { expanded: boolean }
// Large route families own one menu here. Route pages must not recreate a
// competing page-local sidebar; sub-view choices belong in one shared header
// RouteModeNav.

import { AGENT_RUN_PATH_PATTERN } from "@ai-matrx/chat/agents/components/shell/agent-run-route";
import { RESEARCH_TOPIC_PATH_PATTERN } from "@/features/research/components/shell/research-topic-route";
import { USER_SETTINGS_PATH_PATTERN } from "@/features/settings/route-shell/settings-route-path";
import type { ShellIconName } from "@/features/shell/shellIconMap";
import { CANVAS_WORKSPACE_MENU_PATTERN } from "./canvas-chrome-routes";
import {
  loadAdminRouteSidebarMenu,
  loadAgentRunSidebarMenu,
  loadChatSidebarMenu,
  loadCodeSidebarMenu,
  loadImagesSidebarMenu,
  loadMarketingSidebarMenu,
  loadResearchTopicSidebarMenu,
  loadSettingsRouteMenu,
  loadStaffSidebarMenu,
} from "./route-menu-loaders";

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
  /**
   * THE DOMAIN PANEL (owner, 2026-10-01: the icon strip never changes; a
   * domain's own menu sits BESIDE it, never in its place). On a desktop the
   * main menu stays as the icon strip and this family's menu fills a panel
   * next to it — no flip. The sidebar toggle opens and closes the panel.
   * Phones keep the drawer's flip until the drawer is rebuilt the same way.
   */
  layout?: "panel";
}

/** Whether this pathname shows its domain menu as a panel beside the strip. */
export function isDomainPanelPath(pathname: string): boolean {
  const entry = routeMenuRegistry.find((e) => e.pathPattern.test(pathname));
  return entry?.layout === "panel";
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
    layout: "panel",
    importFn: loadSettingsRouteMenu,
  },
  {
    pathPattern: AGENT_RUN_PATH_PATTERN,
    iconName: "Webhook",
    label: "Agent Runs",
    layout: "panel",
    importFn: loadAgentRunSidebarMenu,
  },
  {
    pathPattern: /^\/administration(?:\/|$)/,
    iconName: "ShieldCheck",
    label: "Administration",
    importFn: loadAdminRouteSidebarMenu,
  },
  {
    // Pages that carry their own chat panel (the Board, signed-in Education):
    // the SAME chat menu, opening conversations in that panel
    // (in-place-chat-host), behind the switch — the app menu stays in front.
    pathPattern: CANVAS_WORKSPACE_MENU_PATTERN,
    iconName: "MessageCircle",
    label: "Chats",
    defaultView: "main",
    importFn: loadChatSidebarMenu,
  },
  {
    pathPattern: /^\/chat(?:\/|$)/,
    iconName: "MessageCircle",
    label: "Chats",
    layout: "panel",
    importFn: loadChatSidebarMenu,
  },
  {
    pathPattern: /^\/staff(?:\/|$)/,
    iconName: "Users",
    label: "Your staff",
    layout: "panel",
    importFn: loadStaffSidebarMenu,
  },
  {
    pathPattern: /^\/code(?:\/|$)/,
    iconName: "Code2",
    label: "Code Workspace",
    layout: "panel",
    importFn: loadCodeSidebarMenu,
  },
  {
    pathPattern: /^\/marketing(?:\/|$)/,
    iconName: "TrendingUp",
    label: "Marketing",
    layout: "panel",
    importFn: loadMarketingSidebarMenu,
  },
  {
    pathPattern: RESEARCH_TOPIC_PATH_PATTERN,
    iconName: "FlaskConical",
    label: "Research Topic",
    layout: "panel",
    importFn: loadResearchTopicSidebarMenu,
  },
  {
    pathPattern: /^\/images(?:\/|$)/,
    iconName: "Images",
    label: "Images",
    layout: "panel",
    importFn: loadImagesSidebarMenu,
  },
];
