/**
 * Canonical administration information architecture.
 *
 * This is the ONE hierarchy consumed by the dashboard, route-specific shell
 * menu, header tree, route directory, and release-time route audit:
 *
 *   domain → section → destination
 *
 * `admin-categories.ts` remains the metadata catalog for titles,
 * descriptions, and icons. Placement and route ownership live only here.
 * Every page below `app/(admin)/administration` must appear either as a
 * destination link or in that destination's `ownedRoutes`. The release audit
 * compares those declarations to the filesystem exactly; parent-prefix
 * inference is deliberately forbidden.
 */

import {
  adminCategoriesData,
  type AdminToolLink,
} from "@/features/admin/constants/admin-categories";

export interface AdminNavigationDestination extends AdminToolLink {
  /**
   * Exact additional page patterns owned by this destination but not rendered
   * as separate menu rows (detail pages, editors, and dynamic leaves).
   */
  ownedRoutes: readonly string[];
}

export interface AdminNavigationSection {
  name: string;
  iconName: string;
  destinations: readonly AdminNavigationDestination[];
}

export interface AdminNavigationDomain {
  name: string;
  iconName: string;
  iconColor: string;
  sections: readonly AdminNavigationSection[];
}

const toolsByLink = new Map<string, AdminToolLink>();
for (const category of adminCategoriesData) {
  for (const tool of category.features) {
    if (!toolsByLink.has(tool.link)) toolsByLink.set(tool.link, tool);
  }
}

function destination(
  link: string,
  ownedRoutes: readonly string[] = [],
): AdminNavigationDestination {
  const tool = toolsByLink.get(link);
  if (!tool) {
    throw new Error(
      `[admin-navigation] Missing tool metadata for declared destination: ${link}`,
    );
  }
  return { ...tool, ownedRoutes };
}

