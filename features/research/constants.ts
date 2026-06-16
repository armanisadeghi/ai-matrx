import type {
  AutonomyLevel,
  ScrapeStatus,
  SourceType,
  SourceOrigin,
  ResearchStreamStep,
} from "./types";

// ============================================================================
// STATUS COLORS
// ============================================================================

export const SCRAPE_STATUS_CONFIG: Record<
  ScrapeStatus,
  { label: string; color: string; bgClass: string; textClass: string }
> = {
  pending: {
    label: "Pending",
    color: "#a1a1aa",
    bgClass: "bg-zinc-200 dark:bg-zinc-700",
    textClass: "text-zinc-700 dark:text-zinc-300",
  },
  success: {
    label: "Success",
    color: "#22c55e",
    bgClass: "bg-green-100 dark:bg-green-900/30",
    textClass: "text-green-700 dark:text-green-400",
  },
  thin: {
    label: "Thin",
    color: "#eab308",
    bgClass: "bg-yellow-100 dark:bg-yellow-900/30",
    textClass: "text-yellow-700 dark:text-yellow-400",
  },
  failed: {
    label: "Failed",
    color: "#ef4444",
    bgClass: "bg-red-100 dark:bg-red-900/30",
    textClass: "text-red-700 dark:text-red-400",
  },
  complete: {
    label: "Complete",
    color: "#3b82f6",
    bgClass: "bg-blue-100 dark:bg-blue-900/30",
    textClass: "text-blue-700 dark:text-blue-400",
  },
  manual: {
    label: "Manual",
    color: "#a855f7",
    bgClass: "bg-purple-100 dark:bg-purple-900/30",
    textClass: "text-purple-700 dark:text-purple-400",
  },
  skipped: {
    label: "Skipped",
    color: "#6b7280",
    bgClass: "bg-gray-100 dark:bg-gray-800",
    textClass: "text-gray-600 dark:text-gray-400",
  },
  dead_link: {
    label: "Dead link",
    color: "#71717a",
    bgClass: "bg-zinc-100 dark:bg-zinc-800/60",
    textClass: "text-zinc-600 dark:text-zinc-400",
  },
  gated: {
    label: "Gated",
    color: "#f97316",
    bgClass: "bg-orange-100 dark:bg-orange-900/30",
    textClass: "text-orange-700 dark:text-orange-400",
  },
};

export const SOURCE_TYPE_CONFIG: Record<
  SourceType,
  { label: string; icon: string }
> = {
  web: { label: "Web", icon: "Globe" },
  youtube: { label: "YouTube", icon: "Play" },
  pdf: { label: "PDF", icon: "FileText" },
  file: { label: "File", icon: "File" },
  manual: { label: "Manual", icon: "Pencil" },
};

export const ORIGIN_CONFIG: Record<
  SourceOrigin,
  { label: string; color: string }
