/**
 * features/admin/constants/admin-categories.ts
 *
 * SINGLE SOURCE OF TRUTH for the admin tool catalog (25 categories, ~80 tools).
 *
 * Pure data — NO React, NO JSX, NO icon-component imports. Icons are stored as
 * string names and rendered lazily via `IconResolver`
 * (`@/components/official/icons/IconResolver`), which resolves any lucide-react
 * icon by name. This keeps the catalog importable from the shell sidebar
 * without pulling ~40 icon components into the main bundle.
 *
 * Consumers:
 *  - app/(admin)/administration/categories.tsx  → decorates each entry with a
 *    rendered <IconResolver> for the dashboard grid / nav tree / module header.
 *  - features/shell/components/sidebar/admin-menu/*  → lazy, admin-gated
 *    3-layer flyout (Administration → category → tool) in the sidebar footer.
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
  features: AdminToolLink[];
}

export const adminCategoriesData: AdminCategory[] = [
  {
    name: "CX Conversations",
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
    name: "Experimental",
    iconName: "Beaker",
    iconColor: "text-fuchsia-600",
    features: [
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
    ],
  },
  {
    name: "System Agents",
    iconName: "Zap",
    iconColor: "text-rose-600",
    features: [
      {
        title: "System Agents Dashboard",
        description:
          "Hub for every global-scope agent surface: builtin agents, shortcuts, categories, content blocks, and system agent apps.",
        iconName: "Zap",
        link: "/administration/system-agents",
        isNew: true,
      },
      {
        title: "System agents — list",
        description:
          "Browse, build, and run builtin (global) agents. Includes agents converted from user definitions.",
        iconName: "Bot",
        link: "/administration/system-agents/agents",
        isNew: true,
      },
      {
        title: "Shortcuts — list",
        description:
          "Browse and edit global agent shortcuts, enabled contexts, and agent bindings.",
        iconName: "Zap",
        link: "/administration/system-agents/shortcuts",
        isNew: true,
      },
      {
        title: "Shortcut categories",
        description:
          "Placement hierarchy, icons, and enabled contexts for agent shortcut groups.",
        iconName: "Zap",
        link: "/administration/system-agents/categories",
        isNew: true,
      },
      {
        title: "Content blocks",
        description:
          "Reusable insertable blocks surfaced under agent shortcut categories.",
        iconName: "Zap",
        link: "/administration/system-agents/content-blocks",
        isNew: true,
      },
      {
        title: "System agent apps",
        description:
          "Global-scope agent apps available to every user. Distinct from moderation of user-published apps.",
        iconName: "Bot",
        link: "/administration/system-agents/apps",
        isNew: true,
      },
      {
        title: "Agent lineage",
        description:
          "See what each system agent gives rise to — derived agents, shortcuts, and apps.",
        iconName: "GitBranch",
        link: "/administration/system-agents/lineage",
        isNew: true,
      },
    ],
  },
  {
    name: "Agent Apps",
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
        title: "Podcast Manager",
        description:
          "Manage podcast shows and episodes — create, edit, upload assets, and publish audio content with custom metadata and video backgrounds.",
        iconName: "Mic",
        link: "/administration/podcasts/shows",
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
    ],
  },
  {
    name: "Surfaces",
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
    name: "Server Cache",
    iconName: "Server",
    iconColor: "text-green-600",
    features: [
      {
        title: "Server Cache",
        description:
          "Refresh and manage server-side caches including AI models and other cached data",
        iconName: "RefreshCw",
        link: "/administration/server-cache",
      },
    ],
  },
  {
    name: "User Feedback & Announcements",
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
        title: "Invitation Requests",
        description:
          "Review and manage access requests. Approve or reject applicants and send invitation codes via email.",
        iconName: "Users",
        link: "/administration/invitation-requests",
      },
      {
        title: "Email Users",
        description:
          "Send emails to users directly from the admin portal using custom or template-based messages.",
        iconName: "Send",
        link: "/administration/email",
      },
      {
        title: "Admins & Levels",
        description:
          "Promote, demote, and revoke admin access. Super Admin only — guarded at the database, not just the UI.",
        iconName: "Users",
        link: "/administration/admins",
      },
      {
        title: "Users",
        description:
          "View every account and flip the onboarding flag. New users are routed to /welcome instead of the dashboard on login.",
        iconName: "Users",
        link: "/administration/users",
      },
    ],
  },
  {
    name: "Component Demos",
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
    name: "Database",
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
        title: "Database Tools Hub",
        description:
          "Landing page for SQL editor, workbench, functions, and enum management.",
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
    ],
  },
  {
    name: "Schema",
    iconName: "Database",
    iconColor: "text-cyan-600",
    features: [
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
    name: "TypeScript",
    iconName: "Code",
    iconColor: "text-indigo-600",
    features: [
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
          "Diagnostic loop for window_sessions: DB rows, Redux overlays, window manager geometry, and persistence context side-by-side.",
        iconName: "Layout",
        link: "/administration/persistence-test",
        isNew: true,
      },
    ],
  },
];
