// nav-data.ts — Pure data, no React/JSX imports
// Single source of truth for primary + admin shell navigation (all layouts).

/**
 * Where an **admin** row is listed (primary nav ignores this).
 * - `sidebar` — desktop secondary admin strip (when the admin indicator is visible)
 * - `headerMenu` — profile / header dropdown → Admin section
 * Omit on a row → both surfaces (default). Keeps one definition without deleting routes.
 */
export type AdminNavSurface = "sidebar" | "headerMenu";

/**
 * Declarative client-side actions a nav entry can trigger INSTEAD of navigating
 * (e.g. open an overlay/window). Pure data lives here; the actual handlers are
 * wired in `features/shell/navigation/navActions.ts` (`useNavActions`).
 *
 * Progressive enhancement is the contract: a surface that understands actions
 * renders a button that runs the handler; a surface that does NOT yet
 * understand them simply falls back to the entry's `href` (navigation). Adding
 * an action therefore never breaks a surface — it only upgrades the ones that
 * opt in. Add the next action's id to this union and register its handler.
 */
export type ShellNavActionId =
  | "create-project"
  | "create-task"
  | "create-war-room"
  | "create-note";

export const DEFAULT_ADMIN_SURFACES: AdminNavSurface[] = [
  "sidebar",
  "headerMenu",
];

/**
 * Separately-hosted Matrx apps that live on their own origin (not Next routes).
 * These are reached via absolute URLs + `external: true` so the shell renders
 * a real `<a target="_blank">` (new tab) with an external-link affordance,
 * instead of an in-app `<Link>` transition. Add future standalone apps here.
 */
export const WORKFLOWS_APP_URL = "https://workflows.aimatrx.com";

/** Standalone admin SPA (separate Vite app on its own origin). */
export const ADMIN_APP_URL = "https://admin.aimatrx.com";

export function adminItemOnSurface(
  item: ShellNavItem,
  surface: AdminNavSurface,
): boolean {
  if (item.section !== "admin") return false;
  const surfaces = item.adminSurfaces ?? DEFAULT_ADMIN_SURFACES;
  return surfaces.includes(surface);
}

export interface ShellNavChild {
  label: string;
  href: string;
  iconName: string;
  exact?: boolean;
  /** Optional subgroup label in sidebar / mobile flyouts (e.g. "RAG"). */
  group?: string;
  /**
   * Group-child metadata. A group parent is a sidebar-only organizational
   * node (`dashboard: false`); its real destinations live on the children.
   * These optional fields let a child surface as a dashboard tile / profile
   * menu entry just like a top-level item, so nesting the sidebar never
   * removes a destination from the dashboard or profile menu.
   */
  description?: string;
  color?: string;
  dashboard?: boolean;
  profileMenu?: boolean;
  guestHidden?: boolean;
  guestHref?: string;
  /**
   * Points at a separately-hosted app on its own origin. When true, `href` is
   * an absolute URL and the shell renders an `<a target="_blank">` (new tab)
   * with an external-link icon instead of an in-app `<Link>` transition.
   */
  external?: boolean;
  /**
   * When set, action-aware surfaces render this entry as a button that runs the
   * registered handler (see `useNavActions`) instead of navigating. The `href`
   * stays as the fallback for surfaces that don't yet understand actions.
   */
  action?: ShellNavActionId;
  /**
   * Marks this child as an **action** (a create/add affordance) rather than a
   * navigation destination. Action children always render together in a
   * dedicated section at the BOTTOM of the menu, below a divider, regardless of
   * their position in this array — the house standard for every nav group (see
   * `partitionNavChildren`). A child with an overlay `action` is treated as an
   * action automatically; set this flag for plain-link creates (e.g. an
   * "Add X" that navigates to `/x/new` with no overlay handler).
   */
  actionItem?: boolean;
}

