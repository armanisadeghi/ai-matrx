// Metric cards + quick actions config for the dashboard.
//
// METRIC_CARDS map each engagement count (from get_user_dashboard_metrics) to
// its label/icon/color/destination. The four the platform treats as the
// strongest engagement signals are `featured` and shown large; the rest fill a
// secondary strip. `emptyHint` is the nudge shown when the count is zero — the
// "encourage users to do more" goal.

import type { DashboardMetrics } from "../types";

export interface MetricCardConfig {
  key: keyof DashboardMetrics;
  label: string;
  /** ShellIcon (Lucide) name. */
  iconName: string;
  /** iconColorMap key (shared with the nav). */
  color: string;
  /** Where clicking the card goes. */
  href: string;
  /** Featured = one of the four headline engagement signals. */
  featured?: boolean;
  /** Singular noun for the "1 agent" vs "2 agents" line. */
  singular: string;
  /** Nudge shown when the count is zero. */
  emptyHint: string;
}

export const METRIC_CARDS: MetricCardConfig[] = [
  {
    key: "agents",
    label: "Agents",
    singular: "agent",
    iconName: "Webhook",
    color: "blue",
    href: "/agents/all",
    featured: true,
    emptyHint: "Build your first agent",
  },
  {
    key: "conversations",
    label: "Conversations",
    singular: "conversation",
    iconName: "MessageCircle",
    color: "indigo",
    href: "/chat/new",
    featured: true,
    emptyHint: "Start a conversation",
  },
  {
    key: "knowledge_files",
    label: "Knowledge",
    singular: "file",
    iconName: "Database",
    color: "amber",
    href: "/files/all",
    featured: true,
    emptyHint: "Add to your knowledge base",
  },
  {
    key: "published_apps",
    label: "Published Apps",
    singular: "app",
    iconName: "Puzzle",
    color: "emerald",
    href: "/agent-apps",
    featured: true,
    emptyHint: "Publish your first app",
  },
  {
    key: "notes",
    label: "Notes",
    singular: "note",
    iconName: "NotebookPen",
    color: "amber",
    href: "/notes",
    emptyHint: "Capture a note",
  },
  {
    key: "tasks",
    label: "Tasks",
    singular: "task",
    iconName: "ListTodo",
    color: "emerald",
    href: "/tasks",
    emptyHint: "Add a task",
  },
  {
    key: "transcripts",
    label: "Transcripts",
    singular: "transcript",
    iconName: "Mic",
    color: "rose",
    href: "/transcripts",
    emptyHint: "Record a transcript",
  },
  {
    key: "scopes",
    label: "Scopes",
    singular: "scope",
    iconName: "Layers",
    color: "emerald",
    href: "/scopes",
    emptyHint: "Define a scope",
  },
  {
    key: "shortcuts",
    label: "Shortcuts",
    singular: "shortcut",
    iconName: "Zap",
    color: "blue",
    href: "/agents/shortcuts",
    emptyHint: "Create a shortcut",
  },
  {
    key: "research_reports",
    label: "Research",
    singular: "report",
    iconName: "FlaskConical",
    color: "purple",
    href: "/research",
    emptyHint: "Run a research report",
  },
  {
    key: "podcasts",
    label: "Podcasts",
    singular: "podcast",
    iconName: "Radio",
    color: "violet",
    href: "/podcast",
    emptyHint: "Create a podcast",
  },
  {
    key: "messages",
    label: "Messages",
    singular: "message",
    iconName: "Mail",
    color: "pink",
    href: "/messages",
    emptyHint: "Send a message",
  },
];

export const FEATURED_METRICS = METRIC_CARDS.filter((m) => m.featured);
export const SECONDARY_METRICS = METRIC_CARDS.filter((m) => !m.featured);

// "Start something" quick actions live in `../dashboard.config.ts` (the single
// curate-here file). Import `QUICK_ACTIONS` from there directly.