export const adminNavigationRegistry: readonly AdminNavigationDomain[] = [
  {
    name: "AI",
    iconName: "Brain",
    iconColor: "text-violet-600",
    sections: [
      {
        name: "Models",
        iconName: "Brain",
        destinations: [
          destination("/administration/ai-models"),
          destination("/administration/ai-models/audit"),
          destination("/administration/ai-models/deprecated-audit"),
          destination("/administration/ai-models/provider-sync"),
          destination("/administration/ai-models/providers"),
          destination("/administration/ai-models/endpoints"),
          destination("/administration/ai-models/offerings"),
          destination("/administration/ai-models/settings"),
          destination("/administration/ai-models/aliases"),
        ],
      },
      {
        name: "Operations",
        iconName: "Activity",
        destinations: [destination("/administration/ai-tasks")],
      },
    ],
  },
  {
    name: "Agents",
    iconName: "Webhook",
    iconColor: "text-rose-600",
    sections: [
      {
        name: "System Agents",
        iconName: "Webhook",
        destinations: [
          destination("/administration/system-agents"),
          destination("/administration/system-agents/agents", [
            "/administration/system-agents/agents/[id]",
            "/administration/system-agents/agents/[id]/apps",
            "/administration/system-agents/agents/[id]/build",
            "/administration/system-agents/agents/[id]/latest",
            "/administration/system-agents/agents/[id]/run",
            "/administration/system-agents/agents/[id]/surfaces",
            "/administration/system-agents/agents/[id]/surfaces/batch",
            "/administration/system-agents/agents/[id]/v/[version]",
            "/administration/system-agents/agents/[id]/widgets",
            "/administration/system-agents/edit/[id]",
          ]),
          destination("/administration/system-agents/shortcuts", [
            "/administration/system-agents/agents/[id]/shortcuts",
            "/administration/system-agents/agents/[id]/shortcuts/[shortcutId]",
            "/administration/system-agents/agents/[id]/shortcuts/batch",
            "/administration/system-agents/agents/[id]/shortcuts/new",
            "/administration/system-agents/shortcuts/[shortcutId]",
          ]),
          destination("/administration/system-agents/categories"),
          destination("/administration/system-agents/content-blocks"),
          destination("/administration/system-agents/apps"),
          destination("/administration/system-agents/lineage"),
          destination("/administration/system-agents/agents/new"),
          destination("/administration/system-agents/agents/new/manual"),
          destination("/administration/system-agents/apps/new"),
          destination("/administration/system-agents/shortcuts/all"),
        ],
      },
      {
        name: "Published Agent Apps",
        iconName: "Boxes",
        destinations: [
          destination("/administration/agent-apps"),
          destination("/administration/agent-apps/apps", [
            "/administration/agent-apps/edit/[id]",
          ]),
          destination("/administration/agent-apps/categories"),
          destination("/administration/agent-apps/executions"),
          destination("/administration/agent-apps/analytics"),
          destination("/administration/agent-apps/rate-limits"),
        ],
      },
      {
        name: "Skills",
        iconName: "BookOpen",
        destinations: [
          destination("/administration/skills"),
          destination("/administration/skills/categories"),
          destination("/administration/skills/ingest"),
        ],
      },
      {
        name: "Tools & MCP",
        iconName: "Wrench",
        destinations: [
          destination("/administration/relationships/actions"),
          destination("/administration/mcp-tools", [
            "/administration/mcp-tools/[toolId]",
            "/administration/mcp-tools/[toolId]/edit",
            "/administration/mcp-tools/[toolId]/incidents",
            "/administration/mcp-tools/[toolId]/ui",
          ]),
          destination("/administration/mcp-servers"),
          destination("/administration/bundles"),
          destination("/administration/executor-surfaces"),
          destination("/administration/lookups"),
          destination("/administration/mcp-tools/new"),
        ],
      },
      {
        name: "Health & Drift",
        iconName: "Activity",
        destinations: [
          destination("/administration/reports/agent-drift"),
        ],
      },
    ],
  },
  {
    name: "Chat",
    iconName: "MessageCircle",
    iconColor: "text-cyan-600",
    sections: [
      {
        name: "CX Conversations",
        iconName: "MessageSquare",
        destinations: [
          destination("/administration/cx-dashboard"),
          destination("/administration/cx-dashboard/conversations", [
            "/administration/cx-dashboard/conversations/[id]",
          ]),
          destination("/administration/cx-dashboard/requests", [
            "/administration/cx-dashboard/requests/[id]",
          ]),
          destination("/administration/cx-dashboard/usage"),
          destination("/administration/cx-dashboard/errors"),
        ],
      },
    ],
  },
  {
    name: "Knowledge",
    iconName: "LibraryBig",
    iconColor: "text-emerald-600",
    sections: [
      {
        name: "Knowledge Graph",
        iconName: "Network",
        destinations: [
          destination("/administration/kg-cost"),
          destination("/administration/kg-inspector"),
        ],
      },
      {
        name: "Research",
        iconName: "Search",
        destinations: [destination("/administration/research-system")],
      },
      {
        name: "Podcasts",
        iconName: "Mic",
        destinations: [
          destination("/administration/podcasts"),
          destination("/administration/podcasts/shows", [
            "/administration/podcasts/shows/[showId]",
            "/administration/podcasts/shows/[showId]/episodes/[episodeId]",
          ]),
          destination("/administration/podcasts/shows/new"),
        ],
      },
      {
        name: "CMS",
        iconName: "Globe",
        destinations: [destination("/administration/cms-agents")],
      },
    ],
  },
  {
    name: "Scopes & Context",
    iconName: "Tags",
    iconColor: "text-sky-600",
    sections: [
      {
        name: "Context",
        iconName: "Globe",
        destinations: [
          destination("/administration/system-context"),
          destination("/administration/context-inspector"),
        ],
      },
    ],
  },
  {
    name: "Database",
    iconName: "Database",
    iconColor: "text-blue-600",
    sections: [
      {
        name: "Database Tools",
        iconName: "DatabaseZap",
        destinations: [
          destination("/administration/database"),
          destination("/administration/database-admin"),
          destination("/administration/database/sql-queries"),
          destination("/administration/database/workbench"),
          destination("/administration/database/sql-functions"),
          destination("/administration/database/enums"),
          destination("/legacy/administration/schema-manager"),
        ],
      },
      {
        name: "Relationships & Access Graph",
        iconName: "Network",
        destinations: [
          destination("/administration/relationships"),
          destination("/administration/relationships/rules"),
          destination("/administration/relationships/entity-types"),
          destination("/administration/relationships/explorer", [
            "/administration/relationships/explorer/[token]",
          ]),
          destination("/administration/relationships/reachability"),
          destination("/administration/relationships/sharing"),
        ],
      },
      {
        name: "Canonicalization",
        iconName: "ShieldCheck",
        destinations: [
          destination("/administration/canonicalization"),
          destination("/administration/canonicalization/summary"),
          destination("/administration/canonicalization/findings"),
          destination("/administration/canonicalization/broken-functions"),
          destination("/administration/canonicalization/candidates"),
          destination("/administration/canonicalization/function-deps"),
          destination("/administration/canonicalization/table-impact"),
          destination("/administration/canonicalization/verify"),
        ],
      },
      {
        name: "Schema Visualization",
        iconName: "Waypoints",
        destinations: [
          destination("/administration/schema-visualizer"),
          destination("/administration/schema-visualizer-enhanced"),
        ],
      },
      {
        name: "Integrity",
        iconName: "ShieldCheck",
        destinations: [destination("/administration/data-integrity")],
      },
    ],
  },
  {
    name: "UI",
    iconName: "PanelsTopLeft",
    iconColor: "text-lime-600",
    sections: [
      {
        name: "Surfaces",
        iconName: "Layout",
        destinations: [
          destination("/administration/surfaces", [
            "/administration/surfaces/[...name]",
          ]),
          destination("/administration/surfaces?drift=1"),
        ],
      },
      {
        name: "Component Lab",
        iconName: "Component",
        destinations: [
          destination("/administration/official-components", [
            "/administration/official-components/[componentId]",
          ]),
          destination(
            "/administration/official-components/to-be-added/toggle-menu-demo",
          ),
          destination(
            "/administration/official-components/to-be-added/toggle-menu-demo/toggle-with-categories",
          ),
        ],
      },
      {
        name: "Experiments",
        iconName: "Beaker",
        destinations: [destination("/administration/experimental-routes")],
      },
      {
        name: "Windowing",
        iconName: "PanelTop",
        destinations: [destination("/administration/persistence-test")],
      },
    ],
  },
  {
    name: "Automation",
    iconName: "CalendarClock",
    iconColor: "text-indigo-600",
    sections: [
      {
        name: "Scheduling",
        iconName: "CalendarClock",
        destinations: [
          destination("/administration/scheduling"),
          destination("/administration/scheduling/tasks"),
          destination("/administration/scheduling/runs"),
          destination("/administration/scheduling/orphan-leases"),
          destination("/administration/scheduling/cron-tester"),
          destination("/administration/scheduling/scanner-health"),
          destination("/administration/scheduling/templates"),
        ],
      },
    ],
  },
  {
    name: "Applications",
    iconName: "MonitorCog",
    iconColor: "text-indigo-600",
    sections: [
      {
        name: "Shipped Clients",
        iconName: "MonitorCog",
        destinations: [
          destination("/administration/applications"),
          destination("/administration/applications/configuration"),
          destination("/administration/applications/catalogs"),
          destination("/administration/applications/installations"),
          destination("/administration/applications/history"),
        ],
      },
    ],
  },
  {
    name: "Users",
    iconName: "Users",
    iconColor: "text-sky-600",
    sections: [
      {
        name: "Accounts & Access",
        iconName: "Users",
        destinations: [
          destination("/administration/users"),
          destination("/administration/users/preferences"),
          destination("/administration/users/admins"),
          destination("/administration/users/invitations"),
          destination("/administration/users/entitlements"),
          destination("/administration/users/usage"),
        ],
      },
      {
        name: "Communications",
        iconName: "Mail",
        destinations: [
          destination("/administration/users/email"),
          destination("/administration/users/announcements"),
          destination("/administration/feedback"),
        ],
      },
    ],
  },
  {
    name: "Compute",
    iconName: "Server",
    iconColor: "text-orange-600",
    sections: [
      {
        name: "Sandbox & Infrastructure",
        iconName: "Container",
        destinations: [
          destination("/administration/sandbox-infra"),
          destination("/administration/sandbox"),
          destination("/administration/server-logs", [
            "/administration/server-logs/[app]",
          ]),
          destination("/administration/resilience-lab"),
        ],
      },
    ],
  },
  {
    name: "Utilities",
    iconName: "Wrench",
    iconColor: "text-green-600",
    sections: [
      {
        name: "Content & Rendering",
        iconName: "Braces",
        destinations: [
          destination("/administration/content-blocks"),
          destination("/administration/content-templates"),
          destination("/administration/markdown-tester"),
          destination("/administration/kind-registry", [
            "/administration/kind-registry/[kind]",
          ]),
        ],
      },
      {
        name: "Files & Browser Storage",
        iconName: "Folder",
        destinations: [
          destination("/administration/local-storage"),
          destination("/administration/blob-cache"),
        ],
      },
      {
        name: "Developer Utilities",
        iconName: "Code2",
        destinations: [
          destination("/administration/all-routes"),
          destination("/administration/server-cache"),
          destination("/administration/typescript-errors"),
          destination("/administration/utils"),
          destination("/administration/utils/text-cleaner"),
        ],
      },
    ],
  },
  {
    name: "Documentation",
    iconName: "BookOpen",
    iconColor: "text-purple-600",
    sections: [
      {
        name: "Feature Documentation",
        iconName: "FileText",
        destinations: [
          destination("/administration/feature-docs"),
          destination("/administration/feature-docs/codebase"),
          destination("/administration/feature-docs/docs", [
            "/administration/feature-docs/view/[[...path]]",
          ]),
          destination("/administration/feature-docs/dotdirs", [
            "/administration/feature-docs/dotdirs/[slug]",
          ]),
        ],
      },
    ],
  },
  {
    name: "Reporting",
    iconName: "ChartNoAxesCombined",
    iconColor: "text-violet-600",
    sections: [
      {
        name: "Platform Reporting",
        iconName: "BarChart3",
        destinations: [
          destination("/administration/reports"),
          destination("/administration/events"),
        ],
      },
    ],
  },
] as const;

