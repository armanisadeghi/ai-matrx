"use client";

// route-menu-loaders.ts — the `import()` of every Large Route's sidebar menu, in a CLIENT module.
//
// route-menu-registry.ts is also read on the SERVER (AppShell → isDomainPanelPath, the sidebar's
// initial view). On the server side Turbopack has no async boundary: an `import()` of a client
// component from a server module makes that component a client REFERENCE of the layout, so every
// menu (and everything under it) shipped in the first load of every signed-in route (lane AE,
// 2026-10-08; guard: pnpm check:shell-eager-graph). Here the `import()`s are client-side async
// chunks again — a menu loads only on its own route family. The server sees these exports as
// client references and never calls them.

export const loadSettingsRouteMenu = () => import("@/features/settings/route-menu/SettingsRouteMenu");
export const loadAgentRunSidebarMenu = () => import("@ai-matrx/chat/agents/components/shell/AgentRunSidebarMenu");
export const loadAdminRouteSidebarMenu = () => import("@/features/admin/components/AdminRouteSidebarMenu");
export const loadChatSidebarMenu = () => import("@ai-matrx/chat/agents/components/chat/ChatSidebarMenu");
export const loadStaffSidebarMenu = () => import("@/features/personal-staff/components/StaffSidebarMenu");
export const loadCodeSidebarMenu = () => import("@/features/code/shell/CodeSidebarMenu");
export const loadMarketingSidebarMenu = () => import("@/features/marketing/components/shell/MarketingSidebarMenu");
export const loadResearchTopicSidebarMenu = () =>
  import("@/features/research/components/shell/ResearchTopicSidebarMenu");
export const loadImagesSidebarMenu = () => import("@/features/image-manager/components/ImagesSidebarMenu");
