/**
 * Curated catalog of plausible ui_surface rows we MIGHT want to seed but
 * haven't yet. Drives the "Add from candidates" dialog on /admin/surfaces.
 *
 * Sourced from a one-time inventory of:
 *   - features/window-panels/registry/windowRegistry*.ts (the ~60 overlay set)
 *   - app/(authenticated)/** route tree
 *   - app/(public)/** route tree
 *   - features/agents/utils/shortcut-context-utils.ts
 *
 * The dialog filters out candidates that already exist in the live ui_surface
 * table, so this list can grow generously without producing duplicate-add
 * options.
 *
 * Maintenance: when a new top-level page or window-panel ships, add a row
 * here so admins can one-click activate it. This file is intentionally
 * NOT auto-generated — pruning judgment matters.
 */

// `chrome-extension` is the matrx-extend Chrome extension's surface identifier.
// The Phase 2 bridge has shipped: see the `chrome-extension/agent-bridge`
// candidate below. Two substrates carry the FRONTEND_RPC envelope between
// this app and the extension:
//   1. `chrome.runtime.sendMessage(extensionId, ...)` via the extension's
//      `externally_connectable` whitelist (same-machine, sub-ms RTT).
//   2. Supabase Broadcast on `matrx-extension-bridge:<userId>` — used when
//      the extension is on a different device. Subscribed in this repo via
//      `hooks/useExtensionBridgeChannel.ts`. The reference inbound route is
//      `app/api/extension/append-message/route.ts`.
// See:
//   - docs/MATRX_EXTEND_CONNECTION.md (this repo)
//   - matrx-extend's docs/CROSS_REPO_INTEGRATION.md
export interface SurfaceCandidate {
  /** Canonical `<client>/<local>` name. */
  name: string;
  /** FK target — must exist in ui_client. */
  client_name: "matrx-admin" | "matrx-user" | "matrx-public" | "chrome-extension";
  /** Short, agent-facing description (1 sentence). */
  description: string;
  /** Suggested sort_order; the dialog reuses this verbatim. */
  sort_order: number;
  /** Suggested initial active state; admin can override per-row in the dialog. */
  is_active: boolean;
  /** Free-text grouping shown in the candidates dialog header for that row. */
  group: "overlay" | "page" | "widget" | "debug" | "editor";
}

