// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DASHBOARD CONFIG — edit THIS file to change what shows on /dashboard.      ║
// ║                                                                            ║
// ║  This is the single place to curate the two editorial sections:            ║
// ║    • "Start something" (the quick-action launchers)                        ║
// ║    • "Discover" (the rotating strip of app areas)                          ║
// ║                                                                            ║
// ║  Engagement KPIs live in `constants/metricCards.ts` (tied to RPC keys).    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import type { DiscoverItem } from "./constants/discover";

// ─────────────────────────────────────────────────────────────────────────────
// START SOMETHING  —  the fixed "create / launch" row at the top of the page.
//
// To change it: add / remove / reorder entries below. `iconName` is any Lucide
// name registered in `features/shell/shellIconMap.ts`; `color` is any key in
// `iconColorMap` (sky, indigo, blue, amber, emerald, rose, violet, purple, …).
// ─────────────────────────────────────────────────────────────────────────────
export interface QuickAction {
  id: string; // stable id (use the href)
  label: string;
  href: string;
  iconName: string;
  color: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: "/chat/new", label: "New Chat", href: "/chat/new", iconName: "MessageCircle", color: "indigo" },
  { id: "/agents/new", label: "New Agent", href: "/agents/new", iconName: "Webhook", color: "blue" },
  { id: "/files/all", label: "Upload Files", href: "/files/all", iconName: "FolderOpen", color: "amber" },
  { id: "/research/topics/new", label: "New Research", href: "/research/topics/new", iconName: "FlaskConical", color: "purple" },
  { id: "/transcripts/new", label: "New Transcript", href: "/transcripts/new", iconName: "Mic", color: "rose" },
  { id: "/notes", label: "New Note", href: "/notes", iconName: "NotebookPen", color: "amber" },
];

// ─────────────────────────────────────────────────────────────────────────────
// DISCOVER  —  the rotating strip. By default it auto-includes every nav
// destination flagged `dashboard: true` (so new features appear for free).
// You curate it with the three knobs below — no other file to touch.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HIDE a built-in item from Discover (e.g. something buggy you don't want
 * surfaced yet). Add its href — that's it. Example: "/scraper".
 */
export const DISCOVER_HIDDEN_HREFS: string[] = [
  "/dashboard", // the hub itself — never advertise it
];

/**
 * ORDER — front-load the most compelling items. Anything not listed here still
 * appears, just after these, in nav order. Reorder / trim freely.
 */
export const DISCOVER_FEATURED_ORDER: string[] = [
  "/research",
  "/podcast",
  "/war-room",
  "/agents/all",
  "/knowledge",
  "/agent-apps",
  "/transcripts",
  "/scopes",
  "/tools/pdf-extractor",
  "/images",
  "/cms",
  "/artifacts",
  "/code",
  "/schedules",
  "/data",
  "/workbooks",
  "/notes",
  "/documents",
  "/scraper",
  "/markdown-studio",
];

/**
 * ADD a custom card that is NOT a nav destination (e.g. a deep link or external
 * URL you want to spotlight). Appended to the auto-built pool. Leave empty if
 * you don't need any. `color` = iconColorMap key; `iconName` = shellIconMap name.
 */
export const DISCOVER_EXTRA: DiscoverItem[] = [];
