/**
 * source-registry — single source of truth for conversation `source_app` /
 * `source_feature` metadata, grouping, and per-surface default filters.
 *
 * Conversations in `cx_conversation` carry two provenance columns:
 *  - `source_app`     — which product wrote the row (`matrx-admin`,
 *                       `matrx-scheduler`, `chat`, …).
 *  - `source_feature` — which feature/surface created it (`chat-route`,
 *                       `agent-runner`, `transcription-cleanup`, …).
 *
 * Most surfaces only want to see their OWN conversations — e.g. the /chat
 * sidebar should show real chats, not the firehose of transcription-cleanup
 * runs, sub-agent spawns, and server automations. We model that as an
 * ALLOW-LIST per surface (include these features/apps), NOT a deny-list:
 * anything not explicitly included is hidden until the user opts in via the
 * filter tree.
 *
 * This registry is intentionally TOLERANT of unknown values — the DB will
 * grow new `source_app` / `source_feature` strings over time, and the tree
 * + labels must degrade gracefully (humanized slug + fallback icon) without
 * a code change. Known values just get nicer labels, icons, and grouping.
 */

import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  CalendarClock,
  Code2,
  FileText,
  Globe,
  Hammer,
  Image,
  MessageSquare,
  Mic,
  PencilRuler,
  Play,
  Server,
  StickyNote,
  Tag,
  Webhook,
} from "lucide-react";

/**
 * Sentinel key representing conversations whose `source_app` / `source_feature`
 * is empty string or null. Rendered as a single "Generic / system" tree node.
 */
export const EMPTY_SOURCE_KEY = "__empty__";

/** Normalizes a raw column value to a registry key (empty/null → sentinel). */
export function sourceKey(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") {
    return EMPTY_SOURCE_KEY;
  }
  return value;
}

export interface SourceMeta {
  label: string;
  icon: LucideIcon;
  /**
   * Marks a non-interactive / automation source (system runs, sub-agents,
   * scheduled jobs, empty rows). Informational — used by the tree to mute /
   * group these. Default visibility is still driven by SURFACE_DEFAULTS.
   */
  system?: boolean;
}

// ── Apps ──────────────────────────────────────────────────────────────────

export const APP_META: Record<string, SourceMeta> = {
  "matrx-admin": { label: "Matrx Admin", icon: Webhook },
  "matrx-scheduler": { label: "Scheduler", icon: CalendarClock, system: true },
  // `chat` is what the voice-agent persistence layer stamps (see
  // features/voice-agent/constants.ts → PERSISTENCE_SOURCE_APP).
  chat: { label: "Chat", icon: MessageSquare },
  [EMPTY_SOURCE_KEY]: { label: "Generic", icon: Boxes, system: true },
};

// ── Features ────────────────────────────────────────────────────────────────

export const FEATURE_META: Record<string, SourceMeta> = {
  // Real, user-authored chat surfaces
  "chat-route": { label: "Chat", icon: MessageSquare },
  "chat-interface": { label: "Chat (legacy)", icon: MessageSquare },
  "quick-chat": { label: "Quick Chat", icon: MessageSquare },

  // Agents
  "agent-runner": { label: "Agent Runner", icon: Play },
  "agent-builder": { label: "Agent Builder", icon: Hammer },
  "agent-generator": { label: "Agent Generator", icon: PencilRuler },
  "agent-tester": { label: "Agent Tester", icon: Hammer },
  "agent-run-window": { label: "Chat (window)", icon: Play },
  "agent-run-history-window": { label: "Agent History (window)", icon: Play },
  "agent-runs-sidebar": { label: "Agent Runs (sidebar)", icon: Play },
  "agent-advanced-editor-window": { label: "Agent Editor", icon: Hammer },
  "agent-content-window": { label: "Agent Content", icon: Hammer },
  "agent-app": { label: "Agent App", icon: Webhook },
  "prompt-app": { label: "Prompt App", icon: Webhook },
  "agent-comparison": { label: "Agent Comparison", icon: Webhook },

  // Code
  "code-editor": { label: "Code", icon: Code2 },

  // Transcription family
  "transcription-cleanup": {
    label: "Transcription Cleanup",
    icon: FileText,
    system: true,
  },
  "transcript-studio": { label: "Transcript Studio", icon: FileText },
  transcripts: { label: "Transcripts", icon: FileText },

  // Other interactive surfaces
  notes: { label: "Notes", icon: StickyNote },
  research: { label: "Research", icon: Globe },
  dictionary: { label: "Dictionary", icon: Tag },
  "image-studio": { label: "Image Studio", icon: Image },
  "voice-agent": { label: "Voice Agent", icon: Mic },
  "mermaid-workbench": { label: "Diagram Workbench", icon: PencilRuler },

  // Automations / system runs
  "server-run": { label: "Server Run", icon: Server, system: true },
  programmatic: { label: "Programmatic", icon: Server, system: true },
  demo: { label: "Demo", icon: Boxes, system: true },

  [EMPTY_SOURCE_KEY]: {
    label: "Generic / system",
    icon: Boxes,
    system: true,
  },
};

// ── Feature groups ────────────────────────────────────────────────────────

/**
 * Optional grouping layer rendered as a tree parent UNDER an app. Features
 * not in any group render directly under their app. Groups let related
 * features (the transcription family, the agent family) collapse to a single
 * checkbox while staying individually selectable.
 */