export interface ShellNavItem {
  label: string;
  href: string;
  iconName: string;
  section: "primary" | "admin";
  dockOrder?: number;
  description?: string;
  color?: string;
  children?: ShellNavChild[];
  /** Admin dropdown grouping (Desktop admin menu). */
  category?: string;
  /** Profile / header navigation menu. */
  profileMenu?: boolean;
  /** Dashboard app grid tiles. */
  dashboard?: boolean;
  /**
   * Admin rows only: which UI surfaces show this link.
   * Default when omitted: sidebar + header Admin menu.
   */
  adminSurfaces?: AdminNavSurface[];
  /**
   * Hide this row from guest (unauthenticated) visitors. Use for surfaces
   * that have no meaningful guest experience (e.g. personal DMs).
   * Defaults to `false` — every row is guest-visible unless explicitly
   * hidden. Children pages are still reachable by direct URL; the soft
   * auth gate handles access there.
   */
  guestHidden?: boolean;
  /**
   * Where the row points for guest visitors. When set, the guest nav
   * uses this href instead of `href` — typically a marketing landing
   * (`/chat`) instead of the workspace URL (`/chat/new`) so guests
   * don't bounce off a workspace they can't use yet.
   */
  guestHref?: string;
  /**
   * Points at a separately-hosted app on its own origin. When true, `href` is
   * an absolute URL and the shell renders an `<a target="_blank">` (new tab)
   * with an external-link icon instead of an in-app `<Link>` transition.
   */
  external?: boolean;
}