export const SURFACE_CANDIDATES: readonly SurfaceCandidate[] = [
  // matrx-user · pages already largely seeded — these are the gaps
  { name: "matrx-user/agent-shortcuts",  client_name: "matrx-user",  description: "Agent shortcut runner / launcher",                       sort_order: 280, is_active: true,  group: "page" },
  { name: "matrx-user/quick-utilities",  client_name: "matrx-user",  description: "Quick utility tools palette",                            sort_order: 290, is_active: false, group: "overlay" },

  // matrx-user · overlays from the window-panels registry not yet seeded
  { name: "matrx-user/code-workspace",         client_name: "matrx-user", description: "Full-screen code workspace",                  sort_order: 1200, is_active: false, group: "editor" },
  { name: "matrx-user/code-file-manager",      client_name: "matrx-user", description: "Code file browser overlay",                    sort_order: 1210, is_active: false, group: "overlay" },
  { name: "matrx-user/content-editor",         client_name: "matrx-user", description: "General content / document editor",            sort_order: 2100, is_active: false, group: "editor" },
  { name: "matrx-user/content-editor-list",    client_name: "matrx-user", description: "Multi-document list view",                     sort_order: 2110, is_active: false, group: "editor" },
  { name: "matrx-user/content-editor-workspace", client_name: "matrx-user", description: "Multi-tab document workspace",               sort_order: 2120, is_active: false, group: "editor" },
  { name: "matrx-user/cloud-files-overlay",    client_name: "matrx-user", description: "Cloud file browser overlay (vs page)",         sort_order: 1310, is_active: false, group: "overlay" },
  { name: "matrx-user/save-to-notes",          client_name: "matrx-user", description: "Save-to-notes capture widget",                 sort_order: 1320, is_active: false, group: "widget" },
  { name: "matrx-user/save-to-code",           client_name: "matrx-user", description: "Save-to-code-editor widget",                   sort_order: 1330, is_active: false, group: "widget" },
  { name: "matrx-user/markdown-editor-fullscreen", client_name: "matrx-user", description: "Full-screen markdown editor",              sort_order: 2150, is_active: false, group: "editor" },
  { name: "matrx-user/browser-frame",          client_name: "matrx-user", description: "Single-URL embedded iframe",                   sort_order: 1410, is_active: false, group: "overlay" },
  { name: "matrx-user/messages-window",        client_name: "matrx-user", description: "Messages window (vs page)",                    sort_order: 1420, is_active: false, group: "overlay" },
  { name: "matrx-user/single-message",         client_name: "matrx-user", description: "Single conversation thread overlay",           sort_order: 1430, is_active: false, group: "overlay" },
  { name: "matrx-user/context-switcher",       client_name: "matrx-user", description: "Scope / context switcher overlay",             sort_order: 1500, is_active: false, group: "overlay" },
  { name: "matrx-user/hierarchy-creation",     client_name: "matrx-user", description: "Org / project hierarchy creator",              sort_order: 1510, is_active: false, group: "overlay" },
  { name: "matrx-user/resource-picker",        client_name: "matrx-user", description: "Generic resource picker overlay",              sort_order: 1520, is_active: false, group: "overlay" },
  { name: "matrx-user/email-dialog",           client_name: "matrx-user", description: "Email composition dialog",                     sort_order: 1530, is_active: false, group: "overlay" },
  { name: "matrx-user/share-modal",            client_name: "matrx-user", description: "Resource sharing modal",                       sort_order: 1540, is_active: false, group: "overlay" },
  { name: "matrx-user/user-preferences",       client_name: "matrx-user", description: "User preferences modal (vs page)",             sort_order: 1550, is_active: false, group: "overlay" },

  // matrx-user · agent embedding widgets (rarely picked but worth listing)
  { name: "matrx-user/agent-full-modal",       client_name: "matrx-user", description: "Full-featured agent modal widget",             sort_order: 5010, is_active: false, group: "widget" },
  { name: "matrx-user/agent-compact-modal",    client_name: "matrx-user", description: "Compact agent modal widget",                   sort_order: 5020, is_active: false, group: "widget" },
  { name: "matrx-user/agent-chat-bubble",      client_name: "matrx-user", description: "Floating chat-bubble widget",                  sort_order: 5030, is_active: false, group: "widget" },
  { name: "matrx-user/agent-inline-overlay",   client_name: "matrx-user", description: "Inline agent overlay widget",                  sort_order: 5040, is_active: false, group: "widget" },
  { name: "matrx-user/agent-sidebar-overlay",  client_name: "matrx-user", description: "Sidebar agent overlay widget",                 sort_order: 5050, is_active: false, group: "widget" },
  { name: "matrx-user/agent-flexible-panel",   client_name: "matrx-user", description: "Flexible-layout agent widget",                 sort_order: 5060, is_active: false, group: "widget" },
  { name: "matrx-user/agent-floating-chat",    client_name: "matrx-user", description: "Floating chat agent widget",                   sort_order: 5070, is_active: false, group: "widget" },
  { name: "matrx-user/agent-toast-overlay",    client_name: "matrx-user", description: "Toast-style agent notification widget",        sort_order: 5080, is_active: false, group: "widget" },

  // matrx-admin · pages
  { name: "matrx-admin/system-agents/agents",    client_name: "matrx-admin", description: "System agent CRUD",                         sort_order: 250, is_active: false, group: "page" },
  { name: "matrx-admin/system-agents/edit",      client_name: "matrx-admin", description: "System agent editor",                       sort_order: 260, is_active: false, group: "page" },
  { name: "matrx-admin/system-agents/shortcuts", client_name: "matrx-admin", description: "System shortcut admin",                     sort_order: 270, is_active: false, group: "page" },
  { name: "matrx-admin/system-agents/categories",client_name: "matrx-admin", description: "Shortcut category admin",                   sort_order: 280, is_active: false, group: "page" },
  { name: "matrx-admin/system-agents/lineage",   client_name: "matrx-admin", description: "Agent lineage / version diff viewer",       sort_order: 290, is_active: false, group: "page" },
  { name: "matrx-admin/system-agents/apps",      client_name: "matrx-admin", description: "System agent apps admin",                   sort_order: 300, is_active: false, group: "page" },
  { name: "matrx-admin/agent-apps/apps",         client_name: "matrx-admin", description: "Agent-app admin: app CRUD",                 sort_order: 310, is_active: false, group: "page" },
  { name: "matrx-admin/agent-apps/analytics",    client_name: "matrx-admin", description: "Agent-app usage analytics",                 sort_order: 320, is_active: false, group: "page" },
  { name: "matrx-admin/agent-apps/categories",   client_name: "matrx-admin", description: "Agent-app categories",                      sort_order: 330, is_active: false, group: "page" },
  { name: "matrx-admin/agent-apps/executions",   client_name: "matrx-admin", description: "Agent-app execution log",                   sort_order: 340, is_active: false, group: "page" },
  { name: "matrx-admin/agent-apps/rate-limits",  client_name: "matrx-admin", description: "Agent-app rate-limit config",               sort_order: 350, is_active: false, group: "page" },
  { name: "matrx-admin/prompt-apps",             client_name: "matrx-admin", description: "Legacy prompt-app management",              sort_order: 360, is_active: false, group: "page" },
  { name: "matrx-admin/prompt-builtins",         client_name: "matrx-admin", description: "Built-in prompt library admin",             sort_order: 370, is_active: false, group: "page" },
  { name: "matrx-admin/content-blocks",          client_name: "matrx-admin", description: "Content block management",                  sort_order: 380, is_active: false, group: "page" },
  { name: "matrx-admin/content-templates",       client_name: "matrx-admin", description: "Content template library",                  sort_order: 390, is_active: false, group: "page" },
  { name: "matrx-admin/shortcut-categories",     client_name: "matrx-admin", description: "Shortcut categorization admin",             sort_order: 400, is_active: false, group: "page" },
  { name: "matrx-admin/ai-models/audit",         client_name: "matrx-admin", description: "AI model usage audit",                      sort_order: 410, is_active: false, group: "page" },
  { name: "matrx-admin/ai-models/provider-sync", client_name: "matrx-admin", description: "AI provider sync status",                   sort_order: 420, is_active: false, group: "page" },
  { name: "matrx-admin/ai-tasks",                client_name: "matrx-admin", description: "AI task definitions",                       sort_order: 430, is_active: false, group: "page" },
  { name: "matrx-admin/database/workbench",      client_name: "matrx-admin", description: "SQL workbench",                             sort_order: 440, is_active: false, group: "page" },
  { name: "matrx-admin/cx-dashboard/conversations", client_name: "matrx-admin", description: "Conversation log explorer",              sort_order: 450, is_active: false, group: "page" },
  { name: "matrx-admin/cx-dashboard/requests",   client_name: "matrx-admin", description: "API request log",                           sort_order: 460, is_active: false, group: "page" },
  { name: "matrx-admin/cx-dashboard/errors",     client_name: "matrx-admin", description: "Error log",                                 sort_order: 470, is_active: false, group: "page" },
  { name: "matrx-admin/cx-dashboard/usage",      client_name: "matrx-admin", description: "Usage metrics",                             sort_order: 480, is_active: false, group: "page" },
  { name: "matrx-admin/podcasts",                client_name: "matrx-admin", description: "Podcast management",                        sort_order: 490, is_active: false, group: "page" },
  { name: "matrx-admin/sandbox-infra",           client_name: "matrx-admin", description: "Sandbox infrastructure admin",              sort_order: 500, is_active: false, group: "page" },
  { name: "matrx-admin/resilience-lab",          client_name: "matrx-admin", description: "Resilience testing tools",                  sort_order: 510, is_active: false, group: "page" },
  { name: "matrx-admin/typescript-errors",       client_name: "matrx-admin", description: "TypeScript error tracker",                  sort_order: 520, is_active: false, group: "page" },
  { name: "matrx-admin/invitation-requests",     client_name: "matrx-admin", description: "User invitation request queue",             sort_order: 530, is_active: false, group: "page" },
  { name: "matrx-admin/all-routes",              client_name: "matrx-admin", description: "Full route index",                          sort_order: 540, is_active: false, group: "page" },
  { name: "matrx-admin/experimental-routes",     client_name: "matrx-admin", description: "Experimental routes index",                 sort_order: 550, is_active: false, group: "page" },

  // matrx-admin · debug overlays from the window-panels registry
  { name: "matrx-admin/agent-optimizer",       client_name: "matrx-admin", description: "Agent optimization tool (stub)",              sort_order: 9210, is_active: false, group: "debug" },
  { name: "matrx-admin/agent-interface-variations", client_name: "matrx-admin", description: "Agent UI variant tester (stub)",         sort_order: 9220, is_active: false, group: "debug" },
  { name: "matrx-admin/agent-find-usages",     client_name: "matrx-admin", description: "Agent usages finder (stub)",                  sort_order: 9230, is_active: false, group: "debug" },
  { name: "matrx-admin/agent-data-storage",    client_name: "matrx-admin", description: "Agent data-storage helper (stub)",            sort_order: 9240, is_active: false, group: "debug" },
  { name: "matrx-admin/agent-convert-system",  client_name: "matrx-admin", description: "Convert agent to system agent",               sort_order: 9250, is_active: false, group: "debug" },

  // matrx-public
  { name: "matrx-public/canvas/discover",      client_name: "matrx-public", description: "Public canvas discovery",                    sort_order: 200, is_active: false, group: "page" },
  { name: "matrx-public/canvas/shared",        client_name: "matrx-public", description: "Shared public canvases",                     sort_order: 210, is_active: false, group: "page" },
  { name: "matrx-public/contact",              client_name: "matrx-public", description: "Contact form",                               sort_order: 220, is_active: false, group: "page" },
  { name: "matrx-public/request-access",       client_name: "matrx-public", description: "Access request form",                        sort_order: 230, is_active: false, group: "page" },
  { name: "matrx-public/privacy-policy",       client_name: "matrx-public", description: "Privacy policy page",                        sort_order: 240, is_active: false, group: "page" },

  // chrome-extension (matrx-extend) · bridge surface for cross-repo RPC.
  // The extension reaches this app over two substrates carrying the same
  // FRONTEND_RPC envelope: `chrome.runtime.sendMessage(extensionId, ...)`
  // (same machine, externally_connectable) and Supabase Broadcast on
  // `matrx-extension-bridge:<userId>` (cross machine). See
  // docs/MATRX_EXTEND_CONNECTION.md and hooks/useExtensionBridgeChannel.ts.
  { name: "chrome-extension/agent-bridge",     client_name: "chrome-extension", description: "matrx-extend bridge surface — FRONTEND_RPC over chrome.runtime + Supabase Broadcast", sort_order: 100, is_active: false, group: "widget" },
];
