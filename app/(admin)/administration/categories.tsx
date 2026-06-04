import {
  IconAccessible,
  IconMicrophone,
  IconAdjustmentsBolt,
  IconAlertOctagon,
  IconApi,
  IconBox,
  IconBrandCloudflare,
  IconBug,
  IconCalendar,
  IconChartBar,
  IconChartLine,
  IconClipboard,
  IconCloud,
  IconCloudShare,
  IconCode,
  IconDashboard,
  IconDatabase,
  IconDownload,
  IconFile,
  IconFishHook,
  IconFlag,
  IconFolder,
  IconGitBranch,
  IconHistory,
  IconImageInPicture,
  IconLock,
  IconLogs,
  IconMagnet,
  IconMaximize,
  IconMinimize,
  IconPencil,
  IconRefresh,
  IconRestore,
  IconRobot,
  IconServer,
  IconSettings,
  IconShield,
  IconShieldLock,
  IconSquareToggle,
  IconTestPipe,
  IconUsers,
} from "@tabler/icons-react";
import React from "react";
import {
  Container,
  Cpu,
  Database,
  DatabaseBackup,
  DatabaseZap,
  MessageSquare,
  Megaphone,
  Layout,
  Brain,
  Beaker,
  Search,
  BarChart3,
  Send,
  AlertCircle,
  AlertTriangle,
  DollarSign,
  Zap,
  List,
  Network,
  CalendarClock,
  Boxes,
  LayoutDashboard,
} from "lucide-react";