// Primary navigation items — canonical app URLs shared by (a), (ssr), and (authenticated).
export const primaryNavItems: ShellNavItem[] = [
  {
    // Authed users get their personalized hub; guests get the public
    // "browse the platform" surface (`/features`) since the dashboard
    // is meaningless without a signed-in user — and the middleware
    // hard-redirects guests off `/dashboard` to `/login` anyway, so
    // pointing the sidebar there would bounce guests through an
    // unnecessary login hop.
    label: "AI Matrx",
    href: "/dashboard",
    guestHref: "/features",
    iconName: "LayoutDashboard",
    section: "primary",
    dockOrder: 1,
    profileMenu: true,
    dashboard: true,
    description: "Your central hub for all activities and insights",
    color: "sky",
  },
  {
    // Sidebar points at the workspace (`/chat/new`) for authed users; for
    // guests, the marketing landing (`/chat`) so they land somewhere
    // meaningful instead of a composer they can't yet send from.
    label: "Chat",
    href: "/chat/new",
    guestHref: "/chat",
    iconName: "MessageCircle",
    section: "primary",
    dockOrder: 2,
    profileMenu: true,
    dashboard: false,
    description: "Interact with our reimagined chat interface",
    color: "indigo",
  },
  {
    // Sidebar points at the gallery (`/agents/all`) for authed users; for
    // guests, the marketing landing (`/agents`) so they see the pitch
    // instead of the deep-link compact card.
    label: "Agents",
    href: "/agents/all",
    guestHref: "/agents",
    iconName: "Webhook",
    section: "primary",
    dockOrder: 3,
    profileMenu: true,
    dashboard: true,
    description: "AI Agent Harness Management",
    color: "blue",
    children: [
      {
        label: "All Agents",
        href: "/agents/all",
        iconName: "List",
        exact: true,
      },
      {
        label: "Templates",
        href: "/agents/templates",
        iconName: "LayoutTemplate",
      },
      { label: "Shortcuts", href: "/agents/shortcuts", iconName: "Zap" },
      { label: "Categories", href: "/agents/categories", iconName: "Folder" },
      {
        label: "Content Blocks",
        href: "/agents/content-blocks",
        iconName: "FileText",
      },
      {
        label: "Agent Connections",
        href: "/agent-connections",
        iconName: "Plug",
        description:
          "Tools, skills, MCP servers, and plugins your agents can reach",
      },
      {
        label: "Agent Battle",
        href: "/agents/battle",
        iconName: "Swords",
        description:
          "Compare agents side by side — models, prompts, and outputs",
      },
      // Actions — collected at the bottom below a divider.
      {
        label: "New Agent",
        href: "/agents/new",
        iconName: "Plus",
        actionItem: true,
      },
    ],
  },
  {
    // Group parent — notes & cloud documents.
    label: "Docs",
    href: "/notes",
    iconName: "NotepadText",
    section: "primary",
    dockOrder: 4,
    profileMenu: false,
    dashboard: false,
    description: "Notes and cloud documents",
    color: "amber",
    children: [
      {
        label: "Notes",
        href: "/notes",
        iconName: "NotebookPen",
        description: "Create and manage your notes and documents",
        color: "amber",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Documents",
        href: "/documents",
        iconName: "FileText",
        description: "Cloud documents — realtime co-editing, full history",
        color: "indigo",
        profileMenu: true,
        dashboard: true,
      },
      // Actions — collected at the bottom below a divider.
      {
        // Creates a blank draft note in place, then opens it.
        label: "New Note",
        href: "/notes",
        iconName: "Plus",
        action: "create-note",
      },
    ],
  },
  {
    // Group parent — Tables, Workbooks, and Pick Lists.
    label: "Data",
    href: "/data",
    iconName: "Table",
    section: "primary",
    dockOrder: 5,
    profileMenu: false,
    dashboard: false,
    description: "Tables, workbooks, and pick lists",
    color: "cyan",
    children: [
      {
        label: "Tables",
        href: "/data",
        iconName: "Table",
        description: "Manage your custom data or create tables in a Chat",
        color: "cyan",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Workbooks",
        href: "/workbooks",
        iconName: "FileSpreadsheet",
        description:
          "Lossless spreadsheets — multi-sheet, formulas, formatting",
        color: "emerald",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Pick Lists",
        href: "/lists",
        iconName: "ListChecks",
        description: "Reusable option lists for forms, fields, and data",
        color: "teal",
        profileMenu: true,
        dashboard: true,
      },
      // Actions — collected at the bottom below a divider.
      {
        label: "New Table",
        href: "/data/create",
        iconName: "Plus",
        actionItem: true,
      },
    ],
  },
  {
    // Group parent — sidebar-only organizational node. Real destinations
    // (My Orgs, Scopes, Context) live on the children so they still appear
    // as dashboard tiles / profile entries via the flatten step.
    label: "My Orgs",
    href: "/organizations",
    iconName: "Building2",
    section: "primary",
    dockOrder: 6,
    profileMenu: false,
    dashboard: false,
    description: "Your teams, scopes, and shared context",
    color: "sky",
    guestHidden: true,
    children: [
      {
        label: "My Orgs",
        href: "/organizations",
        iconName: "Building2",
        description: "Your teams and shared workspaces",
        color: "sky",
        profileMenu: true,
        dashboard: true,
        guestHidden: true,
      },
      {
        label: "Scopes",
        href: "/scopes",
        iconName: "Layers",
        description:
          "Define the dimensions your team works in — clients, products, teams, repos. Scopes carry context into every agent run.",
        color: "emerald",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Context",
        href: "/agent-context",
        iconName: "BookOpen",
        description: "Manage context items, templates, and knowledge (legacy)",
        color: "cyan",
        profileMenu: true,
        dashboard: true,
      },
    ],
  },
  {
    // Knowledge umbrella. Authed users jump straight to the live
    // workspace still needs to be created; guests hit `/knowledge` (the
    // KnowledgeShowcasePage — an informational map of the system, no
    // auth required). `/knowledge/graph` is the graph sub-route.
    label: "Knowledge",
    href: "/knowledge",
    guestHref: "/knowledge",
    iconName: "Database",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description:
      "RAG data stores, knowledge graph, deep research, and org-wide search",
    color: "amber",
    children: [
      {
        label: "Research",
        href: "/research",
        iconName: "FlaskConical",
        description: "Deep research with automated topic analysis",
        color: "purple",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Knowledge Graph",
        href: "/knowledge/graph",
        iconName: "Network",
      },
      {
        label: "Extractions",
        href: "/knowledge/extractions",
        iconName: "Table",
        description:
          "Review, manage, and export structured datasets extracted from documents",
      },
      {
        label: "Data Stores",
        href: "/rag/data-stores",
        iconName: "Database",
        group: "RAG",
      },
      {
        label: "Search",
        href: "/rag/search",
        iconName: "Search",
        group: "RAG",
      },
      {
        label: "Library",
        href: "/rag/library",
        iconName: "FileText",
        group: "RAG",
      },
      {
        label: "Repositories",
        href: "/rag/repositories",
        iconName: "Code2",
        group: "RAG",
      },
      {
        label: "Suggestions",
        href: "/suggestions",
        iconName: "Lightbulb",
        description:
          "Review AI-found field values and scope links from your notes, tasks, and files",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "News",
        href: "/news",
        iconName: "Newspaper",
        description: "Top headlines and curated news feeds",
        profileMenu: true,
        dashboard: true,
      },
      // Actions — collected at the bottom below a divider.
      {
        label: "New Research",
        href: "/research/topics/new",
        iconName: "Plus",
        actionItem: true,
      },
    ],
  },
  {
    label: "Agent Apps",
    href: "/agent-apps",
    iconName: "Puzzle",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Browse and run interactive apps built from agents",
    color: "emerald",
  },
  {
    label: "Reports",
    href: "/reports",
    iconName: "FileChartColumn",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Cross-cutting reports — agent drift and more",
    color: "amber",
    children: [
      {
        label: "Agent Drift",
        href: "/reports/agent-drift",
        iconName: "GitCompareArrows",
      },
    ],
  },
  {
    // Group parent — Podcasts, Artifacts, and CMS sites.
    label: "Publish",
    href: "/podcast",
    iconName: "Megaphone",
    section: "primary",
    profileMenu: false,
    dashboard: false,
    description: "Podcasts, agent artifacts, and published sites",
    color: "violet",
    children: [
      {
        label: "Podcasts",
        href: "/podcast",
        iconName: "Radio",
        description: "Browse shows and manage podcast studio production",
        color: "violet",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Artifacts",
        href: "/artifacts",
        iconName: "LayoutGrid",
        description: "Agent-generated content library and rich outputs",
        color: "indigo",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "CMS",
        href: "/cms",
        iconName: "Globe",
        description: "Build and manage client sites and published pages",
        color: "sky",
        profileMenu: true,
        dashboard: true,
      },
      // Actions — collected at the bottom below a divider.
      {
        label: "New Podcast",
        href: "/podcast/studio/create",
        iconName: "Plus",
        actionItem: true,
      },
    ],
  },

  {
    // Group parent — Projects, Tasks, and the War Room.
    label: "Workspaces",
    href: "/projects",
    iconName: "LayoutGrid",
    section: "primary",
    dockOrder: 7,
    profileMenu: false,
    dashboard: false,
    description: "Projects, tasks, and the War Room",
    color: "violet",
    children: [
      // Destinations — rendered top-to-bottom. The create actions below are
      // collected into their own section at the bottom of the menu by
      // `partitionNavChildren`, regardless of source order.
      {
        label: "Projects",
        href: "/projects",
        iconName: "Folder",
        description: "Create and manage projects, collaborate with teams",
        color: "violet",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Tasks",
        href: "/tasks",
        iconName: "ListTodo",
        description: "Organize and track your tasks and projects",
        color: "emerald",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "War Room",
        href: "/war-room",
        iconName: "Radar",
        description:
          "Session-based command center — tasks, notes, and audio side by side",
        color: "rose",
        profileMenu: true,
        dashboard: true,
      },
      // Actions — every "add" for this group, grouped together below a divider.
      // Each opens its overlay/window in place; `href` is the graceful fallback
      // for non-action-aware surfaces (mobile sheet, ctrl-click new tab).
      {
        label: "New Project",
        href: "/projects/new",
        iconName: "Plus",
        action: "create-project",
      },
      {
        label: "New Task",
        href: "/tasks/new",
        iconName: "Plus",
        action: "create-task",
      },
      {
        label: "New War Room",
        href: "/war-room/all",
        iconName: "Plus",
        action: "create-war-room",
      },
    ],
  },
  {
    // Sidebar points at the workspace (`/files/all`) for authed users; for
    // guests, the marketing landing (`/files`).
    label: "Files",
    href: "/files/all",
    guestHref: "/files",
    iconName: "FolderOpen",
    section: "primary",
    dockOrder: 8,
    profileMenu: true,
    dashboard: true,
    description: "Browse and manage your files and documents",
    color: "blue",
  },
  {
    // Group parent — Utilities. Real destinations live on the children so
    // they still surface as dashboard tiles / profile entries via flatten.
    label: "Utilities",
    href: "/tools/pdf-extractor",
    iconName: "Wrench",
    section: "primary",
    profileMenu: false,
    dashboard: false,
    description: "Handy document and data tools",
    color: "orange",
    children: [
      {
        label: "PDF Extractor",
        href: "/tools/pdf-extractor",
        iconName: "FileScan",
        description: "Upload, extract, and process PDF documents",
        color: "orange",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Webscraper",
        href: "/scraper",
        guestHref: "/features",
        iconName: "Globe",
        description: "Extract and process data from web sources",
        color: "orange",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Markdown Studio",
        href: "/markdown-studio",
        iconName: "PenLine",
        description: "Interactive markdown editor and parser comparison",
        color: "slate",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Data Truncator",
        href: "/free/data-truncator",
        iconName: "Scissors",
        description: "Trim and preview truncated text for UI limits",
        color: "orange",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "UUID Generator",
        href: "/free/uuid/generator",
        iconName: "Hash",
        description: "Generate UUIDs on the client — single or bulk",
        color: "orange",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Zip Code Heatmap",
        href: "/free/zip-code-heatmap",
        iconName: "Map",
        description: "Visualize US zip code density on an interactive map",
        color: "orange",
        profileMenu: true,
        dashboard: true,
      },
    ],
  },
  {
    // Group parent — Media.
    label: "Media",
    href: "/images",
    iconName: "Images",
    section: "primary",
    profileMenu: false,
    dashboard: false,
    description: "Images and visual media tools",
    color: "pink",
    children: [
      {
        label: "Images",
        href: "/images",
        iconName: "Aperture",
        description: "Browse, generate, edit, annotate, and convert images",
        color: "pink",
        profileMenu: true,
        dashboard: true,
      },
    ],
  },
  {
    // Transcripts umbrella — one feature, slash-versioned sub-routes.
    // `/transcripts` is BOTH the public landing (for guests) AND the
    // canonical processor workspace (for authed users); server-side
    // branched in `app/(core)/transcripts/page.tsx`. Studio + Scribe
    // live as sub-routes. Old `/transcription/*` URLs redirect via
    // `next.config.js`.
    label: "Transcripts",
    href: "/transcripts",
    iconName: "Mic",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Record, transcribe, and manage audio.",
    color: "rose",
    children: [
      {
        label: "All Transcripts",
        href: "/transcripts",
        iconName: "List",
        exact: true,
      },
      {
        label: "Processor",
        href: "/transcripts/processor",
        iconName: "FileText",
      },
      { label: "Studio", href: "/transcripts/studio", iconName: "Columns2" },
      { label: "Scribe", href: "/transcripts/scribe", iconName: "Mic" },
      { label: "Cleanup", href: "/transcripts/cleanup", iconName: "Eraser" },
      // Actions — collected at the bottom below a divider.
      {
        label: "New Transcript",
        href: "/transcripts/new",
        iconName: "Plus",
        actionItem: true,
      },
    ],
  },
  {
    // Group parent — Code workspace and Sandboxes.
    label: "Code",
    href: "/code",
    iconName: "Code2",
    section: "primary",
    profileMenu: false,
    dashboard: false,
    description: "Code workspace and sandboxes",
    color: "indigo",
    children: [
      {
        label: "Code",
        href: "/code",
        iconName: "Code2",
        description: "VSCode-style workspace for sandbox and cloud projects",
        color: "indigo",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Sandboxes",
        href: "/sandbox",
        iconName: "Container",
        description: "Your AI Agents in a cloud computer with your stuff!",
        color: "orange",
        profileMenu: true,
        dashboard: true,
      },
    ],
  },
  {
    label: "Automations",
    href: "/schedules",
    iconName: "CalendarClock",
    section: "primary",
    profileMenu: false,
    dashboard: false,
    description: "Scheduled agent and task runs",
    color: "blue",
    children: [
      {
        label: "Schedules",
        href: "/schedules",
        iconName: "CalendarClock",
        description: "Create and manage recurring agent and task schedules",
        color: "blue",
        profileMenu: true,
        dashboard: true,
      },
      // Actions — collected at the bottom below a divider.
      {
        label: "New Schedule",
        href: "/schedules/new",
        iconName: "Plus",
        actionItem: true,
      },
    ],
  },
  {
    label: "Legal Hub",
    href: "/legal",
    iconName: "Scale",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Legal tools, calculators, and case utilities",
    color: "slate",
  },
  {
    // Placeholder until a dedicated /medical landing ships.
    label: "Medical Hub (Soon)",
    href: "/education",
    iconName: "HeartPulse",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Medical calculators and clinical tools — coming soon",
    color: "rose",
  },
  {
    label: "Education Hub",
    href: "/education",
    iconName: "GraduationCap",
    section: "primary",
    profileMenu: false,
    dashboard: false,
    description: "Free learning resources — math, flashcards, and more",
    color: "emerald",
    children: [
      {
        label: "Education Center",
        href: "/education",
        iconName: "GraduationCap",
        description: "Browse courses and learning resources",
        color: "emerald",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Math",
        href: "/education/math",
        iconName: "BookOpen",
        description: "Interactive algebra lessons with step-by-step solutions",
        color: "emerald",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Flashcards",
        href: "/flashcard",
        iconName: "Layers",
        description: "Study decks and fast-fire review modes",
        color: "teal",
        profileMenu: true,
        dashboard: true,
      },
    ],
  },
  {
    label: "Marketing Hub",
    href: "/seo",
    iconName: "TrendingUp",
    section: "primary",
    profileMenu: false,
    dashboard: false,
    description: "SEO tools, meta previews, and search console access",
    color: "green",
    children: [
      {
        label: "SEO Tools",
        href: "/seo",
        iconName: "TrendingUp",
        description: "AI-powered and scraping-based SEO tool suite",
        color: "green",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Meta Title & Description",
        href: "/seo/metadata",
        iconName: "FileText",
        description:
          "Live Google SERP preview with pixel-width meta calculator",
        color: "green",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Google Search Console",
        href: "/google-settings",
        iconName: "Search",
        description: "Authorize Google Search Console scopes for your account",
        color: "green",
        profileMenu: true,
        dashboard: true,
      },
    ],
  },
  {
    label: "Games",
    href: "/free/games/matrx-jump",
    iconName: "Gamepad2",
    section: "primary",
    profileMenu: false,
    dashboard: false,
    description: "Free browser games built on the platform",
    color: "purple",
    children: [
      {
        label: "Matrx Jump",
        href: "/free/games/matrx-jump",
        iconName: "Gamepad2",
        description: "Jump-and-run arcade game with character maker",
        color: "purple",
        profileMenu: true,
        dashboard: true,
      },
      {
        label: "Tic Tac Toe",
        href: "/free/games/tic-tac-toe",
        iconName: "Gamepad2",
        description: "Classic tic-tac-toe in the browser",
        color: "purple",
        profileMenu: true,
        dashboard: true,
      },
    ],
  },
  {
    // Hidden from guests — DMs and team threads have no meaningful guest
    // experience. Direct-URL access still renders the marketing landing
    // via the page-level server-side auth branch.
    label: "Messages",
    href: "/messages",
    iconName: "Mail",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Direct messages and conversations",
    color: "pink",
    guestHidden: true,
  },
  {
    label: "Workflows",
    href: WORKFLOWS_APP_URL,
    external: true,
    iconName: "Workflow",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Design and automate complex workflows",
    color: "purple",
  },
];

