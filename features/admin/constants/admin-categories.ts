/**
 * features/admin/constants/admin-categories.ts
 *
 * Metadata catalog for administration destinations.
 *
 * Pure data — NO React, NO JSX, NO icon-component imports. Icons are stored as
 * string names and rendered lazily via `IconResolver`
 * (`@/components/official/icons/IconResolver`), which resolves any lucide-react
 * icon by name. This keeps the catalog importable from the shell sidebar
 * without pulling ~40 icon components into the main bundle.
 *
 * Hierarchy and exact route ownership live in `admin-navigation.ts`, which is
 * the only file navigation consumers may use. This file supplies the title,
 * description, icon, and newness metadata resolved by that hierarchy.
 *
 * Icon names are lucide-react export names. When changing one, verify it exists
 * in lucide-react (an unknown name falls back to the Zap glyph).
 */

export interface AdminToolLink {
  title: string;
  description: string;
  iconName: string;
  link: string;
  isNew?: boolean;
}

export interface AdminCategory {
  name: string;
  iconName: string;
  /** Tailwind text-color class used for the dashboard category tile. */
  iconColor?: string;
  /** Canonical parent page opened from the category card. */
  landingPath?: string;
  features: AdminToolLink[];
}

export function getAdminCategoryLandingPath(
  category: Pick<AdminCategory, "name" | "landingPath">,
): string {
  return (
    category.landingPath ??
    `/administration?category=${encodeURIComponent(category.name)}`
  );
}