> = {
  search: {
    label: "Search",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  manual: {
    label: "Manual",
    color:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  link_extraction: {
    label: "Link",
    color:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  file_upload: {
    label: "Upload",
    color:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
};

export const AUTONOMY_CONFIG: Record<
  AutonomyLevel,
  { label: string; description: string; icon: string }
> = {
  auto: {
    label: "Automatic",
    description:
      "Full pipeline runs immediately — search, scrape, analyze, and generate a report. Review when ready.",
    icon: "Zap",
  },
  semi: {
    label: "Semi-Auto",
    description:
      "Search and scrape automatically, then pause for your review before analysis and report generation.",
    icon: "SlidersHorizontal",
  },
  manual: {
    label: "Manual",
    description:
      "Full control at every step. Nothing runs until you trigger it.",
    icon: "Hand",
  },
};

export const PIPELINE_STEPS: {
  key: ResearchStreamStep;
  label: string;
  icon: string;
}[] = [
  { key: "searching", label: "Searching", icon: "Search" },
  { key: "scraping", label: "Scraping", icon: "Download" },
  { key: "analyzing", label: "Analyzing", icon: "Brain" },
  { key: "synthesizing", label: "Synthesizing", icon: "Layers" },
  { key: "reporting", label: "Report", icon: "FileText" },
];

// ============================================================================
// NAV ITEMS
// ============================================================================

export interface ResearchNavItem {
  key: string;
  label: string;
  icon: string;
  href: (topicId: string) => string;
  /** 'primary' = pipeline steps shown prominently; 'secondary' = utility tabs below the divider */
  group: "primary" | "secondary";
  mobileVisible: boolean;
  comingSoon?: boolean;
}

export const RESEARCH_NAV_ITEMS: ResearchNavItem[] = [
  // ── Primary pipeline steps ──────────────────────────────────────────────
  {
    key: "topic",
    label: "Topic",
    icon: "LayoutDashboard",
    href: (id) => `/research/topics/${id}`,
    group: "primary",
    mobileVisible: true,
  },
  {
    key: "keywords",
    label: "Keywords",
    icon: "Search",
    href: (id) => `/research/topics/${id}/keywords`,
    group: "primary",
    mobileVisible: true,
  },
  {
    key: "sources",
    label: "Sources",
    icon: "Globe",
    href: (id) => `/research/topics/${id}/sources`,
    group: "primary",
    mobileVisible: true,
  },
  {
    key: "content",
    label: "Content",
    icon: "BookOpen",
    href: (id) => `/research/topics/${id}/content`,
    group: "primary",
    mobileVisible: true,
  },
  {
    key: "curate",
    label: "Curate",
    icon: "ListChecks",
    href: (id) => `/research/topics/${id}/curate`,
    group: "primary",
    mobileVisible: true,
  },
  {
    key: "analysis",
    label: "Analysis",
    icon: "Brain",
    href: (id) => `/research/topics/${id}/analysis`,
    group: "primary",
    mobileVisible: true,
  },
  {
    key: "synthesis",
    label: "Synthesis",
    icon: "FlaskConical",
    href: (id) => `/research/topics/${id}/synthesis`,
    group: "primary",
    mobileVisible: true,
  },
  {
    key: "document",
    label: "Document",
    icon: "FileText",
    href: (id) => `/research/topics/${id}/document`,
    group: "primary",
    mobileVisible: false,
  },
  // ── Secondary utility tabs ───────────────────────────────────────────────
  {
    key: "tasks",
    label: "Tasks",
    icon: "ListChecks",
    href: (id) => `/research/topics/${id}/tasks`,
    group: "secondary",
    mobileVisible: false,
  },
  {
    key: "tags",
    label: "Tags",
    icon: "Tags",
    href: (id) => `/research/topics/${id}/tags`,
    group: "secondary",
    mobileVisible: false,
  },
  {
    key: "media",
    label: "Media",
    icon: "Image",
    href: (id) => `/research/topics/${id}/media`,
    group: "secondary",
    mobileVisible: false,
  },
  {
    key: "costs",
    label: "Costs",
    icon: "DollarSign",
    href: (id) => `/research/topics/${id}/costs`,
    group: "secondary",
    mobileVisible: false,
  },
  {
    key: "agents",
    label: "Agents",
    icon: "Cpu",
    href: (id) => `/research/topics/${id}/agents`,
    group: "secondary",
    mobileVisible: false,
  },
  {
    key: "settings",
    label: "Settings",
    icon: "Settings2",
    href: (id) => `/research/topics/${id}/settings`,
    group: "secondary",
    mobileVisible: false,
  },
];

// ============================================================================
// ITERATION MODE DESCRIPTIONS
// ============================================================================

export const ITERATION_MODE_INFO = {
  rebuild: {
    label: "Rebuild",
    description:
      "Fresh synthesis using current included sources. Reuses existing per-page analyses. Best when you've made significant changes to which sources are included.",
    icon: "RefreshCw",
  },
  update: {
    label: "Update",
    description:
      "Agent updates the existing report with new and changed information. Best for adding a few new sources or keywords without starting over.",
    icon: "Pencil",
  },
} as const;
