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
  ADMIN_LAUNCHPAD_PATH,
  adminCategoriesData,
  type AdminToolLink,
} from "@/features/admin/constants/admin-categories";
import { INTELLIGENCE_ICON_NAME } from "@/components/icons/domain-icons";

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
  /** Canonical static App Router segment below `/administration`. */
  slug: string;
  iconName: string;
  iconColor: string;
  sections: readonly AdminNavigationSection[];
  /**
   * Set ONLY on a domain that keeps an older route family alive beside its new
   * home until the owner validates the move (no redirects until then). Its
   * routes stay declared and working, and are reached from inside the new
   * home — the domain is never a menu row. The value is the new home's link;
   * a page in this domain highlights that destination in the menu.
   */
  supersededBy?: string;
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
    name: "Launchpad",
    slug: "launchpad",
    iconName: "Rocket",
    iconColor: "text-sky-600",
    sections: [
      {
        name: "Overview",
        iconName: "LayoutGrid",
        destinations: [destination(ADMIN_LAUNCHPAD_PATH)],
      },
    ],
  },
  {
    name: "AI",
    slug: "ai",
    iconName: "Brain",
    iconColor: "text-violet-600",
    sections: [
      {
        name: "Models",
        iconName: "Brain",
        destinations: [
          destination("/administration/ai/ai-models"),
          destination("/administration/ai/ai-models/audit"),
          destination("/administration/ai/ai-models/deprecated-audit"),
          destination("/administration/ai/ai-models/provider-sync"),
          destination("/administration/ai/ai-models/providers"),
          destination("/administration/ai/ai-models/endpoints"),
          destination("/administration/ai/ai-models/offerings"),
          destination("/administration/ai/ai-models/settings"),
          destination("/administration/ai/ai-models/aliases"),
        ],
      },
      {
        name: "Operations",
        iconName: "Activity",
        destinations: [destination("/administration/ai/ai-tasks")],
      },
    ],
  },
  {
    name: "Agents",
    slug: "agents",
    iconName: "Webhook",
    iconColor: "text-rose-600",
    sections: [
      {
        name: "System Agents",
        iconName: "Webhook",
        destinations: [
          destination("/administration/agents/system-agents"),
          destination("/administration/agents/system-agents/agents", [
            "/administration/agents/system-agents/agents/[id]",
            "/administration/agents/system-agents/agents/[id]/apps",
            "/administration/agents/system-agents/agents/[id]/build",
            "/administration/agents/system-agents/agents/[id]/latest",
            "/administration/agents/system-agents/agents/[id]/run",
            "/administration/agents/system-agents/agents/[id]/samples",
            "/administration/agents/system-agents/agents/[id]/surfaces",
            "/administration/agents/system-agents/agents/[id]/surfaces/batch",
            "/administration/agents/system-agents/agents/[id]/v/[version]",
            "/administration/agents/system-agents/agents/[id]/widgets",
            "/administration/agents/system-agents/edit/[id]",
          ]),
          destination("/administration/agents/system-agents/shortcuts", [
            "/administration/agents/system-agents/agents/[id]/shortcuts",
            "/administration/agents/system-agents/agents/[id]/shortcuts/[shortcutId]",
            "/administration/agents/system-agents/agents/[id]/shortcuts/batch",
            "/administration/agents/system-agents/agents/[id]/shortcuts/new",
            "/administration/agents/system-agents/shortcuts/agents",
            "/administration/agents/system-agents/shortcuts/apps",
            "/administration/agents/system-agents/shortcuts/categories",
            "/administration/agents/system-agents/shortcuts/content-blocks",
            "/administration/agents/system-agents/shortcuts/[shortcutId]",
            "/administration/agents/system-agents/shortcuts/lineage",
          ]),
          destination("/administration/agents/system-agents/categories"),
          destination("/administration/agents/system-agents/content-blocks"),
          destination("/administration/agents/system-agents/apps"),
          destination("/administration/agents/system-agents/lineage"),
          destination("/administration/agents/system-agents/agents/new"),
          destination("/administration/agents/system-agents/agents/new/manual"),
          destination("/administration/agents/system-agents/apps/new"),
          destination("/administration/agents/system-agents/shortcuts/all"),
        ],
      },
      {
        name: "Published Agent Apps",
        iconName: "Boxes",
        destinations: [
          destination("/administration/agents/agent-apps"),
          destination("/administration/agents/agent-apps/apps", [
            "/administration/agents/agent-apps/edit/[id]",
          ]),
          destination("/administration/agents/agent-apps/categories"),
          destination("/administration/agents/agent-apps/executions"),
          destination("/administration/agents/agent-apps/analytics"),
          destination("/administration/agents/agent-apps/rate-limits"),
        ],
      },
      {
        name: "Skills",
        iconName: "BookOpen",
        destinations: [
          destination("/administration/agents/skills"),
          destination("/administration/agents/skills/categories"),
          destination("/administration/agents/skills/ingest"),
        ],
      },
      {
        name: "Tools & MCP",
        iconName: "Wrench",
        destinations: [
          destination("/administration/agents/relationships/directives"),
          destination("/administration/agents/mcp-tools", [
            "/administration/agents/mcp-tools/[toolId]",
            "/administration/agents/mcp-tools/[toolId]/edit",
            "/administration/agents/mcp-tools/[toolId]/incidents",
            "/administration/agents/mcp-tools/[toolId]/ui",
          ]),
          destination("/administration/agents/mcp-servers"),
          destination("/administration/agents/bundles"),
          destination("/administration/agents/executor-surfaces"),
          destination("/administration/agents/lookups"),
          destination("/administration/agents/mcp-tools/new"),
        ],
      },
      {
        name: "Health & Drift",
        iconName: "Activity",
        destinations: [
          destination("/administration/agents/reports/agent-drift"),
          destination("/administration/agents/hindsight", [
            "/administration/agents/hindsight/recipes/[id]",
          ]),
        ],
      },
      {
        // SUPPORT, not management (Arman, 2026-09-26): the System Agents pages
        // manage the platform's own agents only. Looking into an
        // organization's or a person's agents is tech support, and lives here.
        name: "Support",
        iconName: "LifeBuoy",
        destinations: [destination("/administration/agents/support")],
      },
    ],
  },
  {
    // Intelligence (Arman, 2026-09-25): how agents, workflows and models serve
    // the application. AI keeps its meaning (models and what involves them);
    // Agents and Workflows are things we make with them. For now Intelligence
    // holds only Mandates — a mandate is a named job fulfilled by an Agent, an
    // Orchestra, or a Workflow, so it is NEVER under Agents. ONE menu entry
    // for managing them; every other mandate management page is reached from
    // inside the list's header. Mandate support lookup (Arman, 2026-09-26) is
    // a SEPARATE entry: a tech-support tool over organizations' and people's
    // mandates, never the management page.
    name: "Intelligence",
    slug: "intelligence",
    iconName: INTELLIGENCE_ICON_NAME,
    iconColor: "text-teal-600",
    sections: [
      {
        name: "Mandates",
        iconName: "Plug",
        destinations: [
          destination("/administration/intelligence/mandates", [
            "/administration/intelligence/mandates/dashboard",
            "/administration/intelligence/mandates/health",
            "/administration/intelligence/mandates/unconverted",
            "/administration/intelligence/mandates/window",
            "/administration/intelligence/mandates/[mandateKey]",
            "/administration/intelligence/mandates/[mandateKey]/overrides",
          ]),
        ],
      },
      {
        // SUPPORT, not management (Arman, 2026-09-26): its own entry, never
        // the main mandates page. Its literal `support` segment also matches
        // the `[mandateKey]` pattern above; findAdminNavigationLocation prefers
        // a literal match over a dynamic one, so it highlights HERE.
        name: "Support",
        iconName: "LifeBuoy",
        destinations: [
          destination("/administration/intelligence/mandates/support", [
            "/administration/intelligence/mandates/support/[mandateId]",
          ]),
        ],
      },
    ],
  },
  {
    // The owner's ORIGINAL mandate pages, kept working untouched beside
    // Intelligence → Mandates until he validates the new suite — no redirects
    // until then. Not a menu row: every page here
    // is reached from the new list's header (Classic view, References, Raw
    // tables, New mandate).
    name: "Mandates (original pages)",
    slug: "mandates",
    iconName: "Plug",
    iconColor: "text-sky-600",
    supersededBy: "/administration/intelligence/mandates",
    sections: [
      {
        name: "Mandates",
        iconName: "Plug",
        destinations: [
          // 🚨 DECLARED FIRST ON PURPOSE. `findAdminNavigationLocation` is
          // first-match-wins, and the console below OWNS
          // `/administration/mandates/[mandateKey]`, whose pattern is
          // `/[^/]+` — it matches the literal segment `references` too. Next's
          // router picks the static route correctly either way; it is the
          // sidebar highlight that would name the wrong screen. Specific
          // before general, exactly as the route→surface map does it.
          destination("/administration/mandates/references"),
          destination("/administration/mandates/new"),
          destination("/administration/mandates/advanced"),
          destination("/administration/mandates", [
            "/administration/mandates/[mandateKey]",
          ]),
        ],
      },
    ],
  },
  {
    // The desk is where a question an agent filed actually reaches the person
    // who decides it — a peer of Feedback, not a child of Users: the row is a
    // decision being made, not a report being triaged.
    name: "Question Desk",
    slug: "question-desk",
    iconName: "MessagesSquare",
    iconColor: "text-amber-600",
    sections: [
      {
        name: "Question Desk",
        iconName: "MessagesSquare",
        destinations: [
          destination("/administration/question-desk", [
            "/administration/question-desk/[interviewId]",
          ]),
        ],
      },
    ],
  },
  {
    name: "Chat",
    slug: "chat",
    iconName: "MessageCircle",
    iconColor: "text-cyan-600",
    sections: [
      {
        name: "CX Conversations",
        iconName: "MessageSquare",
        destinations: [
          destination("/administration/chat/cx-dashboard"),
          destination("/administration/chat/cx-dashboard/conversations", [
            "/administration/chat/cx-dashboard/conversations/[id]",
          ]),
          destination("/administration/chat/cx-dashboard/requests", [
            "/administration/chat/cx-dashboard/requests/[id]",
          ]),
          destination("/administration/chat/cx-dashboard/usage"),
          destination("/administration/chat/cx-dashboard/errors"),
        ],
      },
    ],
  },
  {
    name: "Knowledge",
    slug: "knowledge",
    iconName: "LibraryBig",
    iconColor: "text-emerald-600",
    sections: [
      {
        name: "Knowledge Graph",
        iconName: "Network",
        destinations: [
          destination("/administration/knowledge/kg-cost"),
          destination("/administration/knowledge/batch"),
          destination("/administration/knowledge/kg-inspector"),
          destination("/administration/knowledge/search-lab"),
        ],
      },
      {
        name: "Research",
        iconName: "Search",
        destinations: [
          destination("/administration/knowledge/research-system"),
        ],
      },
      {
        name: "Podcasts",
        iconName: "Mic",
        destinations: [
          destination("/administration/knowledge/podcasts"),
          destination("/administration/knowledge/podcasts/shows", [
            "/administration/knowledge/podcasts/shows/[showId]",
            "/administration/knowledge/podcasts/shows/[showId]/episodes/[episodeId]",
          ]),
          destination("/administration/knowledge/podcasts/shows/new"),
        ],
      },
      {
        name: "CMS",
        iconName: "Globe",
        destinations: [destination("/administration/knowledge/cms-agents")],
      },
      {
        name: "Growth Loop",
        iconName: "Workflow",
        destinations: [destination("/administration/knowledge/growth-loop")],
      },
      {
        name: "Marketing & SEO",
        iconName: "BookOpenText",
        destinations: [destination("/administration/knowledge/seo-facets")],
      },
      {
        // Top of the settings ladder: platform → organization → brand → site.
        name: "Keyword Value Settings",
        iconName: "SlidersHorizontal",
        destinations: [
          destination("/administration/knowledge/seo-value-settings"),
        ],
      },
      {
        // The word rules themselves — a long list and a different job from
        // the numbers above, so it gets its own page (Arman, 2026-08-25).
        name: "Default Word Rules",
        iconName: "ListChecks",
        destinations: [
          destination("/administration/knowledge/seo-default-rules"),
        ],
      },
    ],
  },
  {
    name: "Shared Knowledge",
    slug: "shared-knowledge",
    iconName: "LibraryBig",
    iconColor: "text-emerald-600",
    sections: [
      {
        name: "Shared Knowledge",
        iconName: "LibraryBig",
        destinations: [destination("/administration/shared-knowledge")],
      },
    ],
  },
  {
    name: "Scopes & Context",
    slug: "scopes-context",
    iconName: "Tags",
    iconColor: "text-sky-600",
    sections: [
      {
        name: "Context",
        iconName: "Globe",
        destinations: [
          destination("/administration/scopes-context/system-context"),
          destination("/administration/scopes-context/context-inspector"),
          destination("/administration/scopes-context/organizations", [
            "/administration/scopes-context/organizations/[orgId]",
          ]),
        ],
      },
    ],
  },
  {
    name: "Database",
    slug: "database",
    iconName: "Database",
    iconColor: "text-blue-600",
    sections: [
      {
        name: "Database Tools",
        iconName: "DatabaseZap",
        destinations: [
          destination("/administration/database"),
          destination("/administration/database/database-admin"),
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
          destination("/administration/database/relationships"),
          destination("/administration/database/relationships/planner"),
          destination("/administration/database/relationships/rules"),
          destination("/administration/database/relationships/entity-types"),
          destination("/administration/database/relationships/explorer", [
            "/administration/database/relationships/explorer/[token]",
          ]),
          destination("/administration/database/relationships/reachability"),
          destination("/administration/database/relationships/exposure-audit"),
          destination("/administration/database/relationships/sharing"),
        ],
      },
      {
        name: "Canonicalization",
        iconName: "ShieldCheck",
        destinations: [
          destination("/administration/database/canonicalization"),
          destination("/administration/database/canonicalization/summary"),
          destination("/administration/database/canonicalization/findings"),
          destination(
            "/administration/database/canonicalization/broken-functions",
          ),
          destination("/administration/database/canonicalization/candidates"),
          destination(
            "/administration/database/canonicalization/function-deps",
          ),
          destination("/administration/database/canonicalization/table-impact"),
          destination("/administration/database/canonicalization/verify"),
        ],
      },
      {
        name: "Schema Visualization",
        iconName: "Waypoints",
        destinations: [
          destination("/administration/database/schema-visualizer"),
          destination("/administration/database/schema-visualizer-enhanced"),
        ],
      },
      {
        name: "Unified Data",
        iconName: "ToggleLeft",
        destinations: [
          destination("/administration/database/unified-data-ramp"),
        ],
      },
      {
        name: "Integrity",
        iconName: "ShieldCheck",
        destinations: [destination("/administration/database/data-integrity")],
      },
    ],
  },
  {
    name: "UI",
    slug: "ui",
    iconName: "PanelsTopLeft",
    iconColor: "text-lime-600",
    sections: [
      {
        name: "Surfaces",
        iconName: "Layout",
        destinations: [
          destination("/administration/ui/surfaces", [
            "/administration/ui/surfaces/[...name]",
          ]),
          destination("/administration/ui/surfaces?drift=1"),
        ],
      },
      {
        name: "Component Lab",
        iconName: "Component",
        destinations: [
          destination("/administration/ui/official-components", [
            "/administration/ui/official-components/[componentId]",
          ]),
          destination("/administration/ui/official-components/alchemy"),
          destination(
            "/administration/ui/official-components/to-be-added/toggle-menu-demo",
          ),
          destination(
            "/administration/ui/official-components/to-be-added/toggle-menu-demo/toggle-with-categories",
          ),
        ],
      },
      {
        name: "Experiments",
        iconName: "Beaker",
        destinations: [destination("/administration/ui/experimental-routes")],
      },
      {
        name: "Windowing",
        iconName: "PanelTop",
        destinations: [
          destination("/administration/ui/persistence-test"),
          destination("/administration/ui/lite-window"),
        ],
      },
    ],
  },
  {
    name: "Automation",
    slug: "automation",
    iconName: "CalendarClock",
    iconColor: "text-indigo-600",
    sections: [
      {
        name: "Scheduling",
        iconName: "CalendarClock",
        destinations: [
          destination("/administration/automation/scheduling"),
          destination("/administration/automation/scheduling/tasks"),
          destination("/administration/automation/scheduling/runs"),
          destination("/administration/automation/scheduling/system-jobs"),
          destination("/administration/automation/scheduling/orphan-leases"),
          destination("/administration/automation/scheduling/cron-tester"),
          destination("/administration/automation/scheduling/scanner-health"),
          destination("/administration/automation/scheduling/templates"),
        ],
      },
    ],
  },
  {
    name: "Applications",
    slug: "applications",
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
          destination("/administration/applications/sync"),
          destination("/administration/applications/history"),
          destination("/administration/applications/packages"),
        ],
      },
    ],
  },
  {
    // Money lives in its own domain rather than under Users: "where is the
    // money going" is a platform question, not an account question.
    name: "Billing",
    slug: "billing",
    iconName: "DollarSign",
    iconColor: "text-emerald-600",
    sections: [
      {
        name: "Spend",
        iconName: "DollarSign",
        destinations: [destination("/administration/billing/spend")],
      },
    ],
  },
  {
    name: "Users",
    slug: "users",
    iconName: "Users",
    iconColor: "text-sky-600",
    sections: [
      {
        name: "Accounts & Access",
        iconName: "Users",
        destinations: [
          destination("/administration/users"),
          destination("/administration/users/organizations"),
          destination("/administration/users/acquisition"),
          destination("/administration/users/change-policy"),
          destination("/administration/users/preferences"),
          destination("/administration/users/admins"),
          destination("/administration/users/invitations"),
          destination("/administration/users/entitlements"),
          destination("/administration/users/limits"),
          destination("/administration/users/usage"),
        ],
      },
      {
        name: "Communications",
        iconName: "Mail",
        destinations: [
          destination("/administration/users/email"),
          destination("/administration/users/announcements"),
          destination("/administration/users/feedback"),
          destination("/administration/users/agent-review", [
            "/administration/users/agent-review/[id]",
          ]),
        ],
      },
    ],
  },
  {
    name: "HR",
    slug: "hr",
    iconName: "Scale",
    iconColor: "text-emerald-600",
    sections: [
      {
        name: "Employment Law",
        iconName: "Scale",
        destinations: [
          destination("/administration/hr"),
          destination("/administration/hr/jurisdiction-rules", [
            "/administration/hr/jurisdiction-rules/[ruleId]",
          ]),
          destination("/administration/hr/jurisdiction-rules/verification"),
        ],
      },
    ],
  },
  {
    name: "Compute",
    slug: "compute",
    iconName: "Server",
    iconColor: "text-orange-600",
    sections: [
      {
        name: "Sandbox & Infrastructure",
        iconName: "Container",
        destinations: [
          destination("/administration/compute/sandbox-infra"),
          destination("/administration/compute/sandbox"),
          destination("/administration/compute/server-logs", [
            "/administration/compute/server-logs/[app]",
          ]),
          destination("/administration/compute/resilience-lab"),
        ],
      },
      {
        name: "Verification",
        iconName: "ShieldCheck",
        destinations: [destination("/administration/compute/proof-runs")],
      },
    ],
  },
  {
    name: "Utilities",
    slug: "utilities",
    iconName: "Wrench",
    iconColor: "text-green-600",
    sections: [
      {
        name: "Content & Rendering",
        iconName: "Braces",
        destinations: [
          destination("/administration/utilities/content-blocks"),
          destination("/administration/utilities/message-templates"),
          destination("/administration/utilities/markdown-tester"),
          destination("/administration/utilities/kind-registry", [
            "/administration/utilities/kind-registry/[kind]",
            // One resolution surface per Shape Doctor finding class, opened
            // from the Board tab's finding cards.
            "/administration/utilities/kind-registry/findings/[code]",
          ]),
          destination("/administration/utilities/kind-registry/build"),
          destination("/administration/utilities/taxonomy"),
        ],
      },
      {
        name: "Files & Browser Storage",
        iconName: "Folder",
        destinations: [
          destination("/administration/utilities/local-storage"),
          destination("/administration/utilities/blob-cache"),
        ],
      },
      {
        name: "Developer Utilities",
        iconName: "Code2",
        destinations: [
          destination("/administration/utilities/all-routes"),
          destination("/administration/utilities/capture-inspector"),
          destination("/administration/utilities/system-errors"),
          destination("/administration/utilities/server-cache"),
          destination("/administration/utilities/utils"),
          destination("/administration/utilities/utils/text-cleaner"),
        ],
      },
    ],
  },
  {
    name: "Documentation",
    slug: "documentation",
    iconName: "BookOpen",
    iconColor: "text-purple-600",
    sections: [
      {
        name: "Feature Documentation",
        iconName: "FileText",
        destinations: [
          destination("/administration/documentation/feature-docs"),
          destination("/administration/documentation/feature-docs/codebase"),
          destination("/administration/documentation/feature-docs/docs", [
            "/administration/documentation/feature-docs/view/[[...path]]",
          ]),
          destination("/administration/documentation/feature-docs/dotdirs", [
            "/administration/documentation/feature-docs/dotdirs/[slug]",
          ]),
        ],
      },
    ],
  },
  {
    name: "Marketing",
    slug: "marketing",
    iconName: "Cpu",
    iconColor: "text-emerald-600",
    sections: [
      {
        name: "Coverage engines",
        iconName: "Cpu",
        destinations: [
          destination("/administration/marketing/run-console"),
          destination("/administration/marketing/seo-operations"),
        ],
      },
    ],
  },
  {
    name: "Preview",
    slug: "preview",
    iconName: "PanelsTopLeft",
    iconColor: "text-fuchsia-600",
    sections: [
      {
        name: "Unified Management",
        iconName: "PanelsTopLeft",
        destinations: [
          destination("/administration/preview/one-binding-ui"),
          destination("/administration/preview/unified-management", [
            "/administration/preview/unified-management/batch",
            "/administration/preview/unified-management/jobs",
            "/administration/preview/unified-management/places",
          ]),
        ],
      },
    ],
  },
  {
    name: "Reporting",
    slug: "reporting",
    iconName: "ChartNoAxesCombined",
    iconColor: "text-violet-600",
    sections: [
      {
        name: "Platform Reporting",
        iconName: "BarChart3",
        destinations: [
          destination("/administration/reporting/reports"),
          destination("/administration/reporting/codex-usage"),
          destination("/administration/reporting/events"),
          destination("/administration/reporting/public-exposure"),
          destination("/administration/reporting/dead-ends"),
          destination("/administration/reporting/unwired"),
          destination("/administration/reporting/lint-debt"),
          destination("/administration/reporting/grounding"),
          destination("/administration/reporting/producer-yield"),
          destination("/administration/reporting/tool-refetch"),
        ],
      },
    ],
  },
] as const;