export const adminCategories = [
  {
    name: "CX Conversations",
    icon: <MessageSquare className="w-6 h-6" />,
    iconColor: "text-cyan-600",
    features: [
      {
        title: "CX Dashboard",
        description:
          "Overview with KPIs, cost trends, model usage, and aggregate metrics for the CX conversation system.",
        icon: <BarChart3 />,
        link: "/administration/cx-dashboard",
      },
      {
        title: "Conversations",
        description:
          "Browse all conversations with filtering, search, message drill-down, and sub-agent chain tracking.",
        icon: <MessageSquare />,
        link: "/administration/cx-dashboard/conversations",
      },
      {
        title: "User Requests",
        description:
          "Track every user request with token usage, cost, iterations, tool calls, and performance metrics.",
        icon: <Send />,
        link: "/administration/cx-dashboard/requests",
      },
      {
        title: "Usage & Cost Analytics",
        description:
          "Cost analytics by model, provider, and day with charts and detailed breakdowns.",
        icon: <DollarSign />,
        link: "/administration/cx-dashboard/usage",
      },
      {
        title: "Errors & Issues",
        description:
          "Track pending requests, max_tokens hits, tool call errors, and system failures.",
        icon: <AlertCircle />,
        link: "/administration/cx-dashboard/errors",
      },
    ],
  },
  {
    name: "Experimental",
    icon: <Beaker className="w-6 h-6" />,
    iconColor: "text-fuchsia-600",
    features: [
      {
        title: "Experimental Routes",
        description:
          "Access all experimental, demo, and test routes organized by feature area for easy testing and development",
        icon: <Beaker />,
        link: "/administration/experimental-routes",
      },
    ],
  },
  {
    name: "Sandbox & DevOps",
    icon: <Container className="w-6 h-6" />,
    iconColor: "text-orange-600",
    features: [
      {
        title: "Sandbox Infrastructure",
        description:
          "Live health for the EC2 + self-hosted orchestrators backing /code: per-tier disk/memory/CPU pressure, container counts, latest deploy runs, and one-click trigger. Catches silent deploy failures early.",
        icon: <IconDashboard />,
        link: "/administration/sandbox-infra",
      },
      {
        title: "Sandbox Management",
        description:
          "Monitor all sandbox instances, manage containers, and access running sandboxes via SSH",
        icon: <IconServer />,
        link: "/administration/sandbox",
      },
      {
        title: "Server Logs",
        description:
          "Live log viewer for all Coolify-managed services. Filter by level, category, and module. Split-screen JSON inspector with deep-link URLs per server.",
        icon: <IconLogs />,
        link: "/administration/server-logs",
      },
      {
        title: "Resilience Lab",
        description:
          "Synthetic failure scenarios for the request-recovery + netRequests system. Fires client-simulated and live Python /ai/mock-stream/{scenario} streams through the real resilientFetch + monitorStream stack.",
        icon: <IconBug />,
        link: "/administration/resilience-lab",
      },
    ],
  },
  {
    name: "Scheduling",
    icon: <CalendarClock className="w-6 h-6" />,
    iconColor: "text-blue-600",
    features: [
      {
        title: "Scheduling Overview",
        description:
          "Cross-user health for the sch_* spine: task counts, runs, failures, and orphan leases.",
        icon: <CalendarClock />,
        link: "/administration/scheduling",
        isNew: true,
      },
      {
        title: "Scheduled Tasks",
        description:
          "Every scheduled task across the platform — filter, inspect, and disable.",
        icon: <IconCalendar />,
        link: "/administration/scheduling/tasks",
      },
      {
        title: "Run History",
        description: "Run history with status, surface, and date filters.",
        icon: <IconChartLine />,
        link: "/administration/scheduling/runs",
      },
      {
        title: "Orphan Leases",
        description:
          "Claims that lapsed mid-execution — watch for spikes that indicate scanner issues.",
        icon: <IconAlertOctagon />,
        link: "/administration/scheduling/orphan-leases",
      },
      {
        title: "Cron Tester",
        description:
          "Validate any cron expression and timezone; preview the next N fire times.",
        icon: <IconCalendar />,
        link: "/administration/scheduling/cron-tester",
      },
      {
        title: "Scanner Health",
        description:
          "aidream-backed scheduler status: last tick, queue depth, and in-flight claims.",
        icon: <IconServer />,
        link: "/administration/scheduling/scanner-health",
      },
      {
        title: "Schedule Templates",
        description:
          "Curated starter schedules users can clone when creating tasks.",
        icon: <IconClipboard />,
        link: "/administration/scheduling/templates",
      },
    ],
  },
  {
    name: "Research System",
    icon: <Search className="w-6 h-6" />,
    iconColor: "text-emerald-600",
    features: [
      {
        title: "Research Admin",
        description:
          "Manage research templates, agent wiring, system constants, and monitor active research projects",
        icon: <Search />,
        link: "/administration/research-system",
        isNew: true,
      },
    ],
  },
  {
    name: "Knowledge Graph",
    icon: <Network className="w-6 h-6" />,
    iconColor: "text-teal-600",
    features: [
      {
        title: "KG Cost Dashboard",
        description:
          "Auto-ingest spend per org, in-flight provider batches, and cap KPIs (spend today, 7d, orgs near cap, pending batches).",
        icon: <DollarSign />,
        link: "/administration/kg-cost",
        isNew: true,
      },
      {
        title: "KG Inspector",
        description:
          "Read-only viewer for knowledge-graph entities, mentions, and edges (NER data-quality inspection).",
        icon: <Network />,
        link: "/administration/kg-inspector",
        isNew: true,
      },
    ],
  },
  {
    name: "AI Models",
    icon: <Brain className="w-6 h-6" />,
    iconColor: "text-violet-600",
    features: [
      {
        title: "AI Model Registry",
        description:
          "Manage the full AI model registry — edit parameters, JSON controls, endpoints, deprecation flags, and pricing tiers.",
        icon: <Brain />,
        link: "/administration/ai-models",
      },
      {
        title: "Data Audit",
        description:
          "Audit all models for missing or invalid data across pricing, API class, capabilities, and core fields. Fix issues inline with live pass/fail scoring.",
        icon: <AlertCircle />,
        link: "/administration/ai-models/audit",
      },
      {
        title: "Deprecated Models",
        description:
          "Find deprecated models with active prompt/builtin references. Replace them individually with full settings review, or bulk-replace all at once.",
        icon: <AlertTriangle />,
        link: "/administration/ai-models/deprecated-audit",
      },
      {
        title: "Provider Model Sync",
        description:
          "Fetch live model lists from Anthropic, OpenAI, Groq, and other providers. Compare against your database to find missing or extra models and keep everything in sync.",
        icon: <IconRefresh />,
        link: "/administration/ai-models/provider-sync",
      },
    ],
  },
  {
    name: "System Agents",
    icon: <Zap className="w-6 h-6" />,
    iconColor: "text-rose-600",
    features: [
      {
        title: "System Agents Dashboard",
        description:
          "Hub for every global-scope agent surface: builtin agents, shortcuts, categories, content blocks, and system agent apps.",
        icon: <Zap />,
        link: "/administration/system-agents",
        isNew: true,
      },
      {
        title: "System agents — list",
        description:
          "Browse, build, and run builtin (global) agents. Includes agents converted from user definitions.",
        icon: <IconRobot />,
        link: "/administration/system-agents/agents",
        isNew: true,
      },
      {
        title: "Shortcuts — list",
        description:
          "Browse and edit global agent shortcuts, enabled contexts, and agent bindings.",
        icon: <Zap />,
        link: "/administration/system-agents/shortcuts",
        isNew: true,
      },
      {
        title: "Shortcut categories",
        description:
          "Placement hierarchy, icons, and enabled contexts for agent shortcut groups.",
        icon: <Zap />,
        link: "/administration/system-agents/categories",
        isNew: true,
      },
      {
        title: "Content blocks",
        description:
          "Reusable insertable blocks surfaced under agent shortcut categories.",
        icon: <Zap />,
        link: "/administration/system-agents/content-blocks",
        isNew: true,
      },
      {
        title: "System agent apps",
        description:
          "Global-scope agent apps available to every user. Distinct from moderation of user-published apps.",
        icon: <IconRobot />,
        link: "/administration/system-agents/apps",
        isNew: true,
      },
      {
        title: "Agent lineage",
        description:
          "See what each system agent gives rise to — derived agents, shortcuts, and apps.",
        icon: <IconGitBranch />,
        link: "/administration/system-agents/lineage",
        isNew: true,
      },
    ],
  },
  {
    name: "Agent Apps",
    icon: <Boxes className="w-6 h-6" />,
    iconColor: "text-indigo-600",
    features: [
      {
        title: "Agent Apps Dashboard",
        description:
          "Hub for moderating user-published agent apps: featured picks, verification, and quick stats.",
        icon: <LayoutDashboard />,
        link: "/administration/agent-apps",
        isNew: true,
      },
      {
        title: "All Agent Apps",
        description:
          "Every agent app across the platform — filter, feature, verify, and moderate.",
        icon: <Boxes />,
        link: "/administration/agent-apps/apps",
      },
      {
        title: "Agent App Categories",
        description:
          "Manage the static category list shown in public agent-app browsing.",
        icon: <IconFolder />,
        link: "/administration/agent-apps/categories",
      },
      {
        title: "Agent App Executions",
        description:
          "Recent runs and errors across every agent app. Resolve incidents and inspect usage.",
        icon: <IconChartLine />,
        link: "/administration/agent-apps/executions",
      },
      {
        title: "Agent App Analytics",
        description:
          "Usage and performance analytics across published agent apps.",
        icon: <BarChart3 />,
        link: "/administration/agent-apps/analytics",
      },
      {
        title: "Agent App Rate Limits",
        description:
          "Configure and audit rate limits for agent app invocations.",
        icon: <IconShield />,
        link: "/administration/agent-apps/rate-limits",
      },
    ],
  },
  {
    name: "Agent Skills",
    icon: <Brain className="w-6 h-6" />,
    iconColor: "text-amber-600",
    features: [
      {
        title: "Skills registry",
        description:
          "Curate every skill on the platform — system, public, and user-owned. Promote a skill to system, edit metadata, or soft-delete.",
        icon: <Brain />,
        link: "/administration/skills",
        isNew: true,
      },
      {
        title: "Categories",
        description:
          "Hierarchical category tree that drives the catalog overview preamble for every agent.",
        icon: <IconFolder />,
        link: "/administration/skills/categories",
        isNew: true,
      },
      {
        title: "Filesystem ingest",
        description:
          "Bulk-import SKILL.md files from one or more repo paths or leaf skills directories. Dry-run + apply with body-hash idempotency.",
        icon: <IconDownload />,
        link: "/administration/skills/ingest",
        isNew: true,
      },
    ],
  },
  {
    name: "Prompt Shortcuts",
    icon: <IconRobot className="w-6 h-6" />,
    iconColor: "text-indigo-600",
    features: [
      {
        title: "Categories & Shortcuts",
        description:
          "Manage AI prompt shortcuts with keyboard bindings, scope mappings, and prompt connections for context menus, buttons, and cards.",
        icon: <IconRobot />,
        link: "/administration/prompt-builtins",
      },
      {
        title: "Shortcuts Table",
        description:
          "Tabular view of all prompt shortcuts for bulk inspection and editing.",
        icon: <Zap />,
        link: "/administration/prompt-builtins/shortcuts",
      },
      {
        title: "Prompt Builtins",
        description:
          "Builtin prompt definitions wired into shortcuts and context menus.",
        icon: <IconFile />,
        link: "/administration/prompt-builtins/builtins",
      },
      {
        title: "Shortcut Categories",
        description:
          "Manage prompt shortcut categories with placement types, hierarchy, icons, and colors for organizing AI actions.",
        icon: <IconAdjustmentsBolt />,
        link: "/administration/shortcut-categories",
      },
    ],
  },
  {
    name: "Podcasts",
    icon: <IconMicrophone className="w-6 h-6" />,
    iconColor: "text-sky-600",
    features: [
      {
        title: "Podcast Manager",
        description:
          "Manage podcast shows and episodes — create, edit, upload assets, and publish audio content with custom metadata and video backgrounds.",
        icon: <IconMicrophone />,
        link: "/administration/podcasts/shows",
        isNew: true,
      },
    ],
  },
  {
    name: "Prompt Apps",
    icon: <IconRobot className="w-6 h-6" />,
    iconColor: "text-red-600",
    features: [
      {
        title: "Apps Manager",
        description:
          "Manage prompt app categories, view errors, monitor analytics, moderate apps, and manage rate limits.",
        icon: <IconRobot />,
        link: "/administration/prompt-apps",
      },
    ],
  },
  {
    name: "Content & Configuration",
    icon: <IconPencil className="w-6 h-6" />,
    iconColor: "text-purple-600",
    features: [
      {
        title: "Content Blocks",
        description:
          "Manage content blocks, templates, and context menu items used throughout the application",
        icon: <IconClipboard />,
        link: "/administration/content-blocks",
      },
      {
        title: "Content Templates",
        description:
          "Manage message templates for prompts including system, user, assistant, and tool messages",
        icon: <MessageSquare />,
        link: "/administration/content-templates",
      },
      {
        title: "Markdown Content Tester",
        description:
          "Test and debug MarkdownStream rendering with live split-screen preview. Perfect for testing diagrams, quizzes, tables, and other content formats.",
        icon: <IconCode />,
        link: "/administration/markdown-tester",
      },
    ],
  },
  {
    name: "Tool Registry",
    icon: <IconTestPipe className="w-6 h-6" />,
    iconColor: "text-pink-600",
    features: [
      {
        title: "Tool Definitions",
        description:
          "The 380-row tool_def catalog — every tool the platform can run (built-in, browser, server, MCP). Per-tool admin: identity, parameters, executors, surfaces, bundles, gating, UI components, test samples, incidents. Bulk activate / deactivate / delete.",
        icon: <IconTestPipe />,
        link: "/administration/mcp-tools",
      },
      {
        title: "MCP Servers",
        description:
          "Provision new servers (one-click 4-row insert: server + executor kind + system bundle + lister tool). Per-server tabs for tools / configs / connected users / metadata. Test connection probes the endpoint and persists health.",
        icon: <IconServer />,
        link: "/administration/mcp-servers",
        isNew: true,
      },
      {
        title: "Bundles",
        description:
          "System and personal tool bundles. Create with auto-lister (one click), edit metadata, manage member aliases, search-and-add tools across the catalog.",
        icon: <IconBox />,
        link: "/administration/bundles",
        isNew: true,
      },
      {
        title: "UI Surfaces",
        description:
          "100+ surfaces grouped by client and tier (Pages / Specialized / Overlays / Editor variants / Debug). Bulk activate / deactivate, inline description edit, FK-aware delete, rename via FK CASCADE, candidate-inventory bulk-add.",
        icon: <Layout />,
        link: "/administration/surfaces",
        isNew: true,
      },
      {
        title: "Tool Runtimes",
        description:
          "Tools per executor: pick an executor (matrx-ai-core, aidream, matrx-local, chrome-extension, matrx-user, or mcp.<slug>) and manage which tools it can handle. Manages tool_binding rows (a pure M2M between tool_def and tool_executor).",
        icon: <Cpu />,
        link: "/administration/executor-surfaces",
        isNew: true,
      },
      {
        title: "Lookups",
        description:
          "CRUD for tool-registry lookup tables: ui_client, ui_surface (basic), tool_executor. Foundation tables every other registry feature reads.",
        icon: <IconAdjustmentsBolt />,
        link: "/administration/lookups",
        isNew: true,
      },
      {
        title: "New Tool Definition",
        description:
          "Create a new row in the tool_def catalog (identity, parameters, executors, surfaces).",
        icon: <IconPencil />,
        link: "/administration/mcp-tools/new",
      },
    ],
  },
  {
    name: "Server Cache",
    icon: <IconServer className="w-6 h-6" />,
    iconColor: "text-green-600",
    features: [
      {
        title: "Server Cache",
        description:
          "Refresh and manage server-side caches including AI models and other cached data",
        icon: <IconRefresh />,
        link: "/administration/server-cache",
      },
    ],
  },

  {
    name: "User Feedback & Announcements",
    icon: <MessageSquare className="w-6 h-6" />,
    iconColor: "text-orange-600",
    features: [
      {
        title: "Feedback Management",
        description:
          "View and manage user feedback, bug reports, and feature requests. Create and manage system announcements.",
        icon: <MessageSquare />,
        link: "/administration/feedback",
      },
      {
        title: "Invitation Requests",
        description:
          "Review and manage access requests. Approve or reject applicants and send invitation codes via email.",
        icon: <IconUsers />,
        link: "/administration/invitation-requests",
      },
      {
        title: "Email Users",
        description:
          "Send emails to users directly from the admin portal using custom or template-based messages.",
        icon: <Send />,
        link: "/administration/email",
      },
      {
        title: "Admins & Levels",
        description:
          "Promote, demote, and revoke admin access. Super Admin only — guarded at the database, not just the UI.",
        icon: <IconUsers />,
        link: "/administration/admins",
      },
    ],
  },

  {
    name: "Component Demos",
    icon: <Layout className="w-6 h-6" />,
    iconColor: "text-teal-600",
    features: [
      {
        title: "Official Components",
        description:
          "Browse and test all official UI components with live demos, code examples, and documentation.",
        icon: <Layout />,
        link: "/administration/official-components",
      },
    ],
  },
  {
    name: "Files",
    icon: <IconFolder className="w-6 h-6" />,
    iconColor: "text-amber-600",
    features: [
      {
        title: "Local Storage Admin",
        description:
          "Inspect, edit, and manage browser localStorage and cookies with import/export support.",
        icon: <IconDatabase />,
        link: "/administration/local-storage",
      },
      {
        title: "Blob Cache Observability",
        description:
          "3-tier byte cache health (memory / IndexedDB / Service Worker), eviction controls, and stale-bytes incident wipe.",
        icon: <IconCloud />,
        link: "/administration/blob-cache",
      },
    ],
  },
  {
    name: "Database",
    icon: <Database className="w-6 h-6" />,
    iconColor: "text-blue-600",
    features: [
      {
        title: "Database Admin Dashboard",
        description: "See functions, security policies, and more",
        icon: <DatabaseBackup />,
        link: "/administration/database-admin",
      },
      {
        title: "Database Tools Hub",
        description:
          "Landing page for SQL editor, workbench, functions, and enum management.",
        icon: <DatabaseZap />,
        link: "/administration/database",
      },
      {
        title: "SQL Editor",
        description: "Execute SQL queries directly against the database",
        icon: <IconCode />,
        link: "/administration/database/sql-queries",
      },
      {
        title: "SQL Workbench",
        description:
          "Multi-query notebook with shared variables and merged result sets.",
        icon: <DatabaseZap />,
        link: "/administration/database/workbench",
        isNew: true,
      },
      {
        title: "SQL Functions",
        description: "Browse, search, and manage SQL functions",
        icon: <IconCode />,
        link: "/administration/database/sql-functions",
      },
      {
        title: "Database Enums",
        description: "Manage database enum types and their values",
        icon: <IconSquareToggle />,
        link: "/administration/database/enums",
        isNew: true,
      },
    ],
  },
  {
    name: "Schema",
    icon: <IconDatabase className="w-6 h-6" />,
    iconColor: "text-cyan-600",
    features: [
      {
        title: "Schema Visualizer",
        description:
          "Visualize the full database schema with interactive diagrams",
        icon: <IconFlag />,
        link: "/administration/schema-visualizer",
      },
      {
        title: "Enhanced Schema Visualizer",
        description:
          "Advanced schema visualization with enhanced features and filtering",
        icon: <IconAdjustmentsBolt />,
        link: "/administration/schema-visualizer-enhanced",
      },
    ],
  },
  {
    name: "TypeScript",
    icon: <IconCode className="w-6 h-6" />,
    iconColor: "text-indigo-600",
    features: [
      {
        title: "TypeScript Error Analyzer",
        description:
          "View, filter, and analyze TypeScript compilation errors across the project",
        icon: <IconCode />,
        link: "/administration/typescript-errors",
      },
    ],
  },
  {
    name: "Developer Tools",
    icon: <IconCode className="w-6 h-6" />,
    iconColor: "text-slate-600",
    features: [
      {
        title: "All Administration Routes",
        description:
          "Auto-generated filesystem index of every page under /administration — catches routes missing from this hub.",
        icon: <List />,
        link: "/administration/all-routes",
        isNew: true,
      },
      {
        title: "Schema Manager",
        description:
          "Manage and interact with the database schema, run queries, and inspect type solutions.",
        icon: <IconDatabase />,
        link: "/legacy/administration/schema-manager",
      },
      {
        title: "AI Tasks",
        description:
          "Monitor AI task runs, view statuses, response text, and track task execution over time.",
        icon: <IconRobot />,
        link: "/administration/ai-tasks",
      },
      {
        title: "Utilities",
        description:
          "Developer utilities hub — text cleaning and other admin transformation tools.",
        icon: <IconAdjustmentsBolt />,
        link: "/administration/utils",
      },
      {
        title: "Text Cleaner",
        description:
          "Clean, transform, and process text with configurable pattern-based utilities.",
        icon: <IconClipboard />,
        link: "/administration/utils/text-cleaner",
      },
      {
        title: "Window Persistence Tester",
        description:
          "Diagnostic loop for window_sessions: DB rows, Redux overlays, window manager geometry, and persistence context side-by-side.",
        icon: <Layout />,
        link: "/administration/persistence-test",
        isNew: true,
      },
    ],
  },
  // {
  //     name: "*** DevOps & Deployment",
  //     icon: <IconGitBranch className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Quality & Testing",
  //     icon: <IconTestPipe className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** System Health",
  //     icon: <IconChartLine className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Database & Data",
  //     icon: <IconDatabase className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Feature Management",
  //     icon: <IconFlag className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Security & Access",
  //     icon: <IconLock className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Content & Config",
  //     icon: <IconPencil className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Automation & Tasks",
  //     icon: <IconRobot className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Environment-Specific Storage Management",
  //     icon: <IconCloud className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** File Versioning & History Management",
  //     icon: <IconHistory className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Asset Optimization & CDN Management",
  //     icon: <IconMaximize className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Storage Quota & Usage Monitoring",
  //     icon: <IconDatabase className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Advanced File Permissions & Access Control",
  //     icon: <IconShield className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** File Backup & Restore",
  //     icon: <CiFloppyDisk className="w-6 h-6" />,
  //     features: [],
  // },
  // {
  //     name: "*** Developer Tools & Integrations",
  //     icon: <IconCode className="w-6 h-6" />,
  //     features: [],
  // },
];
