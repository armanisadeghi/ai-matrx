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
}

// Primary navigation items — canonical app URLs shared by (a), (ssr), and (authenticated).
export const primaryNavItems: ShellNavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    iconName: "LayoutDashboard",
    section: "primary",
    dockOrder: 1,
    profileMenu: true,
    dashboard: true,
    description: "Your central hub for all activities and insights",
    color: "sky",
  },
  {
    label: "Agents",
    href: "/agents",
    iconName: "Webhook",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "AI Agent Harness Management",
    color: "blue",
    children: [
      { label: "All Agents", href: "/agents", iconName: "List", exact: true },
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
    label: "Prompt Apps",
    href: "/prompt-apps",
    iconName: "LayoutGrid",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Browse and run interactive apps built from prompts",
    color: "emerald",
  },
  {
    label: "Research",
    href: "/research",
    iconName: "FlaskConical",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Deep research with Automated topic analysis",
    color: "purple",
  },
  {
    label: "Chat",
    href: "/chat",
    iconName: "MessageCircle",
    section: "primary",
    dockOrder: 2,
    profileMenu: true,
    dashboard: false,
    description: "Interact with our reimagined chat interface",
    color: "indigo",
  },
  {
    label: "Notes",
    href: "/notes",
    iconName: "NotebookPen",
    section: "primary",
    dockOrder: 3,
    profileMenu: true,
    dashboard: true,
    description: "Create and manage your notes and documents",
    color: "amber",
  },
  {
    label: "Tasks",
    href: "/tasks",
    iconName: "ListTodo",
    section: "primary",
    dockOrder: 4,
    profileMenu: true,
    dashboard: true,
    description: "Organize and track your tasks and projects",
    color: "emerald",
  },
  {
    label: "Projects",
    href: "/projects",
    iconName: "Puzzle",
    section: "primary",
    dockOrder: 5,
    profileMenu: true,
    dashboard: true,
    description: "Create and manage projects, collaborate with teams",
    color: "violet",
  },
  {
    label: "Files",
    href: "/files",
    iconName: "FolderOpen",
    section: "primary",
    dockOrder: 6,
    profileMenu: true,
    dashboard: true,
    description: "Browse and manage your files and documents",
    color: "blue",
  },
  {
    label: "Images",
    href: "/images",
    iconName: "Aperture",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description:
      "Browse, generate, edit, annotate, convert — every image tool in one place",
    color: "pink",
  },
  {
    label: "Transcripts",
    href: "/transcription/processor",
    iconName: "Mic",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Record, transcribe and manage audio content",
    color: "rose",
  },
  {
    label: "Tables",
    href: "/data",
    iconName: "Table",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Manage your custom data or create tables in a Chat",
    color: "cyan",
  },
  {
    label: "Webscraper",
    href: "/scraper",
    iconName: "Globe",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Extract and process data from web sources",
    color: "orange",
  },
  {
    label: "Sandboxes",
    href: "/sandbox",
    iconName: "Container",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Your AI Agents in a cloud computer with your stuff!",
    color: "orange",
  },
  {
    label: "Code",
    href: "/code",
    iconName: "Code2",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "VSCode-style workspace for sandbox and cloud projects",
    color: "indigo",
  },
  {
    label: "Messages",
    href: "/messages",
    iconName: "Mail",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Direct messages and conversations",
    color: "pink",
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
  {
    label: "Context",
    href: "/agent-context",
    iconName: "BookOpen",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description: "Manage context items, templates, and knowledge",
    color: "cyan",
  },
  {
    label: "Knowledge",
    href: "/rag/data-stores",
    iconName: "Database",
    section: "primary",
    profileMenu: true,
    dashboard: true,
    description:
      "Documents, data stores, and RAG search across your indexed content",
    color: "amber",
    children: [
      {
        label: "Data Stores",
        href: "/rag/data-stores",
        iconName: "Database",
      },
      {
        label: "Search",
        href: "/rag/search",
        iconName: "Search",
      },
      {
        label: "Library",
        href: "/rag/library",
        iconName: "FileText",
      },
      {
        label: "Repositories",
        href: "/rag/repositories",
        iconName: "Code2",
      },
    ],
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
    iconName: "Sparkles",
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