export const adminCategoriesData: AdminCategory[] = [
  {
    name: "CX Conversations",
    landingPath: "/administration/cx-dashboard",
    iconName: "MessageSquare",
    iconColor: "text-cyan-600",
    features: [
      {
        title: "CX Dashboard",
        description:
          "Overview with KPIs, cost trends, model usage, and aggregate metrics for the CX conversation system.",
        iconName: "BarChart3",
        link: "/administration/cx-dashboard",
      },
      {
        title: "Conversations",
        description:
          "Browse all conversations with filtering, search, message drill-down, and sub-agent chain tracking.",
        iconName: "MessageSquare",
        link: "/administration/cx-dashboard/conversations",
      },
      {
        title: "User Requests",
        description:
          "Track every user request with token usage, cost, iterations, tool calls, and performance metrics.",
        iconName: "Send",
        link: "/administration/cx-dashboard/requests",
      },
      {
        title: "Usage & Cost Analytics",
        description:
          "Cost analytics by model, provider, and day with charts and detailed breakdowns.",
        iconName: "DollarSign",
        link: "/administration/cx-dashboard/usage",
      },
      {
        title: "Errors & Issues",
        description:
          "Track pending requests, max_tokens hits, tool call errors, and system failures.",
        iconName: "AlertCircle",
        link: "/administration/cx-dashboard/errors",
      },
    ],
  },
  {
    name: "Sandbox & DevOps",
    iconName: "Container",
    iconColor: "text-orange-600",
    features: [
      {
        title: "Sandbox Infrastructure",
        description:
          "Live health for the EC2 + self-hosted orchestrators backing /code: per-tier disk/memory/CPU pressure, container counts, latest deploy runs, and one-click trigger. Catches silent deploy failures early.",
        iconName: "LayoutDashboard",
        link: "/administration/sandbox-infra",
      },
      {
        title: "Sandbox Management",
        description:
          "Monitor all sandbox instances, manage containers, and access running sandboxes via SSH",
        iconName: "Server",
        link: "/administration/sandbox",
      },
      {
        title: "Server Logs",
        description:
          "Live log viewer for all Coolify-managed services. Filter by level, category, and module. Split-screen JSON inspector with deep-link URLs per server.",
        iconName: "ScrollText",
        link: "/administration/server-logs",
      },
      {
        title: "Resilience Lab",
        description:
          "Synthetic failure scenarios for the request-recovery + netRequests system. Fires client-simulated and live Python /ai/mock-stream/{scenario} streams through the real resilientFetch + monitorStream stack.",
        iconName: "Bug",
        link: "/administration/resilience-lab",
      },
    ],
  },
  {
    name: "Scheduling",
    landingPath: "/administration/scheduling",
    iconName: "CalendarClock",
    iconColor: "text-blue-600",
    features: [
      {
        title: "Scheduling Overview",
        description:
          "Cross-user health for the sch_* spine: task counts, runs, failures, and orphan leases.",
        iconName: "CalendarClock",
        link: "/administration/scheduling",
        isNew: true,
      },
      {
        title: "Scheduled Tasks",
        description:
          "Every scheduled task across the platform — filter, inspect, and disable.",
        iconName: "Calendar",
        link: "/administration/scheduling/tasks",
      },
      {
        title: "Run History",
        description: "Run history with status, surface, and date filters.",
        iconName: "LineChart",
        link: "/administration/scheduling/runs",
      },
      {
        title: "Orphan Leases",
        description:
          "Claims that lapsed mid-execution — watch for spikes that indicate scanner issues.",
        iconName: "OctagonAlert",
        link: "/administration/scheduling/orphan-leases",
      },
      {
        title: "Cron Tester",
        description:
          "Validate any cron expression and timezone; preview the next N fire times.",
        iconName: "Calendar",
        link: "/administration/scheduling/cron-tester",
      },
      {
        title: "Scanner Health",
        description:
          "aidream-backed scheduler status: last tick, queue depth, and in-flight claims.",
        iconName: "Server",
        link: "/administration/scheduling/scanner-health",
      },
      {
        title: "Schedule Templates",
        description:
          "Curated starter schedules users can clone when creating tasks.",
        iconName: "Clipboard",
        link: "/administration/scheduling/templates",
      },
    ],
  },
  {
    name: "Research System",
    landingPath: "/administration/research-system",
    iconName: "Search",
    iconColor: "text-emerald-600",
    features: [
      {
        title: "Research Admin",
        description:
          "Manage research templates, agent wiring, system constants, and monitor active research projects",
        iconName: "Search",
        link: "/administration/research-system",
        isNew: true,
      },
    ],
  },
  {
    name: "Context System",
    iconName: "Globe",
    iconColor: "text-sky-600",
    features: [
      {
        title: "System Context",
        description:
          "Platform-wide context items — ambient (date/time/user), curated globals, and industry datasets — that resolve for every user with no scope set.",
        iconName: "Globe",
        link: "/administration/system-context",
        isNew: true,
      },
      {
        title: "Context Inspector",
        description:
          "Render the exact context payload for a selected scope-system tier, variation, organization, and clearance using the live aidream serializer.",
        iconName: "Braces",
        link: "/administration/context-inspector",
        isNew: true,
      },
    ],
  },
  {
    name: "Knowledge Graph",
    iconName: "Network",
    iconColor: "text-teal-600",
    features: [
      {
        title: "KG Cost Dashboard",
        description:
          "Auto-ingest spend per org, in-flight provider batches, and cap KPIs (spend today, 7d, orgs near cap, pending batches).",
        iconName: "DollarSign",
        link: "/administration/kg-cost",
        isNew: true,
      },
      {
        title: "KG Inspector",
        description:
          "Read-only viewer for knowledge-graph entities, mentions, and edges (NER data-quality inspection).",
        iconName: "Network",
        link: "/administration/kg-inspector",
        isNew: true,
      },
    ],
  },
  {
    name: "AI Models",
    landingPath: "/administration/ai-models",
    iconName: "Brain",
    iconColor: "text-violet-600",
    features: [
      {
        title: "AI Model Registry",
        description:
          "Manage the full AI model registry — edit parameters, JSON controls, endpoints, deprecation flags, and pricing tiers.",
        iconName: "Brain",
        link: "/administration/ai-models",
      },
      {
        title: "Data Audit",
        description:
          "Audit all models for missing or invalid data across pricing, API class, capabilities, and core fields. Fix issues inline with live pass/fail scoring.",
        iconName: "AlertCircle",
        link: "/administration/ai-models/audit",
      },
      {
        title: "Deprecated Models",
        description:
          "Find deprecated models with active prompt/builtin references. Replace them individually with full settings review, or bulk-replace all at once.",
        iconName: "AlertTriangle",
        link: "/administration/ai-models/deprecated-audit",
      },
      {
        title: "Provider Model Sync",
        description:
          "Fetch live model lists from Anthropic, OpenAI, Groq, and other providers. Compare against your database to find missing or extra models and keep everything in sync.",
        iconName: "RefreshCw",
        link: "/administration/ai-models/provider-sync",
      },
      {
        title: "Providers",
        description:
          "Manage the ai.provider catalog — name, slug, website, docs links, and logo for every model provider.",
        iconName: "Building2",
        link: "/administration/ai-models/providers",
      },
      {
        title: "Endpoints & APIs",
        description:
          "Manage serving vendors (ai.endpoint — base URL, auth, priority) and wire contracts (ai.api — translator key, transport, rules, request defaults). Admin-only facts, never user-facing.",
        iconName: "Plug",
        link: "/administration/ai-models/endpoints",
      },
      {
        title: "Offerings",
        description:
          "Manage model offerings (ai.offering — model × endpoint × api) — pricing/capability/param overrides, plus a coverage report of which models have no offering yet.",
        iconName: "Layers",
        link: "/administration/ai-models/offerings",
      },
      {
        title: "Settings",
        description:
          "Manage the canonical AI settings vocabulary (ai.setting) — temperature, reasoning_effort, and other controls.",
        iconName: "SlidersHorizontal",
        link: "/administration/ai-models/settings",
      },
      {
        title: "Aliases",
        description:
          "Manage model aliases (ai.model_alias) — alternate names, deprecated ids, and -latest pointers resolving to live model rows.",
        iconName: "Link2",
        link: "/administration/ai-models/aliases",
      },
    ],
  },
  {
    name: "Agents",
    landingPath: "/administration/system-agents",
    iconName: "Zap",
    iconColor: "text-rose-600",
    features: [
      {
        title: "Agents Dashboard",
        description:
          "Hub for every global-scope agent surface: builtin agents, shortcuts, categories, content blocks, and system agent apps.",
        iconName: "Zap",
        link: "/administration/system-agents",
        isNew: true,
      },
      {
        title: "Agents List",
        description:
          "Browse, build, and run builtin (global) agents. Includes agents converted from user definitions.",
        iconName: "Bot",
        link: "/administration/system-agents/agents",
        isNew: true,
      },
      {
        title: "Agents Shortcuts",
        description:
          "Browse and edit global agent shortcuts, enabled contexts, and agent bindings.",
        iconName: "Zap",
        link: "/administration/system-agents/shortcuts",
        isNew: true,
      },
      {
        title: "Agents Categories",
        description:
          "Placement hierarchy, icons, and enabled contexts for agent shortcut groups.",
        iconName: "Zap",
        link: "/administration/system-agents/categories",
        isNew: true,
      },
      {
        title: "Agents Content Blocks",
        description:
          "Reusable insertable blocks surfaced under agent shortcut categories.",
        iconName: "Zap",
        link: "/administration/system-agents/content-blocks",
        isNew: true,
      },
      {
        title: "Agents Apps",
        description:
          "Global-scope agent apps available to every user. Distinct from moderation of user-published apps.",
        iconName: "Bot",
        link: "/administration/system-agents/apps",
        isNew: true,
      },
      {
        title: "Agents Lineage",
        description:
          "See what each system agent gives rise to — derived agents, shortcuts, and apps.",
        iconName: "GitBranch",
        link: "/administration/system-agents/lineage",
        isNew: true,
      },
      {
        title: "New Agent",
        description:
          "Create a new global-scope system agent (wizard entry point).",
        iconName: "Plus",
        link: "/administration/system-agents/agents/new",
        isNew: true,
      },
      {
        title: "New Agent Manual",
        description:
          "Create a system agent manually without the guided wizard.",
        iconName: "Pencil",
        link: "/administration/system-agents/agents/new/manual",
        isNew: true,
      },
      {
        title: "New App",
        description: "Create a new global-scope system agent app.",
        iconName: "Plus",
        link: "/administration/system-agents/apps/new",
        isNew: true,
      },
      {
        title: "All Shortcuts",
        description:
          "Flat list of every global agent shortcut across categories.",
        iconName: "List",
        link: "/administration/system-agents/shortcuts/all",
        isNew: true,
      },
    ],
  },
  {
    name: "Agent Apps",
    landingPath: "/administration/agent-apps",
    iconName: "Boxes",
    iconColor: "text-indigo-600",
    features: [
      {
        title: "Agent Apps Dashboard",
        description:
          "Hub for moderating user-published agent apps: featured picks, verification, and quick stats.",
        iconName: "LayoutDashboard",
        link: "/administration/agent-apps",
        isNew: true,
      },
      {
        title: "All Agent Apps",
        description:
          "Every agent app across the platform — filter, feature, verify, and moderate.",
        iconName: "Boxes",
        link: "/administration/agent-apps/apps",
      },
      {
        title: "Agent App Categories",
        description:
          "Manage the static category list shown in public agent-app browsing.",
        iconName: "Folder",
        link: "/administration/agent-apps/categories",
      },
      {
        title: "Agent App Executions",
        description:
          "Recent runs and errors across every agent app. Resolve incidents and inspect usage.",
        iconName: "LineChart",
        link: "/administration/agent-apps/executions",
      },
      {
        title: "Agent App Analytics",
        description:
          "Usage and performance analytics across published agent apps.",
        iconName: "BarChart3",
        link: "/administration/agent-apps/analytics",
      },
      {
        title: "Agent App Rate Limits",
        description:
          "Configure and audit rate limits for agent app invocations.",
        iconName: "Shield",
        link: "/administration/agent-apps/rate-limits",
      },
    ],
  },
  {
    name: "Agent Skills",
    landingPath: "/administration/skills",
    iconName: "Brain",
    iconColor: "text-amber-600",
    features: [
      {
        title: "Skills registry",
        description:
          "Curate every skill on the platform — system, public, and user-owned. Promote a skill to system, edit metadata, or soft-delete.",
        iconName: "Brain",
        link: "/administration/skills",
        isNew: true,
      },
      {
        title: "Categories",
        description:
          "Hierarchical category tree that drives the catalog overview preamble for every agent.",
        iconName: "Folder",
        link: "/administration/skills/categories",
        isNew: true,
      },
      {
        title: "Filesystem ingest",
        description:
          "Bulk-import SKILL.md files from one or more repo paths or leaf skills directories. Dry-run + apply with body-hash idempotency.",
        iconName: "Download",
        link: "/administration/skills/ingest",
        isNew: true,
      },
    ],
  },
  {
    name: "Podcasts",
    iconName: "Mic",
    iconColor: "text-sky-600",
    features: [
      {
        title: "Podcasts Hub",
        description:
          "Landing page for podcast administration — shows, episodes, and assets.",
        iconName: "Mic",
        link: "/administration/podcasts",
        isNew: true,
      },
      {
        title: "Podcast Manager",
        description:
          "Manage podcast shows and episodes — create, edit, upload assets, and publish audio content with custom metadata and video backgrounds.",
        iconName: "Mic",
        link: "/administration/podcasts/shows",
        isNew: true,
      },
      {
        title: "New Podcast Show",
        description: "Create a new podcast show with metadata and branding.",
        iconName: "Plus",
        link: "/administration/podcasts/shows/new",
        isNew: true,
      },
    ],
  },
  {
    name: "Applications",
    landingPath: "/administration/applications",
    iconName: "MonitorCog",
    iconColor: "text-indigo-600",
    features: [
      {
        title: "Applications Overview",
        description:
          "Operational overview for shipped clients, including configuration, catalogs, installed fleet, and audit activity.",
        iconName: "LayoutDashboard",
        link: "/administration/applications",
        isNew: true,
      },
      {
        title: "Application Configuration",
        description:
          "Manage remote runtime configuration, minimum supported versions, feature flags, and operator notices for shipped clients.",
        iconName: "MonitorCog",
        link: "/administration/applications/configuration",
        isNew: true,
      },
      {
        title: "Application Catalogs",
        description:
          "Manage DB-backed model, preset, prompt, voice, and artifact catalogs consumed by shipped clients.",
        iconName: "LibraryBig",
        link: "/administration/applications/catalogs",
        isNew: true,
      },
      {
        title: "Installations",
        description:
          "Inspect the installed client fleet, reported versions, hardware, activity, and minimum-version compliance.",
        iconName: "HardDrive",
        link: "/administration/applications/installations",
        isNew: true,
      },
      {
        title: "Application History",
        description:
          "Review the unified configuration and catalog audit timeline for shipped applications.",
        iconName: "History",
        link: "/administration/applications/history",
        isNew: true,
      },
    ],
  },
  {
    name: "Content & Configuration",
    iconName: "Pencil",
    iconColor: "text-purple-600",
    features: [
      {
        title: "Content Blocks",
        description:
          "Manage content blocks, templates, and context menu items used throughout the application",
        iconName: "Clipboard",
        link: "/administration/content-blocks",
      },
      {
        title: "Content Templates",
        description:
          "Manage message templates for prompts including system, user, assistant, and tool messages",
        iconName: "MessageSquare",
        link: "/administration/content-templates",
      },
      {
        title: "Markdown Content Tester",
        description:
          "Test and debug MarkdownStream rendering with live split-screen preview. Perfect for testing diagrams, quizzes, tables, and other content formats.",
        iconName: "Code",
        link: "/administration/markdown-tester",
      },
      {
        title: "Kind Registry",
        description:
          "Browse/search every content-ir kind (system + flexible_data), inspect fields, facets, and the uses/used-by reference graph, and export provider-ready JSON Schemas with referenced kinds resolved into $defs.",
        iconName: "Boxes",
        link: "/administration/kind-registry",
        isNew: true,
      },
      {
        title: "Build a Kind",
        description:
          "Hand the admin builder agent a data structure; it builds and activates the whole content-ir kind end to end (schema, live component, skill, content blocks, activation) in one pass.",
        iconName: "Boxes",
        link: "/administration/kind-registry/build",
        isNew: true,
      },
      {
        title: "Feature Docs Hub",
        description:
          "Browse synced FEATURE.md and README docs from the repo (admin.feature_docs).",
        iconName: "FileText",
        link: "/administration/feature-docs",
        isNew: true,
      },
      {
        title: "Feature Docs — Codebase Sync",
        description:
          "Browse internal FEATURE.md and README docs synced from the repo into admin.feature_docs. Two-way sync via pnpm sync:feature-docs.",
        iconName: "FileText",
        link: "/administration/feature-docs/codebase",
        isNew: true,
      },
      {
        title: "Feature Docs — Docs Browser",
        description: "Browse synced documentation entries by path.",
        iconName: "BookOpen",
        link: "/administration/feature-docs/docs",
        isNew: true,
      },
      {
        title: "Feature Docs — Dot Directories",
        description:
          "Index of dot-directories (.cursor, .claude, etc.) with synced docs.",
        iconName: "Folder",
        link: "/administration/feature-docs/dotdirs",
        isNew: true,
      },
      {
        title: "CMS Agent Activity",
        description:
          "Fleet-wide CMS visibility — agent/human write activity, per-site page tree with preview/live links, agent write-policy editor, and validation-exception approvals.",
        iconName: "Globe",
        link: "/administration/cms-agents",
        isNew: true,
      },
    ],
  },
  {
    name: "Surfaces",
    landingPath: "/administration/surfaces",
    iconName: "Layout",
    iconColor: "text-lime-600",
    features: [
      {
        title: "UI Surfaces",
        description:
          "100+ surfaces grouped by client and tier (Pages / Specialized / Overlays / Editor variants / Debug). Bulk activate / deactivate, FK-aware delete, rename via FK CASCADE, candidate-inventory bulk-add, plus a full-screen per-surface editor (identity, classification, tool defaults, roles, values drift, usage).",
        iconName: "Layout",
        link: "/administration/surfaces",
        isNew: true,
      },
      {
        title: "Manifest Drift & Sync",
        description:
          "Compare code-declared surface manifests to database state (ui_surface_value / agent roles) and apply Sync Manifests. Opens the surfaces admin with the drift report.",
        iconName: "AlertTriangle",
        link: "/administration/surfaces?drift=1",
        isNew: true,
      },
    ],
  },
  {
    name: "Tool Registry",
    iconName: "TestTube",
    iconColor: "text-pink-600",
    features: [
      {
        title: "Action Catalog",
        description:
          "Live Matrx Action Catalog — noun × verb grid, build/test panel, and output-directive execute/confirm round-trip against the Python brain. Lives on the Relationships hub.",
        iconName: "Zap",
        link: "/administration/relationships/actions",
        isNew: true,
      },
      {
        title: "Tool Definitions",
        description:
          "The 380-row tool_def catalog — every tool the platform can run (built-in, browser, server, MCP). Per-tool admin: identity, parameters, executors, surfaces, bundles, gating, UI components, test samples, incidents. Bulk activate / deactivate / delete.",
        iconName: "TestTube",
        link: "/administration/mcp-tools",
      },
      {
        title: "MCP Servers",
        description:
          "Provision new servers (one-click 4-row insert: server + executor kind + system bundle + lister tool). Per-server tabs for tools / configs / connected users / metadata. Test connection probes the endpoint and persists health.",
        iconName: "Server",
        link: "/administration/mcp-servers",
        isNew: true,
      },
      {
        title: "Bundles",
        description:
          "System and personal tool bundles. Create with auto-lister (one click), edit metadata, manage member aliases, search-and-add tools across the catalog.",
        iconName: "Box",
        link: "/administration/bundles",
        isNew: true,
      },
      {
        title: "Tool Runtimes",
        description:
          "Tools per executor: pick an executor (matrx-ai-core, aidream, matrx-local, chrome-extension, matrx-user, or mcp.<slug>) and manage which tools it can handle. Manages tool_binding rows (a pure M2M between tool_def and tool_executor).",
        iconName: "Cpu",
        link: "/administration/executor-surfaces",
        isNew: true,
      },
      {
        title: "Lookups",
        description:
          "CRUD for tool-registry lookup tables: ui_client, ui_surface (basic), tool_executor. Foundation tables every other registry feature reads.",
        iconName: "SlidersHorizontal",
        link: "/administration/lookups",
        isNew: true,
      },
      {
        title: "New Tool Definition",
        description:
          "Create a new row in the tool_def catalog (identity, parameters, executors, surfaces).",
        iconName: "Pencil",
        link: "/administration/mcp-tools/new",
      },
    ],
  },
  {
    name: "Users & Access",
    landingPath: "/administration/users",
    iconName: "Users",
    iconColor: "text-sky-600",
    features: [
      {
        title: "Users & Access Hub",
        description:
          "Consolidated control plane for everything about a user — accounts, organization memberships, preferences health, admin privileges, invitations, entitlements, per-user usage & cost, and email — each a tab. Also the Accounts list: view every account and flip the onboarding flag.",
        iconName: "Users",
        link: "/administration/users",
        isNew: true,
      },
      {
        title: "Organizations & Memberships",
        description:
          "View every organization, see its users, pivot from any user to their organizations, and manage canonical owner/admin/member relationships.",
        iconName: "Building2",
        link: "/administration/users/organizations",
        isNew: true,
      },
      {
        title: "Preferences Drift",
        description:
          "Accounts whose stored preferences still carry a retired shape. Proves the drift-healing system is at zero across all users, with a manual 'Heal now' lever.",
        iconName: "SlidersHorizontal",
        link: "/administration/users/preferences",
        isNew: true,
      },
      {
        title: "Admins & Levels",
        description:
          "Promote, demote, and revoke admin access. Super Admin only — guarded at the database, not just the UI.",
        iconName: "ShieldCheck",
        link: "/administration/users/admins",
      },
      {
        title: "Invitations",
        description:
          "Review and manage access requests. Approve or reject applicants and send invitation codes via email.",
        iconName: "MailPlus",
        link: "/administration/users/invitations",
      },
      {
        title: "Entitlements & Usage",
        description:
          "Capability registry with live enforcement flags and free-tier limits, plus a 30-day usage rollup across the platform.",
        iconName: "Gauge",
        link: "/administration/users/entitlements",
        isNew: true,
      },
      {
        title: "Usage & Cost",
        description:
          "Per-user AI spend and token usage — the CX usage analytics surfaced inside user management.",
        iconName: "DollarSign",
        link: "/administration/users/usage",
        isNew: true,
      },
      {
        title: "Email Users",
        description:
          "Send emails to users directly from the admin portal using custom or template-based messages.",
        iconName: "Send",
        link: "/administration/users/email",
      },
      {
        title: "Announcements",
        description:
          "System-wide announcements broadcast to every user on next login (info / warning / critical / update). Managed alongside accounts and DMs — distinct from the feedback bug tracker.",
        iconName: "Megaphone",
        link: "/administration/users/announcements",
        isNew: true,
      },
    ],
  },
  {
    name: "Feedback",
    landingPath: "/administration/feedback",
    iconName: "MessageSquare",
    iconColor: "text-orange-600",
    features: [
      {
        title: "Feedback Management",
        description:
          "View and manage user feedback, bug reports, and feature requests. Create and manage system announcements.",
        iconName: "MessageSquare",
        link: "/administration/feedback",
      },
      {
        title: "Agent Review Queue",
        description:
          "Everything agents built that needs your eyes — demo pages and features to test, with one-click open, inline feedback, and status flow back to the agents.",
        iconName: "ClipboardCheck",
        link: "/administration/agent-review",
        isNew: true,
      },
    ],
  },
  {
    name: "Demos",
    iconName: "Layout",
    iconColor: "text-teal-600",
    features: [
      {
        title: "Official Components",
        description:
          "Browse and test all official UI components with live demos, code examples, and documentation.",
        iconName: "Layout",
        link: "/administration/official-components",
      },
      {
        title: "Toggle Menu Demo",
        description:
          "Candidate demo for category-aware toggle menus under official-components.",
        iconName: "ToggleLeft",
        link: "/administration/official-components/to-be-added/toggle-menu-demo",
      },
      {
        title: "Toggle Menu — With Categories",
        description: "Toggle menu demo variant with grouped categories.",
        iconName: "ToggleLeft",
        link: "/administration/official-components/to-be-added/toggle-menu-demo/toggle-with-categories",
      },
      {
        title: "Experimental Routes",
        description:
          "Access all experimental, demo, and test routes organized by feature area for easy testing and development",
        iconName: "Beaker",
        link: "/administration/experimental-routes",
      },
    ],
  },
  {
    name: "Files",
    iconName: "Folder",
    iconColor: "text-amber-600",
    features: [
      {
        title: "Data Integrity",
        description:
          "On-demand referential + storage integrity audit for the file system and PDF document bridge: dead/unrecoverable sources, dangling folder/bridge references, orphaned processed documents, plus an opt-in live S3 byte probe. Same checks run in CI via pnpm check:data-integrity.",
        iconName: "ShieldCheck",
        link: "/administration/data-integrity",
        isNew: true,
      },
      {
        title: "Local Storage Admin",
        description:
          "Inspect, edit, and manage browser localStorage and cookies with import/export support.",
        iconName: "Database",
        link: "/administration/local-storage",
      },
      {
        title: "Blob Cache Observability",
        description:
          "3-tier byte cache health (memory / IndexedDB / Service Worker), eviction controls, and stale-bytes incident wipe.",
        iconName: "Cloud",
        link: "/administration/blob-cache",
      },
    ],
  },
  {
    name: "Sharing & Access",
    landingPath: "/administration/relationships/sharing",
    iconName: "Share2",
    iconColor: "text-sky-600",
    features: [
      {
        title: "Sharing Registry & Link Policy",
        description:
          "The one home for platform.shareable_resource_registry: full row CRUD plus the no-login link-sharing switch and the default-deny public-columns allowlist per resource type. Lives on the Relationships hub.",
        iconName: "Link2",
        link: "/administration/relationships/sharing",
        isNew: true,
      },
    ],
  },
  {
    name: "Database",
    landingPath: "/administration/database",
    iconName: "Database",
    iconColor: "text-blue-600",
    features: [
      {
        title: "Database Admin Dashboard",
        description: "See functions, security policies, and more",
        iconName: "DatabaseBackup",
        link: "/administration/database-admin",
      },
      {
        title: "Relationships Hub",
        description:
          "Route-tabbed control plane for the entity/relationship system — Overview (status, drift report, cache rebuild, enforcement), Rules, Entity Types, Sharing, Explorer, Reachability, and Actions.",
        iconName: "Network",
        link: "/administration/relationships",
        isNew: true,
      },
      {
        title: "Association Rules",
        description:
          "platform.association_types registry — define/edit/delete which relationship shapes exist and which convey access (sharing cascade), with inline edit and side-panel editors.",
        iconName: "ListChecks",
        link: "/administration/relationships/rules",
        isNew: true,
      },
      {
        title: "Entity Types",
        description:
          "platform.entity_types registry admin — register, edit, and deactivate entity tokens (the canonical vocabulary for associations, sharing, and scopes). Flags generated-types drift.",
        iconName: "Boxes",
        link: "/administration/relationships/entity-types",
        isNew: true,
      },
      {
        title: "Entity Explorer",
        description:
          "Pick any entity type and see what targets it and what it targets — orbit view as a full page or WindowPanel.",
        iconName: "Search",
        link: "/administration/relationships/explorer",
        isNew: true,
      },
      {
        title: "Reachability Inspector",
        description:
          "The 'why can they see this?' debugger — what a container reaches, and which containers convey access to an item.",
        iconName: "Waypoints",
        link: "/administration/relationships/reachability",
        isNew: true,
      },
      {
        title: "Database Tools Hub",
        description:
          "Unified hub for all database admin tools — SQL editors, legacy dashboard, canonicalization workflow, and schema visualizers (duplicates marked Dup).",
        iconName: "DatabaseZap",
        link: "/administration/database",
      },
      {
        title: "SQL Editor",
        description: "Execute SQL queries directly against the database",
        iconName: "Code",
        link: "/administration/database/sql-queries",
      },
      {
        title: "SQL Workbench",
        description:
          "Multi-query notebook with shared variables and merged result sets.",
        iconName: "DatabaseZap",
        link: "/administration/database/workbench",
        isNew: true,
      },
      {
        title: "SQL Functions",
        description: "Browse, search, and manage SQL functions",
        iconName: "Code",
        link: "/administration/database/sql-functions",
      },
      {
        title: "Database Enums",
        description: "Manage database enum types and their values",
        iconName: "ToggleLeft",
        link: "/administration/database/enums",
        isNew: true,
      },
      {
        title: "Canonicalization Toolkit",
        description:
          "Live gate + audit snapshots for the DB canonicalization transition: certification summary, every FAIL/WARN finding, broken functions, migration candidates (M2M/unregistered/stale), and per-table preflight (table_impact) + verify/certify tools.",
        iconName: "ShieldCheck",
        link: "/administration/canonicalization",
        isNew: true,
      },
      {
        title: "Canonicalization — Summary",
        description:
          "Certification summary and overall canonicalization gate status.",
        iconName: "BarChart3",
        link: "/administration/canonicalization/summary",
        isNew: true,
      },
      {
        title: "Canonicalization — Findings",
        description: "Every FAIL/WARN finding from the canonicalization audit.",
        iconName: "AlertTriangle",
        link: "/administration/canonicalization/findings",
        isNew: true,
      },
      {
        title: "Canonicalization — Broken Functions",
        description: "SQL functions that fail canonicalization checks.",
        iconName: "Bug",
        link: "/administration/canonicalization/broken-functions",
        isNew: true,
      },
      {
        title: "Canonicalization — Candidates",
        description:
          "Migration candidates: M2M tables, unregistered relations, stale shims.",
        iconName: "List",
        link: "/administration/canonicalization/candidates",
        isNew: true,
      },
      {
        title: "Canonicalization — Function Dependencies",
        description: "Dependency graph for SQL functions under review.",
        iconName: "GitBranch",
        link: "/administration/canonicalization/function-deps",
        isNew: true,
      },
      {
        title: "Canonicalization — Table Impact",
        description:
          "Per-table preflight impact before certifying a migration.",
        iconName: "Table",
        link: "/administration/canonicalization/table-impact",
        isNew: true,
      },
      {
        title: "Canonicalization — Verify",
        description: "Verify and certify individual tables or functions.",
        iconName: "CheckCircle",
        link: "/administration/canonicalization/verify",
        isNew: true,
      },
      {
        title: "Schema Visualizer",
        description:
          "Visualize the full database schema with interactive diagrams",
        iconName: "Flag",
        link: "/administration/schema-visualizer",
      },
      {
        title: "Enhanced Schema Visualizer",
        description:
          "Advanced schema visualization with enhanced features and filtering",
        iconName: "SlidersHorizontal",
        link: "/administration/schema-visualizer-enhanced",
      },
    ],
  },
  {
    name: "Reports",
    landingPath: "/administration/reports",
    iconName: "BarChart2",
    iconColor: "text-violet-600",
    features: [
      {
        title: "Reports Hub",
        description:
          "Platform-wide reports across all users and organizations.",
        iconName: "BarChart2",
        link: "/administration/reports",
        isNew: true,
      },
      {
        title: "Agent Drift Report",
        description:
          "Red flags across all agents system-wide — master-detail drift report.",
        iconName: "AlertTriangle",
        link: "/administration/reports/agent-drift",
        isNew: true,
      },
    ],
  },
  {
    name: "Extras",
    iconName: "Wrench",
    iconColor: "text-green-600",
    features: [
      {
        title: "Server Cache",
        description:
          "Refresh and manage server-side caches including AI models and other cached data",
        iconName: "RefreshCw",
        link: "/administration/server-cache",
      },
      {
        title: "TypeScript Error Analyzer",
        description:
          "View, filter, and analyze TypeScript compilation errors across the project",
        iconName: "Code",
        link: "/administration/typescript-errors",
      },
    ],
  },
  {
    name: "Developer Tools",
    iconName: "Code",
    iconColor: "text-slate-600",
    features: [
      {
        title: "All Administration Routes",
        description:
          "Auto-generated filesystem index of every page under /administration — catches routes missing from this hub.",
        iconName: "List",
        link: "/administration/all-routes",
        isNew: true,
      },
      {
        title: "Capture Inspector",
        description:
          "Every HTTP exchange the browser made — request and response, streams and plain bodies alike, sourced from the fetch tap so coverage does not depend on which client made the call.",
        iconName: "Radio",
        link: "/administration/capture-inspector",
        isNew: true,
      },
      {
        title: "Activity Events",
        description:
          "Live window into platform.activity_log — run lifecycle, file/share audit, and webhook events.",
        iconName: "Activity",
        link: "/administration/events",
        isNew: true,
      },
      {
        title: "Schema Manager",
        description:
          "Manage and interact with the database schema, run queries, and inspect type solutions.",
        iconName: "Database",
        link: "/legacy/administration/schema-manager",
      },
      {
        title: "AI Tasks",
        description:
          "Monitor AI task runs, view statuses, response text, and track task execution over time.",
        iconName: "Bot",
        link: "/administration/ai-tasks",
      },
      {
        title: "Utilities",
        description:
          "Developer utilities hub — text cleaning and other admin transformation tools.",
        iconName: "SlidersHorizontal",
        link: "/administration/utils",
      },
      {
        title: "Text Cleaner",
        description:
          "Clean, transform, and process text with configurable pattern-based utilities.",
        iconName: "Clipboard",
        link: "/administration/utils/text-cleaner",
      },
      {
        title: "Window Persistence Tester",
        description:
          "Diagnostic loop for the local workspace cache, Redux overlays, window geometry, and preservation context side-by-side.",
        iconName: "Layout",
        link: "/administration/persistence-test",
        isNew: true,
      },
    ],
  },
];