// Admin navigation — optional `adminSurfaces` per row (section === "admin" only):
//   ["sidebar"]      → desktop secondary panel only
//   ["headerMenu"]   → profile dropdown Admin block only
//   both or omitted  → both (default)
export const adminNavItems: ShellNavItem[] = [
  {
    label: "Admin Dashboard",
    href: "/administration",
    iconName: "ShieldCheck",
    section: "admin",
    category: "primary",
    color: "red",
  },
  {
    label: "Official Components",
    href: "/administration/official-components",
    iconName: "Puzzle",
    section: "admin",
    category: "primary",
    color: "violet",
  },
  {
    label: "Reports",
    href: "/administration/reports",
    iconName: "FileChartColumn",
    section: "admin",
    category: "primary",
    color: "amber",
  },
  {
    label: "Admins & Levels",
    href: "/administration/admins",
    iconName: "Shield",
    section: "admin",
    category: "primary",
    color: "red",
  },
  {
    label: "App Builder Hub",
    href: "/apps/builder/hub",
    iconName: "FolderOpen",
    section: "admin",
    category: "Applets",
    color: "indigo",
  },
  {
    label: "Sandbox Admin",
    href: "/administration/sandbox",
    iconName: "Container",
    section: "admin",
    category: "Automation",
    color: "orange",
  },
];