/**
 * The domains the MENUS render — every consumer that draws a menu, launcher,
 * or header tree iterates this, never the raw registry. A `supersededBy`
 * domain keeps its routes declared (route audit, search, the all-routes
 * directory) but is never a menu row.
 */
export const adminMenuDomains: readonly AdminNavigationDomain[] =
  adminNavigationRegistry.filter((domain) => !domain.supersededBy);

/**
 * The pathname a menu should highlight: a page inside a superseded domain
 * lights up its new home, so the one menu entry stays selected.
 */
export function adminMenuPathname(pathname: string): string {
  const domain = findAdminNavigationDomainByPathname(pathname);
  return domain?.supersededBy ?? pathname;
}

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

/** Strip any query string and trailing slash so a path compares cleanly. */
export function adminPathOnly(path: string): string {
  return pathOnly(path);
}

function pathOnly(path: string): string {
  return (path.split("?")[0] ?? path).replace(/\/$/, "");
}

/** Validate the domain-root URL contract independently of the filesystem. */
export function getAdminNavigationArchitectureErrors(): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();
  // A destination link is the React key of its nav row, so the same link in two
  // sections renders duplicate keys and shows the page twice in the menu. It
  // happened on 2026-09-19: fde7f6a682 gave the Unified Data Ramp its own
  // section, and 8235aa61e3 added the SAME link to Database Tools eight hours
  // later, each unaware of the other. The slug check below never looked at links.
  const linkHomes = new Map<string, string>();

  for (const domain of adminNavigationRegistry) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(domain.slug)) {
      errors.push(`${domain.name}: invalid domain slug "${domain.slug}"`);
    }
    if (slugs.has(domain.slug)) {
      errors.push(`${domain.name}: duplicate domain slug "${domain.slug}"`);
    }
    slugs.add(domain.slug);

    const domainHref = adminDomainHref(domain);
    for (const section of domain.sections) {
      for (const item of section.destinations) {
        if (item.link.includes("?domain=")) {
          errors.push(
            `${item.title}: query-parameter domain route ${item.link}`,
          );
        }

        const here = `${domain.name} → ${section.name}`;
        const firstHome = linkHomes.get(item.link);
        if (firstHome) {
          errors.push(
            `${item.link} is registered twice: ${firstHome} and ${here}`,
          );
        } else {
          linkHomes.set(item.link, here);
        }

        for (const route of [item.link, ...item.ownedRoutes]) {
          const routePath = pathOnly(route);
          if (
            routePath.startsWith("/administration") &&
            routePath !== domainHref &&
            !routePath.startsWith(`${domainHref}/`)
          ) {
            errors.push(
              `${domain.name} → ${item.title}: ${routePath} is outside ${domainHref}`,
            );
          }
        }
      }
    }
  }

  // A superseded domain is hidden from every menu, so its new home MUST be a
  // real menu destination — otherwise its pages would have no menu entry at all.
  for (const domain of adminNavigationRegistry) {
    if (!domain.supersededBy) continue;
    const home = domain.supersededBy;
    const homeIsMenuRow = adminNavigationRegistry.some(
      (other) =>
        !other.supersededBy &&
        other.sections.some((section) =>
          section.destinations.some((item) => item.link === home),
        ),
    );
    if (!homeIsMenuRow) {
      errors.push(
        `${domain.name}: supersededBy ${home} is not a destination of any menu domain`,
      );
    }
  }

  return errors;
}

