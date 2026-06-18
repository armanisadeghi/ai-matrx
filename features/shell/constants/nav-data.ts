// nav-data.ts — Pure data, no React/JSX imports
// Single source of truth for primary + admin shell navigation (all layouts).

/**
 * Where an **admin** row is listed (primary nav ignores this).
 * - `sidebar` — desktop secondary admin strip (when the admin indicator is visible)
 * - `headerMenu` — profile / header dropdown → Admin section
 * Omit on a row → both surfaces (default). Keeps one definition without deleting routes.
 */
export type AdminNavSurface = "sidebar" | "headerMenu";

export const DEFAULT_ADMIN_SURFACES: AdminNavSurface[] = [
  "sidebar",
  "headerMenu",
];

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
    // Group parent — sidebar-only organizational node. Real destinations
    // (My Orgs, Scopes, Context) live on the children so they still appear
    // as dashboard tiles / profile entries via the flatten step.
    label: "My Orgs",
    href: "/organizations",
    iconName: "Building2",
    section: "primary",
    dockOrder: 3,
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
    // Group parent — Notes & Documents.
    label: "Notes",
    href: "/notes",
    iconName: "NotebookPen",
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
    ],
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
      { label: "New Agent", href: "/agents/new", iconName: "Plus" },
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
    // Group parent — Projects, Tasks, and the War Room.
    label: "Projects",
    href: "/projects",
    iconName: "FolderKanban",
    section: "primary",
    dockOrder: 5,
    profileMenu: false,
    dashboard: false,
    description: "Projects, tasks, and the War Room",
    color: "violet",
    children: [
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
    dockOrder: 7,
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
      { label: "New Transcript", href: "/transcripts/new", iconName: "Plus" },
      {
        label: "Processor",
        href: "/transcripts/processor",
        iconName: "FileText",
      },
      { label: "Studio", href: "/transcripts/studio", iconName: "Columns2" },
      { label: "Scribe", href: "/transcripts/scribe", iconName: "Mic" },
      { label: "Cleanup", href: "/transcripts/cleanup", iconName: "Eraser" },
    ],
  },
  {
    // Group parent — Tables, Workbooks, and Pick Lists.
    label: "Data",
    href: "/data",
    iconName: "Boxes",
    section: "primary",
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
    href: "/workflows",
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
