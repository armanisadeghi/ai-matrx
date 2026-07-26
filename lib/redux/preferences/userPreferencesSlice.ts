// Deep imports (not the `@/lib/sync` barrel) match the pattern used by
// themeSlice.ts — the barrel re-exports `syncPolicies` from `./registry`,
// which imports `userPreferencesPolicy` back from this file. Routing through
// the barrel creates a runtime initialization cycle under Turbopack/Next
// ("Cannot access 'userPreferencesPolicy' before initialization").
import { createSlice, type PayloadAction, type Draft } from "@reduxjs/toolkit";
import { definePolicy } from "@/lib/sync/policies/define";
import {
  REHYDRATE_ACTION_TYPE,
  type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";
// Note: the Supabase client is imported lazily inside `remote.fetch`/`remote.write`
// rather than at module load. This keeps unit tests — which mount the slice
// without the browser Supabase env — from blowing up at import time.
import { AIProvider } from "@/lib/ai/aiChat.types";
import { MatrxRecordId } from "@/types/records";
// Favorites speak the canonical entity vocabulary. `FavoriteKind` is defined
// ONCE in features/scopes/types.ts (`EntityType | "nav"`) and re-exported below
// so `FavoriteItem.kind` and existing importers stay stable — no parallel union.
import type { FavoriteKind } from "@/features/scopes/types";
// The tutor teaching-mode / personality vocabulary is owned by the tutor feature
// (single source of truth); type-imported here so `TutorPreferences` can't drift
// from it. Type-only ⇒ erased at runtime ⇒ no import cycle (mirrors FavoriteKind).
import type {
  TutorTeachingMode,
  TutorPersonalityStyle,
} from "@/features/education/tutor/settings";

// Define types for each module's preferences
export interface DisplayPreferences {
  darkMode: boolean;
  theme: string;
  dashboardLayout: string;
  sidebarLayout: string;
  headerLayout: string;
  windowMode: string;
}

export interface VoicePreferences {
  voice: string;
  language: string;
  speed: number;
  emotion: string;
  microphone: boolean;
  speaker: boolean;
  wakeWord: string;
}

// Text-to-Speech preferences (catalog default Groq Orpheus voices)
export type GroqTtsVoice =
  | "autumn"
  | "diana"
  | "hannah"
  | "austin"
  | "daniel"
  | "troy";

export interface TextToSpeechPreferences {
  preferredVoice: GroqTtsVoice;
  autoPlay: boolean;
  processMarkdown: boolean;
}

/**
 * User-level output-directive apply policy.
 *   - `default` — don't send the field; let the backend resolve its own
 *     default (`ask` → approval card).
 *   - `auto`    — apply agent actions immediately.
 *   - `ask`     — always show an approval card.
 *   - `off`     — never apply agent actions.
 * The three non-`default` values map 1:1 to the backend `UserOverrides.apply_policy`.
 */
export type DirectiveApplyPolicy = "default" | "auto" | "ask" | "off";

export interface AssistantPreferences {
  alwaysActive: boolean;
  alwaysWatching: boolean;
  useAudio: boolean;
  name: string;
  isPersonal: boolean;
  memoryLevel: number;
  preferredProvider: AIProvider;
  preferredModel: string;
  /**
   * User-layer override for what happens when an agent emits an output
   * directive (create a task / project / note, etc.). Flowed to the backend
   * `UserOverrides.apply_policy` on every turn when not `"default"`.
   */
  directiveApplyPolicy: DirectiveApplyPolicy;
}

// Suggested preferences for email management (you can adjust or remove as needed)
export interface EmailPreferences {
  primaryEmail: string;
  notificationsEnabled: boolean;
  autoReply: boolean;
  signature: string;
  preferredEmailClient: string;
}

// Suggested preferences for video conferencing (you can add or adjust fields)
// NOTE: device choice (mic/speaker/camera) is NOT here — it is canonical in
// `mediaDevices` (MediaDevicePreferences). The legacy free-text
// `defaultMicrophone` / `defaultSpeaker` fields and the placeholder-enum
// `defaultCamera` field were deleted; stale persisted copies are stripped
// loudly on load (see stripSupersededVideoConferenceAudio /
// liftLegacyAudioDevicesToMediaDevices).
export interface VideoConferencePreferences {
  background: string;
  filter: string;
  defaultMeetingType: string;
  defaultLayout: string;
  defaultNotesType: string;
  AiActivityLevel: string;
}

// Suggested preferences for photo editing (add your own fields)
export interface PhotoEditingPreferences {
  defaultFilter: string;
  autoEnhance: boolean;
  resolution: string;
  defaultAspectRatio: string;
  watermarkEnabled: boolean;
}

export interface ImageGenerationPreferences {
  /** Model id, or null = platform default (resolved from the AI catalog at
   *  consumption time — features/ai-models/redux/platformDefaultModel.ts). */
  defaultModel: string | null;
  resolution: string;
  style: string;
  useAiEnhancements: boolean;
  colorPalette: string;
}

export interface TextGenerationPreferences {
  /** Model id, or null = platform default (resolved from the AI catalog at
   *  consumption time — features/ai-models/redux/platformDefaultModel.ts). */
  defaultModel: string | null;
  tone: string;
  creativityLevel: string;
  language: string;
  plagiarismCheckEnabled: boolean;
}

/**
 * How a feature (e.g. the /code workspace) decides which agents to surface
 * in the Chat picker and History sidebar.
 *
 * - `all`        — no filter; show every user agent
 * - `tags`       — include agents whose tags intersect `tags`
 * - `categories` — include agents whose category is in `categories`
 * - `favorites`  — include only `isFavorite` agents
 * - `explicit`   — include only the exact agent ids in `agentIds`
 *
 * Stored in `userPreferences.coding.agentFilter` and seeded into a
 * `ConversationHistorySidebar` scope. Users can clear the filter at any
 * time (the UI sets `mode = "all"`).
 */
export interface CodeAgentFilter {
  mode: "all" | "tags" | "categories" | "favorites" | "explicit";
  tags: string[];
  categories: string[];
  agentIds: string[];
}

/** How the conversation history sidebar groups rows by default. */
export type ConversationHistoryGrouping = "date" | "agent";

// Preferences for coding settings
export interface CodingPreferences {
  preferredLanguage: string;
  preferredTheme: string;
  gitIntegration: boolean;
  instancePreference: string;
  codeCompletion: boolean;
  codeAnalysis: boolean;
  codeFormatting: boolean;
  aiActivityLevel: string;
  voiceAssistance: boolean;

  /** Seed for the Chat + History agent filter in the /code workspace. */
  agentFilter: CodeAgentFilter;
  /** Default grouping for the code-workspace conversation history. */
  historyGrouping: ConversationHistoryGrouping;
  /** How many conversations to fetch per page in the code-workspace history. */
  historyPageSize: number;
  /** Last-used sandbox tier in the "New sandbox" modal — defaults to "ec2". */
  lastSandboxTier: "ec2" | "hosted";
  /** Last-used sandbox template id (e.g. "bare", "node-20"). */
  lastSandboxTemplate: string;
  /**
   * Per-SURFACE active agent sandbox — Level 2 of the binding model. Keyed by
   * the conversation's `sourceFeature` (e.g. "chat-route", "agent-runner",
   * "code-editor"). A box bound from a surface's input applies to every
   * conversation ON THAT SURFACE — and NOTHING else. It is deliberately NOT
   * global: a box bound in chat must never leak into transcription cleanup or
   * any other surface whose input has no visible/unbindable binding control.
   * (Level 1 is the per-conversation override on `cx_conversation`.)
   * Each entry stores `proxyUrl` alongside `rowId` (no extra fetch) and `tier`
   * (drives whether the loop runs on the nearby EC2 server). Empty `{}` = no
   * surface bound. Persisted so the binding survives reloads/tabs.
   */
  activeAgentSandboxBySurface: Record<
    string,
    {
      rowId: string;
      proxyUrl: string;
      tier?: "ec2" | "hosted";
      /**
       * Compute-target kind. Undefined / "ec2" / "hosted" → orchestrator
       * sandbox. "local-pc" → matrx-local PC (proxyUrl is empty; the
       * binding is server-resolved via /api/compute-targets/resolve).
       */
      kind?: "ec2" | "hosted" | "local-pc";
      /** Display label latched at selection. */
      name?: string;
    }
  >;
  /**
   * When true, the code workspace activates per-adapter Monaco type
   * environments (prompt-app, aga-app, tool-ui, library, sandbox-fs,
   * html). Disabling falls back to the bare baseline (vanilla TS) for
   * users who'd rather see unmoderated diagnostics.
   */
  monacoEnvironmentsEnabled: boolean;
  /**
   * Client-side favorite conversations. The `cx_conversation` table has no
   * favorite column yet; we persist ids in preferences so favorites still
   * follow the user across devices (via the user_preferences JSON blob).
   * Promote to a DB column later without touching consumers.
   */
  favoriteConversationIds: string[];
}

/**
 * Sandbox defaults — drive every "new sandbox" code path so the user gets
 * the same shape (template + tier + ttl + env + auto-cloned repo) whether
 * the sandbox is auto-provisioned on sign-in (aidream's
 * `ensure_default_sandbox`) or created via the SandboxPanel's "New sandbox"
 * button.
 *
 * Read on both sides — the web bumps `lastSandboxTier` / `lastSandboxTemplate`
 * under `coding` as a 'last used' hint (kept for backward compatibility),
 * but the auto-provision + explicit-create paths look here first.
 */
export interface SandboxPreferences {
  /** Template id the orchestrator will spawn (e.g. "bare", "node-22"). */
  template: string;
  /** "hosted" survives container restart via per-user Docker volume; "ec2"
   * is ephemeral. */
  tier: "ec2" | "hosted";
  /** Server uses its own default when null. Range [60, 86400]. */
  ttl_seconds: number | null;
  /** Git URL to clone immediately after the sandbox is ready. Absent / empty
   * = no clone. The protocol must be `https://` (the orchestrator does not
   * yet support per-user SSH keys for clone-on-create). */
  default_git_repo: string | null;
  /** Branch / tag / sha to check out after clone. Null = repo's default
   * branch. */
  default_git_branch: string | null;
  /** Env vars exposed in the sandbox shell. Forwarded to the orchestrator as
   * `labels.env_*` and materialised by the entrypoint script. */
  env: Record<string, string>;
  /** When true and `default_git_repo` is set, the auto-provision flow + the
   * "New sandbox" button trigger the clone. Off by default — opt-in. */
  auto_clone_on_create: boolean;
}

export interface FlashcardPreferences {
  fontSize: number;
  educationLevel: string;
  flashcardDifficultyAdjustment: number;
  aiDifficultyAdjustment: number;
  language: string;
  defaultFlashcardMode: string;
  targetScore: number;
  primaryAudioVoice: string;
  primaryTutorPersona: string;
}

/**
 * AI Tutor teaching preferences (VISION §4) — Socratic vs Direct teaching mode
 * and the tutor's personality/style. These ride into every tutor conversation
 * as launch variables (`teaching_mode` / `personality_style`). Durable + synced
 * (they used to live in localStorage — per-browser only — which lost the setting
 * on device switch; see features/education/tutor/settings.ts).
 */
export interface TutorPreferences {
  teachingMode: TutorTeachingMode;
  personalityStyle: TutorPersonalityStyle;
}

export interface PlaygroundPreferences {
  lastRecipeId: MatrxRecordId;
  preferredProvider: MatrxRecordId;
  preferredModel: MatrxRecordId;
  preferredEndpoint: MatrxRecordId;
}

export interface AiModelsPreferences {
  /** Model id, or null = platform default (resolved from the AI catalog at
   *  consumption time — features/ai-models/redux/platformDefaultModel.ts). */
  defaultModel: string | null;
  activeModels: string[];
  inactiveModels: string[];
  newModels: string[];
  /** Starred model ids. Applied only when the model is present in the catalog
   *  (a stale favorite for a removed model is simply ignored). */
  favoriteModels: string[];
}

export interface SystemPreferences {
  viewedAnnouncements: string[]; // Array of announcement IDs that have been viewed
  feedbackFeatureViewCount: number; // Number of times user has seen the new feedback feature highlight
}

export interface MessagingPreferences {
  notificationSoundEnabled: boolean; // Play sound for new messages
  notificationVolume: number; // 0-100
  showDesktopNotifications: boolean; // Browser notifications
}

// How deep the auto-applied default context should go.
// "none"    — no context applied automatically
// "org"     — auto-select a specific organization
// "scope"   — auto-select org + one or more scope entries (map of scopeTypeId → scopeId)
// "project" — auto-select org + project
// "task"    — auto-select org + project + task
export type DefaultContextLevel = "none" | "org" | "scope" | "project" | "task";

export interface AgentContextPreferences {
  level: DefaultContextLevel;
  organizationId: string | null;
  /** scopeTypeId → scopeId pairs to auto-select */
  scopeSelections: Record<string, string>;
  projectId: string | null;
  taskId: string | null;
}

/**
 * The user's global scratchpad pointer. Scratchpads are a user-owned POOL of
 * `workbench.working_documents` rows (kind "scratch"); exactly one is ACTIVE
 * at all times and is auto-attached (read-only) to every conversation's agent
 * context — unless empty. Null = none yet; the first open/type creates one.
 */
export interface ScratchpadPreferences {
  activeId: string | null;
}

/** User-owned Site Workbench sidebar bookmarks (synced). System bookmarks are fixed in code. */
export interface SiteWorkbenchUserBookmark {
  id: string;
  label: string;
  url: string;
}

export interface SiteWorkbenchPreferences {
  bookmarks: SiteWorkbenchUserBookmark[];
}

/**
 * How ONE feature-entry list surface is presented for this user — the "style"
 * half of list state, deliberately separate from the "query" half.
 *
 * Persisted (style, survives reload + follows the user across devices):
 *   view mode, density, sort, page size, hidden columns.
 * NOT persisted (query, always starts clean): search text, column filters,
 *   page number, and the active scope tab — a stale search silently showing
 *   "no results" on next visit is a bug, not a convenience.
 *
 * Written through `useListViewPrefs(surfaceKey)` — see lib/list-views/.
 */
export interface ListViewPrefs {
  /** "table" is the canonical default for every list surface. */
  view: "table" | "cards" | "rows";
  density: "compact" | "comfortable";
  sort: "updated" | "created" | "name" | "category";
  direction: "asc" | "desc";
  pageSize: number;
  /** Column ids the user switched OFF. Absent id = visible. */
  hiddenColumns: string[];
}

/**
 * Keyed by list surface (e.g. "agents-browse"). Every list surface that adopts
 * the canonical entry-list shell gets one entry here, so a user's list-style
 * choices are one synced blob instead of N localStorage keys.
 */
export type ListViewsPreferences = Record<string, ListViewPrefs>;

export interface OrganizationPreferences {
  /**
   * The user's DEFAULT active organization. When set, the active-org bootstrap
   * auto-selects it at startup (across devices) so the user is never left
   * without an org and never re-prompted. `null` = no default chosen yet → the
   * header reminder nudges the user to pick one. The single durable source of
   * truth for "which org am I in by default" — see activeOrgBootstrap +
   * features/organizations/hooks/useDefaultOrganization.
   */
  defaultOrganizationId: string | null;
}

export type ThinkingMode = "none" | "simple" | "deep";

export interface PromptsPreferences {
  showSettingsOnMainPage: boolean;
  /** Model id, or null = platform default (resolved from the AI catalog at
   *  consumption time — features/ai-models/redux/platformDefaultModel.ts). */
  defaultModel: string | null;
  defaultTemperature: number; // 0-2 in 0.01 increments
  alwaysIncludeInternalWebSearch: boolean;
  includeThinkingInAutoPrompts: ThinkingMode;
  submitOnEnter: boolean;
  autoClearResponsesInEditMode: boolean;
}

/** Captured keyboard shortcut — mirrors the `KeybindingValue` shape used by
 *  `SettingsKeybinding` so the preference can be passed straight through. */
export interface AgentConnectionsShortcut {
  key: string;
  display: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/** Preferences surfaced on the /agent-connections/preferences route. Each
 *  field maps 1:1 to a primitive in the settings library, so the route serves
 *  double duty as a working demo of the primitive set. */
export interface AgentConnectionsPreferences {
  notifyOnConnect: boolean;
  autoReconnect: boolean;
  confirmDestructive: boolean;
  defaultScope: "user" | "organization" | "project" | "task";
  densityMode: "compact" | "comfortable" | "spacious";
  sidebarStyle: "icons" | "labels" | "full";
  autoSaveDelayMs: number;
  maxConcurrentAgents: number;
  workspaceName: string;
  welcomeMessage: string;
  accentColor: string;
  enabledRegistries: string[];
  quickToggleShortcut: AgentConnectionsShortcut | null;
}

/** Default render options for mermaid diagram blocks (theme "auto" follows
 *  the app's dark/light mode). Per-artifact metadata overrides these. The
 *  option unions live with the mermaid core so the renderer and this slice
 *  can never drift. */
export type MermaidPreferences =
  import("@/components/mermaid/types").MermaidOptionPreferences;

/**
 * Per-surface override of the conversation source filter (which `source_app`
 * / `source_feature` provenance a conversation-history surface shows by
 * default). A surface absent from `surfaces` falls back to the registry
 * default in
 * `features/agents/redux/conversation-history/source-registry.ts`. Mirrors
 * the registry's `SurfaceFilterPref` shape exactly.
 */
export interface ConversationFilterSurfacePref {
  includeFeatures: string[];
  includeApps: string[];
  includeEmptySource: boolean;
}

export interface ConversationFilterPreferences {
  /** surfaceId → override. Empty = every surface uses its registry default. */
  surfaces: Record<string, ConversationFilterSurfacePref>;
}

/**
 * Persisted media DEVICE choice — the canonical "remember my mic, speaker,
 * and camera" store, read by the media-device manager
 * (`features/media-devices/deviceManager.ts`) and the camera stream manager.
 * We store BOTH the `deviceId` AND the human `label` for each, because iOS
 * Safari regenerates `deviceId` on every page load — on resolve we match by
 * id → else by label → else system default. `""` everywhere means "system
 * default" / "auto" (no explicit choice).
 *
 * NOTE: this superseded — and has now absorbed — the legacy `audioDevices`
 * module (mic + speaker only) and the placeholder-enum
 * `videoConference.defaultCamera` field (never wired to real
 * `enumerateDevices` ids; dropped with no mapping). Stale persisted copies
 * are lifted/stripped loudly on load (see
 * liftLegacyAudioDevicesToMediaDevices) and healed in the DB by
 * `users.normalize_preferences_jsonb`
 * (migrations/user_preferences_media_devices_backfill.sql).
 */
export interface MediaDevicePreferences {
  audioInputDeviceId: string;
  audioInputDeviceLabel: string;
  audioOutputDeviceId: string;
  audioOutputDeviceLabel: string;
  videoInputDeviceId: string;
  videoInputDeviceLabel: string;
  /** "" = auto (no explicit facing preference). */
  preferredFacingMode: "user" | "environment" | "";
}

// `FavoriteKind` ("what a favorite points at") is the canonical
// `EntityType | "nav"`, imported above from features/scopes/types.ts and used
// by `FavoriteItem.kind` below. `nav` = a static app-area destination (e.g.
// "Research"); every other token is an `EntityType` whose per-user favorite
// state lives in `platform.user_entity_state`.

/**
 * A single pinned favorite. Stored as a self-contained *reference* — not a bare
 * id — so the sidebar Favorites flyout and the dashboard grid render INSTANTLY
 * from Redux (already hydrated at boot) with zero fetch. `label`/`iconName`/
 * `color` are snapshots; an optional background pass can refresh/prune them.
 */
export interface FavoriteItem {
  /**
   * Stable dedupe key. For `nav` favorites this is the `href`; for records use
   * `${kind}:${entityId}` so the same entity can never be pinned twice.
   */
  id: string;
  kind: FavoriteKind;
  /** Snapshot label for instant render. */
  label: string;
  /** Where clicking the favorite navigates. */
  href: string;
  /** ShellIcon / Lucide icon name (resolved via shellIconMap). */
  iconName?: string;
  /** Optional Tailwind color family (e.g. "sky") for the accent. */
  color?: string;
  /** ISO timestamp; drives default ordering (newest first) until reordered. */
  pinnedAt: string;
}

/**
 * User-curated favorites. Lives in the preferences JSON (already fetched +
 * synced + in Redux), capped at FAVORITES_MAX so the blob can never bloat.
 * Powers BOTH the dashboard "Pinned" grid and the sidebar Favorites menu.
 */
export interface FavoritesPreferences {
  /** Ordered list of pinned items. Capped at FAVORITES_MAX. */
  items: FavoriteItem[];
}

/** Hard cap on pinned favorites — keeps the preferences blob tiny (~6KB max). */
export const FAVORITES_MAX = 50;

// Combine all module preferences into one interface
export interface UserPreferences {
  favorites: FavoritesPreferences;
  display: DisplayPreferences;
  prompts: PromptsPreferences;
  voice: VoicePreferences;
  textToSpeech: TextToSpeechPreferences;
  assistant: AssistantPreferences;
  email: EmailPreferences;
  videoConference: VideoConferencePreferences;
  photoEditing: PhotoEditingPreferences;
  imageGeneration: ImageGenerationPreferences;
  textGeneration: TextGenerationPreferences;
  coding: CodingPreferences;
  sandbox: SandboxPreferences;
  flashcard: FlashcardPreferences;
  tutor: TutorPreferences;
  playground: PlaygroundPreferences;
  aiModels: AiModelsPreferences;
  system: SystemPreferences;
  messaging: MessagingPreferences;
  agentContext: AgentContextPreferences;
  agentConnections: AgentConnectionsPreferences;
  mermaid: MermaidPreferences;
  conversationFilters: ConversationFilterPreferences;
  mediaDevices: MediaDevicePreferences;
  organization: OrganizationPreferences;
  scratchpad: ScratchpadPreferences;
  siteWorkbench: SiteWorkbenchPreferences;
  listViews: ListViewsPreferences;
}

// Add state interface for async operations
export interface UserPreferencesState extends UserPreferences {
  _meta: {
    isLoading: boolean;
    error: string | null;
    lastSaved: string | null;
    hasUnsavedChanges: boolean;
    loadedPreferences: UserPreferences | null; // Store original loaded state for reset
  };
}

/**
 * LOUD MIGRATION (2026-07): the legacy free-text
 * `videoConference.defaultMicrophone` / `defaultSpeaker` fields were folded
 * into the canonical device module (now `mediaDevices`) and deleted from the shape. A
 * persisted blob (IDB / localStorage mirror / remote) may still carry them;
 * strip them here — with a warning, never silently — so they can't shadow-
 * revive through the shallow module merges. The blob self-heals on the next
 * engine save (partialize writes the whole module).
 */
function stripSupersededVideoConferenceAudio(
  vc: Partial<VideoConferencePreferences> | undefined,
): Partial<VideoConferencePreferences> | undefined {
  if (!vc) return vc;
  const carrier = vc as Record<string, unknown>;
  const stale = ["defaultMicrophone", "defaultSpeaker"].filter(
    (k) => k in carrier,
  );
  if (stale.length === 0) return vc;
  console.warn(
    "[userPreferences] MIGRATION: dropping superseded videoConference audio " +
      `field(s) [${stale.join(", ")}] from a persisted payload — mic/speaker ` +
      "choice is canonical in userPreferences.mediaDevices. The stored blob " +
      "self-heals on the next save.",
  );
  const cleaned: Record<string, unknown> = { ...carrier };
  for (const k of stale) delete cleaned[k];
  return cleaned as Partial<VideoConferencePreferences>;
}

/**
 * LOUD MIGRATION (2026-07, media-capture Phase 4): the audio-only
 * `audioDevices` module was superseded by the unified `mediaDevices` module
 * (mic + speaker + camera + facing mode), and the placeholder-enum
 * `videoConference.defaultCamera` field was deleted (never wired to real
 * `enumerateDevices` ids — dropped with no mapping). A persisted blob
 * (IDB / localStorage mirror / remote) may still carry them; lift/strip here —
 * with a warning, never silently. Mirrors the SQL rule in
 * `users.normalize_preferences_jsonb`
 * (migrations/user_preferences_media_devices_backfill.sql). Follows the exact
 * pattern of stripSupersededVideoConferenceAudio above.
 */
function liftLegacyAudioDevicesToMediaDevices(
  loaded: Partial<UserPreferences>,
): Partial<UserPreferences> {
  const carrier = loaded as Record<string, unknown>;
  const legacy = carrier["audioDevices"];
  const vc = loaded.videoConference as
    | (VideoConferencePreferences & { defaultCamera?: unknown })
    | undefined;
  const hasLegacyModule = legacy !== undefined;
  const hasLegacyCamera = vc !== undefined && "defaultCamera" in vc;
  if (!hasLegacyModule && !hasLegacyCamera) return loaded;

  const out: Record<string, unknown> = { ...carrier };
  const dropped: string[] = [];

  if (hasLegacyModule) {
    const existing = out["mediaDevices"];
    const mediaDevicesEmpty =
      existing === undefined ||
      existing === null ||
      (typeof existing === "object" &&
        Object.keys(existing as object).length === 0);
    if (
      mediaDevicesEmpty &&
      legacy !== null &&
      typeof legacy === "object" &&
      !Array.isArray(legacy)
    ) {
      const l = legacy as Record<string, unknown>;
      const str = (v: unknown): string => (typeof v === "string" ? v : "");
      out["mediaDevices"] = {
        audioInputDeviceId: str(l["audioInputDeviceId"]),
        audioInputDeviceLabel: str(l["audioInputDeviceLabel"]),
        audioOutputDeviceId: str(l["audioOutputDeviceId"]),
        audioOutputDeviceLabel: str(l["audioOutputDeviceLabel"]),
        videoInputDeviceId: "",
        videoInputDeviceLabel: "",
        preferredFacingMode: "",
      } satisfies MediaDevicePreferences;
      dropped.push("audioDevices (lifted → mediaDevices)");
    } else {
      dropped.push("audioDevices (mediaDevices already set — discarded)");
    }
    delete out["audioDevices"];
  }

  if (hasLegacyCamera) {
    const cleanedVc: Record<string, unknown> = {
      ...(vc as unknown as Record<string, unknown>),
    };
    delete cleanedVc["defaultCamera"];
    out["videoConference"] = cleanedVc;
    dropped.push("videoConference.defaultCamera (placeholder enum, no mapping)");
  }

  console.warn(
    "[userPreferences] MIGRATION: lifting/dropping superseded device " +
      `preference field(s) [${dropped.join(", ")}] from a persisted payload — ` +
      "device choice is canonical in userPreferences.mediaDevices. The stored " +
      "blob self-heals on the next save.",
  );
  return out as Partial<UserPreferences>;
}

/**
 * LOUD MIGRATION (2026-07, D41 item 3): the preferences seed used to HARDCODE
 * default models — a model UUID for prompts/aiModels, "GPT-4o" for
 * textGeneration, "standard" for imageGeneration. The seed is now `null` =
 * "platform default" (resolved from the AI catalog at consumption time via
 * features/ai-models/redux/platformDefaultModel.ts), but persisted rows
 * (IDB / localStorage mirror / remote users.user_preferences) still carry
 * those seeded constants and are INDISTINGUISHABLE from explicit user
 * choices. Accepted trade-off: the EXACT legacy sentinel values are treated
 * as null ("platform default") at every load boundary. A user who never
 * chose a model gets null → catalog default; any other stored value is an
 * explicit choice and is kept. (Known edge, accepted: a user who
 * deliberately re-picks the old seeded model — GPT 4.1 Mini — is folded back
 * to "platform default" on the next load.) The stored blob self-heals on the
 * next engine save.
 */
type DefaultModelModule =
  | "prompts"
  | "aiModels"
  | "textGeneration"
  | "imageGeneration";

const LEGACY_DEFAULT_MODEL_SENTINELS: Readonly<
  Record<DefaultModelModule, string>
> = {
  prompts: "548126f2-714a-4562-9001-0c31cbeea375", // seeded GPT-4.1 Mini uuid
  aiModels: "548126f2-714a-4562-9001-0c31cbeea375", // seeded GPT-4.1 Mini uuid
  textGeneration: "GPT-4o", // seeded display-name string (never a real id)
  imageGeneration: "standard", // seeded preset string (never a real id)
};

/**
 * Strip the legacy hardcoded `defaultModel` seed values from a LOADED
 * preferences payload (persisted blob / remote row) — with a warning, never
 * silently — so a stale seed can't masquerade as a user choice. Load
 * boundaries ONLY: user-initiated writes (setPreference / setModulePreferences
 * from the UI) are never sanitized.
 */
export function stripLegacyDefaultModelSentinels(
  loaded: Partial<UserPreferences>,
): Partial<UserPreferences> {
  const out: Partial<UserPreferences> = { ...loaded };
  const scrub = <K extends DefaultModelModule>(module: K): void => {
    const prefs = out[module];
    if (prefs?.defaultModel === LEGACY_DEFAULT_MODEL_SENTINELS[module]) {
      console.warn(
        `[userPreferences] MIGRATION: persisted ${module}.defaultModel holds the ` +
          `legacy seeded constant "${prefs.defaultModel}" — treating it as null ` +
          "(platform default, resolved from the AI catalog). The stored blob " +
          "self-heals on the next save.",
      );
      out[module] = { ...prefs, defaultModel: null };
    }
  };
  scrub("prompts");
  scrub("aiModels");
  scrub("textGeneration");
  scrub("imageGeneration");
  return out;
}

/**
 * THE canonical load-boundary sanitizer. Applies EVERY known preferences shape
 * migration to a persisted / remote payload before it enters Redux. This is the
 * TS mirror of the DB normalizer `users.normalize_preferences_jsonb`
 * (migrations/user_preferences_legacy_drift_backfill.sql) — when a shape
 * migration adds a rule to one, add the matching rule to the OTHER in the SAME
 * change. That single discipline is what stops shape drift.
 *
 * Every load boundary (store bootstrap, sync-engine REHYDRATE, DeferredShellData)
 * MUST route through this — never a subset of the individual strips. A boundary
 * that sanitizes only some fields silently re-persists the ones it missed
 * (exactly the videoConference-audio regression this consolidation fixed).
 */
export function sanitizeLoadedPreferences(
  loaded: Partial<UserPreferences>,
): Partial<UserPreferences> {
  let out = stripLegacyDefaultModelSentinels(loaded);
  if (out.videoConference) {
    out.videoConference = stripSupersededVideoConferenceAudio(
      out.videoConference,
    ) as VideoConferencePreferences;
  }
  out = liftLegacyAudioDevicesToMediaDevices(out);
  return out;
}

// Helper function to ensure preferences have the proper structure
export const initializeUserPreferencesState = (
  rawPreferences: Partial<UserPreferences> = {},
  setAsLoaded: boolean = false,
): UserPreferencesState => {
  // Callers pass PERSISTED data here (store bootstrap / SSR-loaded rows) —
  // a load boundary, so every known legacy shape drift is normalized.
  const preferences = sanitizeLoadedPreferences(rawPreferences);
  const defaultMeta = {
    isLoading: false,
    error: null,
    lastSaved: null,
    hasUnsavedChanges: false,
    loadedPreferences: null as UserPreferences | null,
  };

  const defaultPreferences: UserPreferences = {
    favorites: {
      items: [],
    },
    display: {
      darkMode: false,
      theme: "default",
      dashboardLayout: "default",
      sidebarLayout: "default",
      headerLayout: "default",
      windowMode: "default",
    },
    prompts: {
      showSettingsOnMainPage: false,
      // null = platform default, resolved from the AI catalog (is_primary on
      // ai.model_public) at consumption time — never a hardcoded model id.
      defaultModel: null,
      defaultTemperature: 1.0,
      alwaysIncludeInternalWebSearch: true,
      includeThinkingInAutoPrompts: "none",
      submitOnEnter: true,
      autoClearResponsesInEditMode: true,
    },
    voice: {
      // Empty = no explicit choice → resolveVoiceId() falls back to the
      // purpose default (Skylar for reading, Daniel for assistant).
      voice: "",
      language: "en",
      // generation_config.speed scale (0.6–1.5); 1.2 is our chosen baseline.
      speed: 1.2,
      emotion: "",
      microphone: false,
      speaker: false,
      wakeWord: "Hey Matrix",
    },
    textToSpeech: {
      preferredVoice: "troy",
      autoPlay: false,
      processMarkdown: true,
    },
    flashcard: {
      fontSize: 16,
      educationLevel: "highSchool",
      flashcardDifficultyAdjustment: 5,
      aiDifficultyAdjustment: 5,
      language: "en",
      defaultFlashcardMode: "selfStudy",
      targetScore: 80,
      primaryAudioVoice: "default",
      primaryTutorPersona: "default",
    },
    tutor: {
      // Must match DEFAULT_TUTOR_SETTINGS in features/education/tutor/settings.ts.
      teachingMode: "Socratic",
      personalityStyle: "Encouraging & Step-by-Step",
    },
    assistant: {
      alwaysActive: false,
      alwaysWatching: false,
      useAudio: false,
      name: "Assistant",
      isPersonal: false,
      memoryLevel: 0,
      preferredProvider: "default",
      preferredModel: "default",
      directiveApplyPolicy: "default",
    },
    email: {
      primaryEmail: "",
      notificationsEnabled: true,
      autoReply: false,
      signature: "",
      preferredEmailClient: "default",
    },
    videoConference: {
      background: "default",
      filter: "default",
      defaultMeetingType: "default",
      defaultLayout: "default",
      defaultNotesType: "default",
      AiActivityLevel: "default",
    },
    photoEditing: {
      defaultFilter: "none",
      autoEnhance: false,
      resolution: "1080p",
      defaultAspectRatio: "16:9",
      watermarkEnabled: false,
    },
    imageGeneration: {
      // null = platform default (catalog-resolved) — see prompts.defaultModel.
      defaultModel: null,
      resolution: "1080p",
      style: "realistic",
      useAiEnhancements: true,
      colorPalette: "vibrant",
    },
    textGeneration: {
      // null = platform default (catalog-resolved) — see prompts.defaultModel.
      defaultModel: null,
      tone: "neutral",
      creativityLevel: "medium",
      language: "en",
      plagiarismCheckEnabled: true,
    },
    coding: {
      preferredLanguage: "javascript",
      preferredTheme: "dark",
      gitIntegration: true,
      instancePreference: "local",
      codeCompletion: true,
      codeAnalysis: true,
      codeFormatting: true,
      aiActivityLevel: "medium",
      voiceAssistance: false,
      agentFilter: {
        mode: "all",
        tags: [],
        categories: [],
        agentIds: [],
      },
      historyGrouping: "date",
      historyPageSize: 30,
      favoriteConversationIds: [],
      lastSandboxTier: "ec2",
      lastSandboxTemplate: "bare",
      monacoEnvironmentsEnabled: true,
      activeAgentSandboxBySurface: {},
    },
    sandbox: {
      // "slim" = the full coding env without aidream-built-in. Matches what
      // the Sandbox admin page's "New sandbox" button creates by default
      // and is the template the auto-provision-on-sign-in flow uses.
      template: "slim",
      tier: "ec2",
      // null = use the orchestrator's max (24h); user wants "never auto-stop"
      // and heartbeats roll expires_at forward while the box is being used.
      ttl_seconds: null,
      default_git_repo: null,
      default_git_branch: null,
      env: {},
      auto_clone_on_create: false,
    },
    playground: {
      lastRecipeId: "",
      preferredProvider: "",
      preferredModel: "",
      preferredEndpoint: "",
    },
    aiModels: {
      // null = platform default (catalog-resolved) — see prompts.defaultModel.
      defaultModel: null,
      activeModels: [],
      inactiveModels: [],
      newModels: [],
      favoriteModels: [],
    },
    system: {
      viewedAnnouncements: [],
      feedbackFeatureViewCount: 0,
    },
    messaging: {
      notificationSoundEnabled: true,
      notificationVolume: 50,
      showDesktopNotifications: false,
    },
    agentContext: {
      level: "none",
      organizationId: null,
      scopeSelections: {},
      projectId: null,
      taskId: null,
    },
    agentConnections: {
      notifyOnConnect: true,
      autoReconnect: false,
      confirmDestructive: true,
      defaultScope: "user",
      densityMode: "comfortable",
      sidebarStyle: "full",
      autoSaveDelayMs: 750,
      maxConcurrentAgents: 4,
      workspaceName: "",
      welcomeMessage: "",
      // Tailwind color family name (lowercase) — paired with `TailwindColorPicker`.
      accentColor: "blue",
      enabledRegistries: [],
      quickToggleShortcut: null,
    },
    mermaid: {
      theme: "auto",
      look: "classic",
      layout: "dagre",
    },
    conversationFilters: {
      // Empty = every surface uses its registry default
      // (source-registry.ts → SURFACE_DEFAULTS).
      surfaces: {},
    },
    mediaDevices: {
      // "" everywhere = system default / auto (no explicit device chosen yet).
      audioInputDeviceId: "",
      audioInputDeviceLabel: "",
      audioOutputDeviceId: "",
      audioOutputDeviceLabel: "",
      videoInputDeviceId: "",
      videoInputDeviceLabel: "",
      preferredFacingMode: "",
    },
    organization: {
      // null = no default chosen → header reminder nudges the user.
      defaultOrganizationId: null,
    },
    scratchpad: {
      // null = no scratchpad yet; the first open/type creates + activates one.
      activeId: null,
    },
    siteWorkbench: {
      bookmarks: [],
    },
    // Empty = every list surface falls back to its own declared defaults
    // (lib/list-views/defaults.ts). Keep in sync with defaultUserPreferences.ts.
    listViews: {},
  };

  // Merge with defaults to ensure all properties exist
  const mergedPreferences: UserPreferences = {
    favorites: { ...defaultPreferences.favorites, ...preferences.favorites },
    display: { ...defaultPreferences.display, ...preferences.display },
    prompts: { ...defaultPreferences.prompts, ...preferences.prompts },
    voice: { ...defaultPreferences.voice, ...preferences.voice },
    textToSpeech: {
      ...defaultPreferences.textToSpeech,
      ...preferences.textToSpeech,
    },
    assistant: { ...defaultPreferences.assistant, ...preferences.assistant },
    email: { ...defaultPreferences.email, ...preferences.email },
    videoConference: {
      // `preferences` already went through sanitizeLoadedPreferences above —
      // the superseded audio fields are gone. No second strip here (mirrors
      // the REHYDRATE reducer; a per-boundary strip is the drift smell).
      ...defaultPreferences.videoConference,
      ...preferences.videoConference,
    },
    photoEditing: {
      ...defaultPreferences.photoEditing,
      ...preferences.photoEditing,
    },
    imageGeneration: {
      ...defaultPreferences.imageGeneration,
      ...preferences.imageGeneration,
    },
    textGeneration: {
      ...defaultPreferences.textGeneration,
      ...preferences.textGeneration,
    },
    coding: { ...defaultPreferences.coding, ...preferences.coding },
    sandbox: { ...defaultPreferences.sandbox, ...preferences.sandbox },
    flashcard: { ...defaultPreferences.flashcard, ...preferences.flashcard },
    tutor: { ...defaultPreferences.tutor, ...preferences.tutor },
    playground: { ...defaultPreferences.playground, ...preferences.playground },
    aiModels: { ...defaultPreferences.aiModels, ...preferences.aiModels },
    system: { ...defaultPreferences.system, ...preferences.system },
    messaging: { ...defaultPreferences.messaging, ...preferences.messaging },
    agentContext: {
      ...defaultPreferences.agentContext,
      ...preferences.agentContext,
    },
    agentConnections: {
      ...defaultPreferences.agentConnections,
      ...preferences.agentConnections,
    },
    mermaid: { ...defaultPreferences.mermaid, ...preferences.mermaid },
    conversationFilters: {
      ...defaultPreferences.conversationFilters,
      ...preferences.conversationFilters,
    },
    mediaDevices: {
      ...defaultPreferences.mediaDevices,
      ...preferences.mediaDevices,
    },
    organization: {
      ...defaultPreferences.organization,
      ...preferences.organization,
    },
    scratchpad: {
      ...defaultPreferences.scratchpad,
      ...preferences.scratchpad,
    },
    siteWorkbench: {
      ...defaultPreferences.siteWorkbench,
      ...preferences.siteWorkbench,
    },
    listViews: {
      ...defaultPreferences.listViews,
      ...preferences.listViews,
    },
  };

  // If setAsLoaded is true, store the merged preferences as the loaded state
  if (setAsLoaded) {
    defaultMeta.loadedPreferences = { ...mergedPreferences };
  }

  return {
    ...mergedPreferences,
    _meta: defaultMeta,
  };
};

const userPreferencesSlice = createSlice({
  name: "userPreferences",
  initialState: initializeUserPreferencesState(),
  reducers: {
    // MATRX-EXCEPTION: generic single-field setter dispatched by string key across 20+
    // heterogeneous preference module shapes (UserPreferences[keyof UserPreferences]).
    // A fully-typed version needs a per-module mapped-type overload set threaded through
    // every setPreference callsite (features/settings, code/chat, organizations, etc.) —
    // an architecture change, not a boundary fix. See setModulePreferences below for the
    // typed alternative used where the caller knows the module at the call site.
    setPreference: <T extends keyof UserPreferences>(
      state: Draft<UserPreferencesState>,
      action: PayloadAction<{
        module: T;
        preference: string;
        value: unknown;
      }>,
    ) => {
      const { module, preference, value } = action.payload;
      state[module] = {
        ...state[module],
        [preference]: value,
      } as Draft<UserPreferencesState>[T];
      // Persistence is engine-managed (definePolicy → debounced 250ms remote
      // upsert + pagehide flush). The flag was leftover from a pre-engine
      // manual-save workflow; setting it produced a "Unsaved changes" banner
      // with no user-actionable Save button. Leaving the flag at its current
      // value (which is `false` once REHYDRATE has fired) means the UI never
      // surfaces a phantom dirty state.
      state._meta.error = null;
    },
    setModulePreferences: <T extends keyof UserPreferences>(
      state: Draft<UserPreferencesState>,
      action: PayloadAction<{
        module: T;
        preferences: Partial<UserPreferences[T]>;
      }>,
    ) => {
      const { module, preferences } = action.payload;
      state[module] = {
        ...state[module],
        ...preferences,
      } as Draft<UserPreferencesState>[T];
      // See note in `setPreference` — auto-save handles persistence.
      state._meta.error = null;
    },
    resetModulePreferences: <T extends keyof UserPreferences>(
      state: Draft<UserPreferencesState>,
      action: PayloadAction<T>,
    ) => {
      const moduleKey = action.payload;
      state[moduleKey] = initializeUserPreferencesState()[
        moduleKey
      ] as Draft<UserPreferencesState>[T];
      // See note in `setPreference` — auto-save handles persistence.
      state._meta.error = null;
    },
    resetAllPreferences: () => initializeUserPreferencesState(),
    resetToLoadedPreferences: (state) => {
      if (state._meta.loadedPreferences) {
        // Restore each module from loaded preferences
        state.favorites = { ...state._meta.loadedPreferences.favorites };
        state.display = { ...state._meta.loadedPreferences.display };
        state.prompts = { ...state._meta.loadedPreferences.prompts };
        state.voice = { ...state._meta.loadedPreferences.voice };
        state.textToSpeech = { ...state._meta.loadedPreferences.textToSpeech };
        state.assistant = { ...state._meta.loadedPreferences.assistant };
        state.email = { ...state._meta.loadedPreferences.email };
        state.videoConference = {
          ...state._meta.loadedPreferences.videoConference,
        };
        state.photoEditing = { ...state._meta.loadedPreferences.photoEditing };
        state.imageGeneration = {
          ...state._meta.loadedPreferences.imageGeneration,
        };
        state.textGeneration = {
          ...state._meta.loadedPreferences.textGeneration,
        };
        state.coding = { ...state._meta.loadedPreferences.coding };
        state.sandbox = { ...state._meta.loadedPreferences.sandbox };
        state.flashcard = { ...state._meta.loadedPreferences.flashcard };
        state.tutor = { ...state._meta.loadedPreferences.tutor };
        state.playground = { ...state._meta.loadedPreferences.playground };
        state.aiModels = { ...state._meta.loadedPreferences.aiModels };
        state.system = { ...state._meta.loadedPreferences.system };
        state.messaging = { ...state._meta.loadedPreferences.messaging };
        state.agentContext = { ...state._meta.loadedPreferences.agentContext };
        state.agentConnections = {
          ...state._meta.loadedPreferences.agentConnections,
        };
        state.mermaid = { ...state._meta.loadedPreferences.mermaid };
        state.conversationFilters = {
          ...state._meta.loadedPreferences.conversationFilters,
        };
        state.mediaDevices = {
          ...state._meta.loadedPreferences.mediaDevices,
        };
        state.organization = {
          ...state._meta.loadedPreferences.organization,
        };
        state.scratchpad = {
          ...state._meta.loadedPreferences.scratchpad,
        };
        state.siteWorkbench = {
          ...state._meta.loadedPreferences.siteWorkbench,
        };
        state.listViews = {
          ...state._meta.loadedPreferences.listViews,
        };
        state._meta.hasUnsavedChanges = false;
        state._meta.error = null;
      }
    },
    // ── Favorites / pinning ────────────────────────────────────────────────
    // Dedupe + cap live HERE (single source of truth) so every callsite —
    // dashboard PinButton, sidebar, future surfaces — gets identical behavior.
    addFavorite: (state, action: PayloadAction<FavoriteItem>) => {
      const item = action.payload;
      const next = state.favorites.items.filter((f) => f.id !== item.id);
      next.unshift(item); // newest first
      state.favorites.items = next.slice(0, FAVORITES_MAX);
      state._meta.error = null;
    },
    removeFavorite: (state, action: PayloadAction<string>) => {
      state.favorites.items = state.favorites.items.filter(
        (f) => f.id !== action.payload,
      );
      state._meta.error = null;
    },
    toggleFavorite: (state, action: PayloadAction<FavoriteItem>) => {
      const item = action.payload;
      const exists = state.favorites.items.some((f) => f.id === item.id);
      if (exists) {
        state.favorites.items = state.favorites.items.filter(
          (f) => f.id !== item.id,
        );
      } else {
        const next = state.favorites.items.filter((f) => f.id !== item.id);
        next.unshift(item);
        state.favorites.items = next.slice(0, FAVORITES_MAX);
      }
      state._meta.error = null;
    },
    reorderFavorites: (state, action: PayloadAction<string[]>) => {
      // payload = new ordered list of ids; unknown ids dropped, missing ones appended
      const byId = new Map(state.favorites.items.map((f) => [f.id, f]));
      const next: FavoriteItem[] = [];
      for (const id of action.payload) {
        const f = byId.get(id);
        if (f) {
          next.push(f);
          byId.delete(id);
        }
      }
      for (const f of byId.values()) next.push(f);
      state.favorites.items = next;
      state._meta.error = null;
    },
    setFavorites: (state, action: PayloadAction<FavoriteItem[]>) => {
      state.favorites.items = action.payload.slice(0, FAVORITES_MAX);
      state._meta.error = null;
    },
    clearUnsavedChanges: (state) => {
      state._meta.hasUnsavedChanges = false;
    },
    clearError: (state) => {
      state._meta.error = null;
    },
  },
  extraReducers: (builder) => {
    // Sync engine rehydrate — the engine fetches the full preferences body
    // from (IDB primary → localStorage mirror → remote.fetch) and dispatches
    // `REHYDRATE_ACTION_TYPE`. We merge the payload shallowly into each
    // module, preserving `_meta` (transient UI/load state, intentionally NOT
    // persisted per A15/partialize).
    builder.addCase(REHYDRATE_ACTION_TYPE, (state, action: RehydrateAction) => {
      if (action.payload.sliceName !== "userPreferences") return;
      const rawLoaded = action.payload.state as
        Partial<UserPreferences> | undefined;
      if (!rawLoaded) return;
      // Load boundary: normalize every known legacy shape drift (defaultModel
      // seed constants → null, superseded videoConference audio fields dropped)
      // so a stale value can't masquerade as a user choice or shadow-revive.
      const loaded = sanitizeLoadedPreferences(rawLoaded);

      if (loaded.favorites)
        state.favorites = { ...state.favorites, ...loaded.favorites };
      if (loaded.display)
        state.display = { ...state.display, ...loaded.display };
      if (loaded.prompts)
        state.prompts = { ...state.prompts, ...loaded.prompts };
      if (loaded.voice) state.voice = { ...state.voice, ...loaded.voice };
      if (loaded.textToSpeech)
        state.textToSpeech = { ...state.textToSpeech, ...loaded.textToSpeech };
      if (loaded.assistant)
        state.assistant = { ...state.assistant, ...loaded.assistant };
      if (loaded.email) state.email = { ...state.email, ...loaded.email };
      if (loaded.videoConference)
        state.videoConference = {
          ...state.videoConference,
          ...loaded.videoConference,
        };
      if (loaded.photoEditing)
        state.photoEditing = { ...state.photoEditing, ...loaded.photoEditing };
      if (loaded.imageGeneration)
        state.imageGeneration = {
          ...state.imageGeneration,
          ...loaded.imageGeneration,
        };
      if (loaded.textGeneration)
        state.textGeneration = {
          ...state.textGeneration,
          ...loaded.textGeneration,
        };
      if (loaded.coding) state.coding = { ...state.coding, ...loaded.coding };
      if (loaded.sandbox)
        state.sandbox = { ...state.sandbox, ...loaded.sandbox };
      if (loaded.flashcard)
        state.flashcard = { ...state.flashcard, ...loaded.flashcard };
      if (loaded.tutor) state.tutor = { ...state.tutor, ...loaded.tutor };
      if (loaded.playground)
        state.playground = { ...state.playground, ...loaded.playground };
      if (loaded.aiModels)
        state.aiModels = { ...state.aiModels, ...loaded.aiModels };
      if (loaded.system) state.system = { ...state.system, ...loaded.system };
      if (loaded.messaging)
        state.messaging = { ...state.messaging, ...loaded.messaging };
      if (loaded.agentContext)
        state.agentContext = { ...state.agentContext, ...loaded.agentContext };
      if (loaded.agentConnections)
        state.agentConnections = {
          ...state.agentConnections,
          ...loaded.agentConnections,
        };
      if (loaded.mermaid)
        state.mermaid = { ...state.mermaid, ...loaded.mermaid };
      if (loaded.conversationFilters)
        state.conversationFilters = {
          ...state.conversationFilters,
          ...loaded.conversationFilters,
        };
      if (loaded.mediaDevices)
        state.mediaDevices = {
          ...state.mediaDevices,
          ...loaded.mediaDevices,
        };
      if (loaded.organization)
        state.organization = {
          ...state.organization,
          ...loaded.organization,
        };
      if (loaded.scratchpad)
        state.scratchpad = {
          ...state.scratchpad,
          ...loaded.scratchpad,
        };
      if (loaded.siteWorkbench)
        state.siteWorkbench = {
          ...state.siteWorkbench,
          ...loaded.siteWorkbench,
        };
      if (loaded.listViews)
        state.listViews = {
          ...state.listViews,
          ...loaded.listViews,
        };

      // Snapshot the loaded state so `resetToLoadedPreferences` still works.
      const { _meta, ...currentPreferences } = state;
      state._meta.loadedPreferences = {
        ...currentPreferences,
      } as UserPreferences;
      // Engine-managed persistence = never "unsaved" from the user's POV.
      state._meta.hasUnsavedChanges = false;
      state._meta.error = null;
    });
  },
});

export const {
  setPreference,
  setModulePreferences,
  resetModulePreferences,
  resetAllPreferences,
  resetToLoadedPreferences,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  reorderFavorites,
  setFavorites,
  clearUnsavedChanges,
  clearError,
} = userPreferencesSlice.actions;

export default userPreferencesSlice.reducer;

// ---- Sync engine policy --------------------------------------------------
//
// `userPreferencesPolicy` makes the slice a first-class citizen of the
// unified sync engine. It:
//   - broadcasts every preference mutation across tabs (<20ms)
//   - debounces writes to IDB + a localStorage `matrx:idbFallback:*` mirror
//   - debounces remote.write upsert into `user_preferences` (250ms — prefs
//     edits are noisy: slider drags, typeahead, etc.)
//   - hydrates from IDB on cold boot, falling back to the localStorage
//     mirror, then `remote.fetch` from Supabase
//   - refreshes in the background after 60s idle to catch edits from other
//     sessions
//
// Replaces: `savePreferencesToDatabase`, `saveModulePreferencesToDatabase`,
// `loadPreferencesFromDatabase` (deleted in this PR). See
// `docs/concepts/full-sync-boardcast-storage/phase-2-plan.md` §6.

const PREFERENCE_MODULE_KEYS: readonly (keyof UserPreferences)[] = [
  "favorites",
  "display",
  "prompts",
  "voice",
  "textToSpeech",
  "assistant",
  "email",
  "videoConference",
  "photoEditing",
  "imageGeneration",
  "textGeneration",
  "coding",
  "sandbox",
  "flashcard",
  "tutor",
  "playground",
  "aiModels",
  "system",
  "messaging",
  "agentContext",
  "agentConnections",
  "mermaid",
  "conversationFilters",
  "mediaDevices",
  "organization",
  "scratchpad",
  "siteWorkbench",
  "listViews",
] as const;

export const userPreferencesPolicy = definePolicy<UserPreferencesState>({
  sliceName: "userPreferences",
  preset: "warm-cache",
  version: 1, // Bump destroys client caches; Phase 6 adds migration hooks.
  broadcast: {
    actions: [
      "userPreferences/setPreference",
      "userPreferences/setModulePreferences",
      "userPreferences/resetModulePreferences",
      "userPreferences/resetAllPreferences",
      "userPreferences/resetToLoadedPreferences",
      "userPreferences/addFavorite",
      "userPreferences/removeFavorite",
      "userPreferences/toggleFavorite",
      "userPreferences/reorderFavorites",
      "userPreferences/setFavorites",
      "userPreferences/clearUnsavedChanges",
      "userPreferences/clearError",
    ],
  },
  // `_meta` intentionally excluded: transient UI/load state (A15).
  partialize: PREFERENCE_MODULE_KEYS,
  staleAfter: 60_000, // background refresh after 1 min idle
  remote: {
    debounceMs: 250, // prefs edits are noisy (typing, slider drags)
    fetch: async ({ identity, signal }) => {
      if (identity.type !== "auth") return null; // guests have no server state
      const { supabase } = await import("@/utils/supabase/client");
      const { data, error } = await supabase
        .schema("users")
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", identity.userId)
        .abortSignal(signal)
        .maybeSingle();
      if (error || !data) return null;
      return data.preferences as Partial<UserPreferencesState>;
    },
    write: async ({ identity, signal, body }) => {
      if (identity.type !== "auth") return; // guests only live in client storage
      const { supabase } = await import("@/utils/supabase/client");
      const { ensureOrgId } = await import("@/lib/organizations/personalOrg");
      await supabase
        .schema("users")
        .from("user_preferences")
        .upsert({
          organization_id: await ensureOrgId(undefined),
          user_id: identity.userId,
          preferences: body,
        })
        .abortSignal(signal);
      void signal; // AbortSignal forwarded via query builder above
    },
  },
});
