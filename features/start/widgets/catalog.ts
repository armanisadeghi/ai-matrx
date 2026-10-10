// features/start/widgets/catalog.ts — WHAT EACH START WIDGET IS, without its body.
//
// The catalog is pure (no React bodies) so the Start page agent (Slice 2) and the history list read the
// same `describe` lines the page does. `registry.tsx` attaches each body. Adding a widget = one entry here
// + one body in the registry; the guard test fails when an entry lacks a section, sizes or describe.
import {
  CalendarDays,
  Clock,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Star,
  Table2,
} from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { METRIC_CARDS } from "@/features/dashboard/constants/metricCards";
import type { StartWidgetSpec } from "./types";

/**
 * Where a count's tile opens on the Start page. A count is read as "show me those": the conversation
 * count opens the conversation list, not a new chat (the dashboard's own card still starts one).
 */
const START_METRIC_HREF: Partial<Record<string, string>> = { conversations: "/work/conversations" };
export function startMetricHref(card: { key: string; href: string }): string {
  return START_METRIC_HREF[card.key] ?? card.href;
}

/** The kinds the `recent` widget offers (tokens of the search projection, `platform.search_items`). */
export const RECENT_KINDS = [
  { value: "conversation", label: "Conversations", one: "conversation" },
  { value: "note", label: "Notes", one: "note" },
  { value: "file", label: "Files", one: "file" },
  { value: "task", label: "Tasks", one: "task" },
  { value: "project", label: "Projects", one: "project" },
  { value: "document", label: "Documents", one: "document" },
] as const;

const recentLabel = (token: string | undefined) =>
  RECENT_KINDS.find((k) => k.value === token)?.label ?? (token ? token : "items");

const metricLabel = (key: string | undefined) =>
  METRIC_CARDS.find((c) => c.key === key)?.label ?? (key ? key : "Metric");

export const START_WIDGET_CATALOG: readonly StartWidgetSpec[] = [
  {
    key: "kpis",
    label: "Counts",
    icon: Gauge,
    section: "data",
    sizes: ["l"],
    defaultConfig: { keys: "agents,conversations,knowledge_files,published_apps,notes,tasks" },
    fields: [{ key: "keys", label: "Counts", picker: "metricKeys" }],
    describe: (c) => {
      const n = (c.keys || "").split(",").filter((k) => METRIC_CARDS.some((m) => m.key === k.trim())).length;
      return n ? `Your counts (${n})` : "Your counts";
    },
  },
  {
    key: "metric",
    label: "Count",
    icon: Gauge,
    section: "data",
    sizes: ["s", "m"],
    defaultConfig: { metric: "agents" },
    fields: [{ key: "metric", label: "Count", options: METRIC_CARDS.map((c) => ({ value: c.key, label: c.label })) }],
    describe: (c) => `${metricLabel(c.metric)} count`,
  },
  {
    key: "recent",
    label: "Recent",
    icon: Clock,
    section: "work",
    sizes: ["s", "m", "l"],
    defaultConfig: { kind: "conversation" },
    fields: [{ key: "kind", label: "Kind", options: RECENT_KINDS.map((k) => ({ value: k.value, label: k.label })) }],
    describe: (c) => `Recent ${recentLabel(c.kind).toLowerCase()}`,
  },
  {
    key: "tasks",
    label: "Tasks",
    icon: ListChecks,
    section: "work",
    sizes: ["s", "m", "l"],
    defaultConfig: {},
    fields: [],
    describe: () => "Open and overdue tasks",
  },
  {
    key: "agenda",
    label: "Today",
    icon: CalendarDays,
    section: "meetings",
    sizes: ["s", "m", "l"],
    defaultConfig: {},
    fields: [],
    describe: () => "Today's meetings",
  },
  {
    key: "favorites",
    label: "Favorites",
    icon: Star,
    section: "work",
    sizes: ["s", "m", "l"],
    defaultConfig: {},
    fields: [],
    describe: () => "Pinned pages",
  },
  {
    key: "agents",
    label: "Agents",
    icon: AGENT_ICON,
    section: "ai",
    sizes: ["s", "m", "l"],
    defaultConfig: {},
    fields: [],
    describe: () => "Pinned agents",
  },
  {
    key: "page",
    label: "Data page",
    icon: LayoutDashboard,
    section: "data",
    sizes: ["m", "l"],
    defaultConfig: {},
    fields: [{ key: "pageId", label: "Page", picker: "dataPage" }],
    describe: (c) => (c.pageId ? "One of your data pages" : "Data page (none chosen)"),
  },
  {
    key: "table",
    label: "Table",
    icon: Table2,
    section: "data",
    sizes: ["s", "m", "l"],
    defaultConfig: {},
    fields: [{ key: "tableId", label: "Table", picker: "dataTable" }],
    describe: (c) => (c.tableId ? "First rows of one of your tables" : "Table (none chosen)"),
  },
];

export function getStartWidgetSpec(key: string): StartWidgetSpec | undefined {
  return START_WIDGET_CATALOG.find((w) => w.key === key);
}

/** One line for any widget, known or not (the history list and the agent read this). */
export function describeStartWidget(widget: { type: string; config: Record<string, string> }): string {
  const spec = getStartWidgetSpec(widget.type);
  return spec ? spec.describe(widget.config) : `Unavailable widget "${widget.type}"`;
}