/** Exact declared page patterns, including hidden/detail leaves. */
export function getDeclaredAdminRoutePatterns(): string[] {
  const routes = new Set<string>();
  for (const domain of adminNavigationRegistry) {
    routes.add(adminDomainHref(domain));
  }
  for (const { destination: item } of getAdminNavigationLocations()) {
    if (item.link.startsWith("/administration"))
      routes.add(pathOnly(item.link));
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

/** How specifically `pattern` names `pathname`: literal segments that match. */
function literalMatchScore(pattern: string, pathname: string): number {
  if (!routePatternRegex(pattern).test(pathname)) return -1;
  return pathOnly(pattern)
    .split("/")
    .filter((part) => part && !/^\[.+\]$/.test(part)).length;
}

/**
 * The destination that owns `pathname`. SPECIFIC BEFORE GENERAL: when several
 * destinations match, the one whose pattern names more literal segments wins
 * (`/mandates/support` over `/mandates/[mandateKey]`); ties keep declaration
 * order.
 */
export function findAdminNavigationLocation(
  pathname: string,
): AdminNavigationLocation | null {
  let best: AdminNavigationLocation | null = null;
  let bestScore = -1;
  for (const location of getAdminNavigationLocations()) {
    const item = location.destination;
    const score = Math.max(
      ...[item.link, ...item.ownedRoutes].map((pattern) =>
        literalMatchScore(pattern, pathname),
      ),
    );
    if (score > bestScore) {
      best = location;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? best : null;
}

export function findAdminNavigationDomainBySlug(
  slug: string,
): AdminNavigationDomain | null {
  return adminNavigationRegistry.find((domain) => domain.slug === slug) ?? null;
}

export function findAdminNavigationDomainByPathname(
  pathname: string,
): AdminNavigationDomain | null {
  const normalizedPathname = pathOnly(pathname);
  return (
    adminNavigationRegistry.find((domain) => {
      const domainHref = adminDomainHref(domain);
      return (
        normalizedPathname === domainHref ||
        normalizedPathname.startsWith(`${domainHref}/`)
      );
    }) ?? null
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

export function adminDomainHref(
  domain: Pick<AdminNavigationDomain, "slug">,
): string {
  return `/administration/${domain.slug}`;
}