export interface FeatureGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Feature keys that belong to this group. */
  features: string[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "transcription",
    label: "Transcription",
    icon: FileText,
    features: ["transcription-cleanup", "transcript-studio", "transcripts"],
  },
  {
    id: "agents",
    label: "Agents",
    icon: Webhook,
    features: [
      "agent-runner",
      "agent-builder",
      "agent-generator",
      "agent-tester",
      "agent-run-window",
      "agent-run-history-window",
      "agent-runs-sidebar",
      "agent-advanced-editor-window",
      "agent-content-window",
      "agent-app",
      "prompt-app",
      "agent-comparison",
    ],
  },
];

/** Reverse lookup: feature key → group id (or undefined if ungrouped). */
const FEATURE_TO_GROUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of FEATURE_GROUPS) {
    for (const feature of group.features) map[feature] = group.id;
  }
  return map;
})();

export function groupIdForFeature(feature: string): string | undefined {
  return FEATURE_TO_GROUP[feature];
}

// ── Per-surface default filters ──────────────────────────────────────────────

export interface SurfaceSourceDefault {
  /** `source_feature` values shown by default. */
  includeFeatures: string[];
  /** `source_app` values shown by default (whole-app selections). */
  includeApps?: string[];
  /** Whether empty/null-source conversations are shown by default. */
  includeEmptySource?: boolean;
}

/**
 * Default filter per filterable surface id. An EMPTY default (no entry, or
 * all-empty arrays) means "no source filter" → show everything (used by the
 * cross-agent browse window). A surface with `includeFeatures` shows only
 * conversations whose `source_feature` is in that list (plus any whole-app /
 * empty selections).
 */
export const SURFACE_DEFAULTS: Record<string, SurfaceSourceDefault> = {
  // The main /chat sidebar + search: only real chats. Everything else
  // (transcription, server runs, sub-agents, generic) is reachable through
  // the filter tree but hidden by default.
  chat: { includeFeatures: ["chat-route", "chat-interface", "quick-chat"] },
  // The /code workspace: code conversations + the agent runs it spawns.
  code: { includeFeatures: ["code-editor", "agent-runner"] },
  // The cross-agent "AI Results" window is the browse-everything surface —
  // no default filter.
  "history-window": { includeFeatures: [] },
};

// ── Resolved filter shape (what the slice/thunk consume) ─────────────────────

export interface ResolvedSourceFilter {
  includeSourceApps: string[];
  includeSourceFeatures: string[];
  includeEmptySource: boolean;
}

/** A user's stored override for one surface (mirrors the preferences shape). */
export interface SurfaceFilterPref {
  includeFeatures: string[];
  includeApps: string[];
  includeEmptySource: boolean;
}

/** The registry default for a surface, materialized as a SurfaceFilterPref. */
export function getSurfaceDefault(surfaceId: string): SurfaceFilterPref {
  const def = SURFACE_DEFAULTS[surfaceId];
  return {
    includeFeatures: def?.includeFeatures ? [...def.includeFeatures] : [],
    includeApps: def?.includeApps ? [...def.includeApps] : [],
    includeEmptySource: def?.includeEmptySource ?? false,
  };
}

/**
 * Resolves the active source filter for a surface. A user override (from
 * preferences) wins outright; otherwise the registry default applies. Returns
 * the `include*` shape the conversation-history thunk consumes directly.
 */
export function resolveSurfaceFilter(
  surfaceId: string,
  pref?: SurfaceFilterPref | null,
): ResolvedSourceFilter {
  const source = pref ?? getSurfaceDefault(surfaceId);
  return {
    includeSourceApps: source.includeApps ?? [],
    includeSourceFeatures: source.includeFeatures ?? [],
    includeEmptySource: source.includeEmptySource ?? false,
  };
}

// ── Label / icon helpers (graceful fallback) ─────────────────────────────────

/** "transcription-cleanup" → "Transcription Cleanup". */
export function humanizeSourceKey(value: string): string {
  if (value === EMPTY_SOURCE_KEY) return "Generic / system";
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function appMeta(app: string): SourceMeta {
  return APP_META[app] ?? { label: humanizeSourceKey(app), icon: Tag };
}

export function featureMeta(feature: string): SourceMeta {
  return (
    FEATURE_META[feature] ?? { label: humanizeSourceKey(feature), icon: Tag }
  );
}

export function appLabel(app: string): string {
  return appMeta(app).label;
}

export function featureLabel(feature: string): string {
  return featureMeta(feature).label;
}

// ── Surfaces exposed in Settings ─────────────────────────────────────────────

export interface FilterableSurfaceMeta {
  id: string;
  label: string;
  description: string;
}

/** Surfaces whose default source filter the user can edit in Settings. */
export const FILTERABLE_SURFACES: FilterableSurfaceMeta[] = [
  {
    id: "chat",
    label: "Chat",
    description:
      "The /chat history sidebar and search. Defaults to your real chats only.",
  },
  {
    id: "code",
    label: "Code workspace",
    description: "The /code conversation history.",
  },
  {
    id: "history-window",
    label: "AI Results window",
    description:
      "The floating cross-agent history browser. Defaults to everything.",
  },
];