export const dockItems = primaryNavItems
  .filter((item) => item.dockOrder != null)
  .sort((a, b) => (a.dockOrder ?? 0) - (b.dockOrder ?? 0));

export interface ShellNavChildSection {
  label?: string;
  items: ShellNavChild[];
}

/** Preserve child order; consecutive items sharing a `group` render under one label. */
export function groupNavChildren(
  children: ShellNavChild[],
): ShellNavChildSection[] {
  const sections: ShellNavChildSection[] = [];
  for (const child of children) {
    const label = child.group;
    const last = sections[sections.length - 1];
    if (last && last.label === label) {
      last.items.push(child);
    } else {
      sections.push({ label, items: [child] });
    }
  }
  return sections;
}

/**
 * Is this child an **action** (a create/add affordance) rather than a
 * navigation destination? True when it carries an overlay `action` handler or
 * is explicitly flagged with `actionItem`. Single source of truth for the
 * distinction — every surface partitions the same way.
 */
export function isNavActionChild(child: ShellNavChild): boolean {
  return child.actionItem === true || child.action != null;
}

export interface PartitionedNavChildren {
  /** Navigation destinations, grouped into labelled sections (top of the menu). */
  sections: ShellNavChildSection[];
  /** Create/add affordances, in source order (bottom of the menu, below a divider). */
  actions: ShellNavChild[];
}