export interface AdminNavigationLocation {
  domain: AdminNavigationDomain;
  section: AdminNavigationSection;
  destination: AdminNavigationDestination;
}

export function getAdminNavigationLocations(): AdminNavigationLocation[] {
  return adminNavigationRegistry.flatMap((domain) =>
    domain.sections.flatMap((section) =>
      section.destinations.map((item) => ({
        domain,
        section,
        destination: item,
      })),
    ),
  );
}

function pathOnly(path: string): string {
  return (path.split("?")[0] ?? path).replace(/\/$/, "");
}

/** Exact declared page patterns, including hidden/detail leaves. */
export function getDeclaredAdminRoutePatterns(): string[] {
  const routes = new Set<string>();
  for (const { destination: item } of getAdminNavigationLocations()) {
    if (item.link.startsWith("/administration")) routes.add(pathOnly(item.link));
    for (const route of item.ownedRoutes) routes.add(pathOnly(route));
  }
  return [...routes].sort();
}

function routePatternRegex(pattern: string): RegExp {
  const parts = pathOnly(pattern).split("/").filter(Boolean);
  let source = "^";
  for (const part of parts) {
    if (/^\[\[\.\.\..+\]\]$/.test(part)) {
      source += "(?:/.*)?";
    } else if (/^\[\.\.\..+\]$/.test(part)) {
      source += "/.+";
    } else if (/^\[.+\]$/.test(part)) {
      source += "/[^/]+";
    } else {
      source += `/${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    }
  }
  return new RegExp(`${source}/?$`);
}

export function destinationOwnsPathname(
  item: AdminNavigationDestination,
  pathname: string,
): boolean {
  const patterns = [item.link, ...item.ownedRoutes];
  return patterns.some((pattern) => routePatternRegex(pattern).test(pathname));
}

export function findAdminNavigationLocation(
  pathname: string,
): AdminNavigationLocation | null {
  return (
    getAdminNavigationLocations().find(({ destination: item }) =>
      destinationOwnsPathname(item, pathname),
    ) ?? null
  );
}

/** Resolve an exact filesystem route pattern such as `mcp-tools/[toolId]`. */
export function findAdminNavigationLocationByRoutePattern(
  route: string,
): AdminNavigationLocation | null {
  const fullRoute = pathOnly(
    route.startsWith("/administration")
      ? route
      : `/administration/${route.replace(/^\//, "")}`,
  );
  return (
    getAdminNavigationLocations().find(({ destination: item }) =>
      [item.link, ...item.ownedRoutes].some(
        (pattern) => pathOnly(pattern) === fullRoute,
      ),
    ) ?? null
  );
}

export function adminDomainHref(domainName: string): string {
  return `/administration?domain=${encodeURIComponent(domainName)}`;
}
