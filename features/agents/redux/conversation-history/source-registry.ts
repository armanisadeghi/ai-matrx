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
  Bot,
  Boxes,
  CalendarClock,
  Camera,
  Code2,
  FileText,
  Globe,
  GraduationCap,
  Hammer,
  Image,
  MessageSquare,
  Mic,
  PanelTop,
  PencilRuler,
  Play,
  Puzzle,
  ScanLine,
  Server,
  StickyNote,
  Tag,
  Video,
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
  // Rows the Python brain writes directly (podcast pipeline, canon bench,
  // page extraction, RAG expansion, …) — all programmatic, never user chats.
  aidream: { label: "Aidream Server", icon: Server, system: true },
  // Server-side MCP agent-service executions — programmatic.
  "mcp-agent-service": {
    label: "MCP Agent Service",
    icon: Server,
    system: true,
  },
  // Workflow-engine node/run executions — programmatic.
  workflow: { label: "Workflows", icon: Server, system: true },
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
  "agent-assignment-demo": { label: "Agent Assignment Demo", icon: Webhook },

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

  // Fast Fire background AI runs (grading / tutor / session review). These are
  // automation-like one-shot runs, NOT user chats — system-marked so they group
  // as automations and stay out of the /chat sidebar (not in its allow-list).
  "education-fastfire-grade": {
    label: "Fast Fire Grading",
    icon: GraduationCap,
    system: true,
  },
  "education-fastfire-help": {
    label: "Fast Fire Tutor",
    icon: GraduationCap,
    system: true,
  },
  "education-fastfire-review": {
    label: "Fast Fire Review",
    icon: GraduationCap,
    system: true,
  },
  "education-fastfire-tts": {
    label: "Fast Fire Speech",
    icon: GraduationCap,
    system: true,
  },

  // Mode-agnostic flashcards AI tutor lanes (Phase 4 parity push) — the SAME
  // fc_help_live / fc_review_batch agents Fast Fire uses, generalized to every
  // study surface (classic set study, adaptive due review, weak-area drill).
  "education-flashcards": {
    label: "Flashcards",
    icon: GraduationCap,
  },
  "education-flashcards-help": {
    label: "Flashcards Tutor",
    icon: GraduationCap,
    system: true,
  },
  "education-flashcards-review": {
    label: "Flashcards Review",
    icon: GraduationCap,
    system: true,
  },
  "education-flashcards-coach": {
    label: "Flashcards Micro-Coach",
    icon: GraduationCap,
    system: true,
  },

  // The persistent, memory-carrying AI Tutor (`/education/tutor`). NOT
  // system-marked — these are real user chats (grounded in the learner's own
  // material, cross-session memory), so they surface + filter like any chat.
  "education-tutor": {
    label: "AI Tutor",
    icon: GraduationCap,
  },

  // Study Intelligence (P5) one-shot generation runs — automation, NOT user
  // chats — system-marked so they group away from real conversations.
  "education-planner": {
    label: "Study Planner",
    icon: CalendarClock,
    system: true,
  },
  "education-analytics": {
    label: "Study Analytics",
    icon: GraduationCap,
    system: true,
  },

  // Assessment Engine (P1) one-shot generation / grading runs — automation.
  "education-assessment": {
    label: "Assessments",
    icon: GraduationCap,
    system: true,
  },
  "education-assessment-grade": {
    label: "Assessment Grading",
    icon: GraduationCap,
    system: true,
  },

  // Study Media (P3) mind-map generator — one-shot automation runs.
  "education-mindmap": {
    label: "Mind Maps",
    icon: GraduationCap,
    system: true,
  },

  // Onboarding ingest → converter (deck / summary / mind-map from a source) —
  // one-shot automation runs.
  "education-ingest": {
    label: "Study Material Ingest",
    icon: GraduationCap,
    system: true,
  },

  // Other interactive surfaces
  notes: { label: "Notes", icon: StickyNote },
  "cms-hub": { label: "CMS", icon: PanelTop },
  "cms-site": { label: "CMS Site", icon: PanelTop },
  "cms-page": { label: "CMS Page Editor", icon: PanelTop },
  "cms-component": { label: "CMS Component Editor", icon: Puzzle },
  "html-page": { label: "HTML Page Editor", icon: PanelTop },
  research: { label: "Research", icon: Globe },
  dictionary: { label: "Dictionary", icon: Tag },
  "image-studio": { label: "Image Studio", icon: Image },
  // PDF Extractor runs (studio shortcuts, the chunker) are one-shot background
  // runs on a document, not user chats — classified as automation.
  "pdf-extractor": { label: "PDF Extractor", icon: FileText, system: true },
  // Media capture — file/conversation provenance for /camera + PDF scanner.
  camera: { label: "Camera", icon: Camera },
  "pdf-scanner": { label: "PDF Scanner", icon: ScanLine },
  "media-capture-demo": {
    label: "Media Capture Demo",
    icon: Camera,
    system: true,
  },
  "video-prompt-options": {
    label: "Video Prompt Options",
    icon: Video,
  },
  "pro-textarea": { label: "ProTextarea", icon: PencilRuler },
  "surface-chrome": { label: "Surface Agents", icon: Bot },
  "tool-call-visualization": {
    label: "Tool UI Generator",
    icon: Hammer,
    system: true,
  },
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
      "agent-assignment-demo",
    ],
  },
  {
    id: "fastfire",
    label: "Fast Fire",
    icon: GraduationCap,
    features: [
      "education-fastfire-grade",
      "education-fastfire-help",
      "education-fastfire-review",
      "education-fastfire-tts",
    ],
  },
  {
    id: "flashcards-tutor",
    label: "Flashcards AI Tutor",
    icon: GraduationCap,
    features: [
      "education-flashcards-help",
      "education-flashcards-review",
      "education-flashcards-coach",
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
  // The /education/tutor surface: only the learner's tutor conversations.
  "education-tutor": { includeFeatures: ["education-tutor"] },
  // The cross-agent "AI Results" window is the browse-everything surface —
  // no default filter.
  "history-window": { includeFeatures: [] },
  // The conversation picker (attach an existing chat to a war-room thread/room,
  // a note, …). Defaults to EVERY conversation OUR app created — all of
  // matrx-admin's surfaces (war-room chats, /chat, notes, code, …), not just
  // the narrow chat-route feature — so a user can attach any of their own
  // chats. The filter tree lets them widen to other apps.
  "conversation-picker": { includeFeatures: [], includeApps: ["matrx-admin"] },
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

/**
 * Whether a conversation source is an automation ("auto") rather than a real
 * user chat surface. True when either the app or the feature is system-marked.
 * This is the ONE auto-vs-user classifier — there is no DB `is_auto` column;
 * provenance (`source_app` / `source_feature`) + this registry is the signal.
 */
export function isAutoSource(
  app: string | null | undefined,
  feature: string | null | undefined,
): boolean {
  return (
    !!appMeta(sourceKey(app)).system || !!featureMeta(sourceKey(feature)).system
  );
}

/**
 * One-line human description of a conversation's provenance, e.g.
 * "Matrx Admin · PDF Extractor · Auto". Used by the row "…" menu header so
 * users can tell WHY a conversation matches (or escapes) their filter.
 */
export function describeSource(
  app: string | null | undefined,
  feature: string | null | undefined,
): string {
  const appKey = sourceKey(app);
  const featureKey = sourceKey(feature);
  const parts: string[] = [];
  if (appKey !== EMPTY_SOURCE_KEY) parts.push(appLabel(appKey));
  parts.push(featureLabel(featureKey));
  if (isAutoSource(app, feature)) parts.push("Auto");
  return parts.join(" · ");
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
    id: "education-tutor",
    label: "AI Tutor",
    description:
      "The /education/tutor conversation history. Defaults to your tutor chats only.",
  },
  {
    id: "history-window",
    label: "AI Results window",
    description:
      "The floating cross-agent history browser. Defaults to everything.",
  },
  {
    id: "conversation-picker",
    label: "Conversation picker",
    description:
      "Attach-an-existing-chat picker (war room, notes, …). Defaults to every chat your app created.",
  },
];