/**
 * The house standard for rendering a nav group's children: navigation
 * destinations first (grouped), then every action (create/add) collected
 * together at the BOTTOM — independent of their order in the source array.
 *
 * Every menu surface (desktop flyout, mobile sheet) funnels through this so the
 * layout is identical everywhere: destinations up top, a divider, then the
 * "add" actions. Authors never have to hand-order actions to the end; flagging
 * a child (via `action` or `actionItem`) is enough.
 */
export function partitionNavChildren(
  children: ShellNavChild[],
): PartitionedNavChildren {
  const navChildren = children.filter((c) => !isNavActionChild(c));
  const actions = children.filter(isNavActionChild);
  return { sections: groupNavChildren(navChildren), actions };
}

/**
 * Filter + rewrite nav items for the current viewer. Authenticated
 * visitors get the full list with workspace hrefs; guests get the list
 * minus `guestHidden` items, with `guestHref` swapped in where defined.
 *
 * Single source of truth for the rule — Sidebar, MobileSideSheet, and
 * MobileDockItems all funnel through this so the three surfaces stay
 * consistent.
 */
export function navItemsForViewer<T extends ShellNavItem | ShellNavChild>(
  items: T[],
  isAuthenticated: boolean,
): T[] {
  if (isAuthenticated) return items;
  return items
    .filter((item) =>
      "guestHidden" in item ? !(item as ShellNavItem).guestHidden : true,
    )
    .map((item) => {
      const guestHref =
        "guestHref" in item ? (item as ShellNavItem).guestHref : undefined;
      return guestHref ? { ...item, href: guestHref } : item;
    });
}

export const settingsItem: ShellNavItem = {
  label: "Settings",
  href: "/settings",
  iconName: "Settings",
  section: "primary",
  profileMenu: true,
  dashboard: false,
  description: "Manage your account and preferences",
  color: "slate",
};

export const iconColorMap: Record<string, string> = {
  sky: "bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400",
  indigo:
    "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400",
  amber:
    "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400",
  emerald:
    "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400",
  violet:
    "bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400",
  blue: "bg-blue-500/15 text-blue-600 dark:bg-blue-400/15 dark:text-blue-400",
  teal: "bg-teal-500/15 text-teal-600 dark:bg-teal-400/15 dark:text-teal-400",
  purple:
    "bg-purple-500/15 text-purple-600 dark:bg-purple-400/15 dark:text-purple-400",
  rose: "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-400",
  orange:
    "bg-orange-500/15 text-orange-600 dark:bg-orange-400/15 dark:text-orange-400",
  green:
    "bg-green-500/15 text-green-600 dark:bg-green-400/15 dark:text-green-400",
  pink: "bg-pink-500/15 text-pink-600 dark:bg-pink-400/15 dark:text-pink-400",
  red: "bg-red-500/15 text-red-600 dark:bg-red-400/15 dark:text-red-400",
  slate:
    "bg-slate-500/15 text-slate-600 dark:bg-slate-400/15 dark:text-slate-400",
};
