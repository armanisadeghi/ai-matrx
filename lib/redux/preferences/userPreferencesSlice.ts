// Deep imports (not the `@/lib/sync` barrel) match the pattern used by
// themeSlice.ts — the barrel re-exports `syncPolicies` from `./registry`,
// which imports `userPreferencesPolicy` back from this file. Routing through
// the barrel creates a runtime initialization cycle under Turbopack/Next
// ("Cannot access 'userPreferencesPolicy' before initialization").
import {
  createSlice,
  current,
  isDraft,
  type PayloadAction,
  type Draft,
} from "@reduxjs/toolkit";
import type { CatalogVoice } from "@/features/audio/service/engines";
import type { TableViewSnapshot } from "@ai-matrx/design-system/data-table";
import { definePolicy } from "@/lib/sync/policies/define";
import { PREFERENCES_ROW_COLUMNS, savePreferencePatch } from "./preferencePatch";
import {
  REHYDRATE_ACTION_TYPE,
  type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";
import {
  REMOTE_FETCH_STATUS_ACTION_TYPE,
  type RemoteFetchStatusAction,
} from "@/lib/sync/engine/remoteFetchStatus";
// Note: the Supabase client is imported lazily inside `remote.fetch`/`remote.write`
// rather than at module load. This keeps unit tests — which mount the slice
// without the browser Supabase env — from blowing up at import time.
import { AIProvider } from "@/lib/ai/aiChat.types";
import type { MatrxRecordId } from "@/types/records";
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
  /**
   * TEMPORARY (agents cutover, remove ~mid-Aug 2026 with /agents/classic and
   * ClassicViewNotice). Per-user so a dismissal on a laptop carries to a phone.
   */
  agentsClassicNoticeDismissed?: boolean;
  /** Markdown Studio: the preview follows every keystroke ("live") or the Update action ("manual"). */
  markdownStudioPreviewUpdates?: "live" | "manual";
  /** Markdown Studio: editor and preview scroll together. */
  markdownStudioScrollSync?: boolean;
  /**
   * THE PERSON'S TIME ZONE (IANA, e.g. "America/Los_Angeles"): the zone every
   * "today" and "now" for this person is read in, and the zone the database's
   * `custom.day_zone` reads first. Captured from the browser while
   * `timeZoneFollowsDevice` is on; never overwritten once the person pins one.
   * "" = nothing saved yet. Read it through `usePersonTimeZone()`, never
   * `Intl.DateTimeFormat().resolvedOptions()` at a call site.
   */
  timeZone?: string;
  /** Default on: the saved zone follows this device. Off = the person pinned `timeZone`. */
  timeZoneFollowsDevice?: boolean;
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

// Text-to-Speech preferences. The voice list is declared ONCE, in the AV engine
// registry (`features/audio/service/engines.ts`) — a voice can never exist in
// the settings picker and not in the synthesis call, or vice versa.
export type CatalogTtsVoice = CatalogVoice;

export interface TextToSpeechPreferences {
  preferredVoice: CatalogTtsVoice;
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
  memoryLevel: number;
  preferredProvider: AIProvider;
  preferredModel: string;
  /**
   * User-layer override for what happens when an agent emits an output
   * directive (create a task / project / note, etc.). Flowed to the backend
   * `UserOverrides.apply_policy` on every turn when not `"default"`.
   */
  directiveApplyPolicy: DirectiveApplyPolicy;
  /**
   * The creator panel above an agent's variables (the agent's creator or a
   * system admin). Saved, so it opens the way the person last left it
   * (Arman, 2026-10-08).
   */
  showCreatorPanel: boolean;
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
  /** The chosen CLASS (`ai.offering` uuid) of `defaultModel` — a model offered
   *  in several classes is several products. null = the preferred class.
   *  Sent as `offering_id` with `model` to POST /images/generate. */
  defaultOfferingId: string | null;
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
   * Reveal the Sandbox in the Canvas the first time the agent works in the
   * bound box — on by default.
   *
   * The sandbox is a canvas content type, not a panel: with this on, the
   * first `shell_execute` / `fs_*` / `git_ingest` of a conversation opens the
   * canvas on the Sandbox pane, the way Claude Code reveals its terminal when
   * it runs a command. With it off, the pane is still added to the canvas
   * switcher — available, never on screen uninvited. Either way the canvas is
   * never hijacked away from a document or the browser the user is reading.
   */
  sandboxCanvasAutoOpen: boolean;
  /**
   * Reveal a record a TOOL just created in the Canvas — on by default.
   *
   * Same courtesy as the sandbox knob, one level up: when a chat tool creates
   * a document (or any other canvas-renderable record), the canvas opens on it
   * the way Claude.ai shows an artifact the moment it is written — but ONLY
   * into a canvas that is showing nothing else. With this off, the record is
   * still added to the canvas switcher: available, never on screen uninvited.
   */
  toolResultCanvasAutoOpen: boolean;
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
 * a sandbox is explicitly created from the sandbox page, Code workspace, or
 * chat picker's "New sandbox" button.
 *
 * Read on both sides — the web bumps `lastSandboxTier` / `lastSandboxTemplate`
 * under `coding` as a 'last used' hint (kept for backward compatibility),
 * but every explicit-create path looks here first.
 */
export interface SandboxPreferences {
  /** Template id the orchestrator will spawn (e.g. "bare", "node-22"). */
  template: string;
  /** "hosted" survives container restart via a per-user Docker volume; "ec2"
   * keeps a retained home per sandbox lifecycle. */
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
  /** When true and `default_git_repo` is set, the "New sandbox" flow triggers
   * the clone. Off by default — opt-in. */
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
  /** Pairs per Match round (useMatchGame clamps it to the deck size). */
  matchPairCount: number;
  /** Questions per Test round; 0 = every card (clamped to the deck). */
  testQuestionCount: number;
  /** Cards per Write round; 0 = every card (clamped to the deck). */
  writeCardCount: number;
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
  /** Models the person switched off in Settings › Models; every user-variant
   *  model picker leaves them out. (The old `activeModels` allow-list, which no
   *  picker ever read, was removed 2026-09-27 and is stripped on load.) */
  inactiveModels: string[];
  newModels: string[];
  /** Starred model ids. Applied only when the model is present in the catalog
   *  (a stale favorite for a removed model is simply ignored). */
  favoriteModels: string[];
}

export interface SystemPreferences {
  viewedAnnouncements: string[]; // Array of announcement IDs that have been viewed
  feedbackFeatureViewCount: number; // Number of times user has seen the new feedback feature highlight
  /** System admins only: show AI costs in dollars instead of points. Ignored
   *  for everyone else (components/cost/useCostDisplay.ts). Default false. */
  showCostInUsd: boolean;
  /** Guided tutorial ids this person finished (features/guided-tutorials). */
  completedTutorials: string[];
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
 * `content.document` rows (type "scratch"); exactly one is ACTIVE
 * at all times and is auto-attached (read-only) to every conversation's agent
 * context — unless empty. Null = none yet; the first open/type creates one.
 */
/**
 * Notes (Arman, 2026-09-27; Write the default 2026-10-07). `defaultEditorMode` is
 * the mode a note opens in on a desktop when the person has not typed in that note
 * before — Write (the one editor) by default; the modes are write · split · plain ·
 * preview. `defaultPhoneEditorMode` is the phone's — Write by default; the phone
 * has write · plain. Picking a mode
 * saves it for that device. `noteModes` remembers, per note, whether the person
 * last typed it in Write ("write") or as text ("plain"), newest last, bounded —
 * a note last edited in Write reopens in Write. Values stored before the one
 * editor are read by `canonicalNoteEditorMode`: wysiwyg → write,
 * markdown-split / split → split.
 */
export interface NotesPreferences {
  defaultEditorMode:
    | "split"
    | "plain"
    | "write"
    | "preview"
    // Read-path aliases for values stored before the one editor (never written now).
    | "wysiwyg"
    | "markdown-split";
  defaultPhoneEditorMode: "plain" | "write";
  noteModes: Record<string, string>;
}

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
  /**
   * Shape version of the surface's declared defaults. When a surface adds or
   * removes columns it bumps its version, and any stored blob from an older
   * version is re-seeded from the new defaults instead of silently winning.
   *
   * Without this, a user who has ANY stored blob keeps `hiddenColumns: []`
   * forever, so every column a later release adds arrives switched ON — the
   * shape-change-without-backfill failure this codebase has hit before.
   */
  version: number;
  /** "table" is the canonical default for every list surface. */
  view: "table" | "cards" | "rows";
  density: "compact" | "comfortable";
  /**
   * Column id to order by. Deliberately a free string, not a closed union:
   * every column a surface declares is sortable (app policy), so the valid set
   * is the surface's column registry, not a list duplicated here. The server
   * whitelists it and falls back rather than erroring, so a stale stored value
   * can never break a page.
   */
  sort: string;
  direction: "asc" | "desc";
  /**
   * Pin favorites above every other row, in EVERY sort. On by default: what
   * you starred is what you reach for, and burying it under 400 rows sorted
   * A-Z is how a favorites feature stops being used.
   */
  favoritesFirst: boolean;
  pageSize: number;
  /** Column ids the user switched OFF. Absent id = visible. */
  hiddenColumns: string[];
  /**
   * The views the person made with the table's "+" — named, and kept here so a
   * reload keeps them (page-pass 2026-09-27: they lived in memory only). The
   * snapshot is the table's own view shape (`TableViewSnapshot`), stored as
   * data; the table validates it when it applies one.
   */
  savedViews?: SavedListView[];
  /**
   * Columns the person explicitly SHOWED — an auto-hidden uniform column
   * (`EntityListConfig.autoHideUniformColumns`) never hides one of these again.
   */
  shownColumns?: string[];
  /**
   * The column order the person dragged into place. Absent = the surface's
   * declared order — the same in every lane (list-shell fix D, 2026-09-28: the
   * order used to be whatever the FIRST lane opened showed, with the rest
   * appended).
   */
  columnOrder?: string[];
}

export interface SavedListView {
  id: string;
  label: string;
  snapshot: TableViewSnapshot;
}

/**
 * Keyed by list surface (e.g. "agents-browse"). Every list surface that adopts
 * the canonical entry-list shell gets one entry here, so a user's list-style
 * choices are one synced blob instead of N localStorage keys.
 */
export type ListViewsPreferences = Record<string, ListViewPrefs>;

/**
 * Cross-surface list behaviour — the QUERY half, not the per-surface STYLE
 * half that `listViews` holds.
 *
 * `archivedDefault` is THE ARCHIVED-ITEMS LAW's knob
 * (../common-docs/policies/archived-items.md §6): the law fixes the PLATFORM
 * default at "hide archived" and puts the reveal one or two clicks away, and
 * this preference lets a person who lives in their archive flip their own
 * starting point without any surface hardcoding taste. It seeds a list's
 * INITIAL query only — an explicit choice on the surface, and a value carried
 * in the URL, always win, so a shared link never re-narrows for the recipient.
 */
export interface ListsPreferences {
  /** "active" hides archived rows on arrival (platform default); "all" shows them. */
  archivedDefault: "active" | "all";
  /**
   * The data home's starred rows (`DataHomeRow.id`), newest first, capped at DATA_HOME_STAR_CAP in
   * features/unified-data/home/useDataHomeMarks.ts. A person's own mark: it never narrows by the
   * active organization (DATA-HOME-3-SPEC §2.4, decision D2).
   */
  dataHomeStarred?: string[];
  /** The data home's last opened rows (`DataHomeRow.id`), newest first, at most ten. */
  dataHomeRecent?: string[];
  /**
   * The data home's "Show platform tables" (Filters): also list the tables the app keeps — a choice
   * column's Lists, an agent's outputs. A person's own choice; absent = off.
   */
  dataHomeShowPlatformTables?: boolean;
}

/**
 * Assists (the AI chips) — where the dock sits, and whether the user has told
 * the whole system to be quiet for a while.
 *
 * `quietUntil` is not a rendering flag: client-side producers read it and stop
 * emitting, because a suggestion nobody will read costs real money to compute.
 * Values are ISO timestamps, `"infinity"` for "until I turn it back on", or
 * null for "not quiet" — the vocabulary lives in `features/assists/quiet.ts`.
 */
export interface AssistsPreferences {
  /** Offset from the bottom-right corner, or null for the default corner. */
  dockPosition: { right: number; bottom: number } | null;
  /** ISO timestamp, `"infinity"`, or null. */
  quietUntil: string | null;
  /** The three scarce ambient slots pinned for one presentation cycle. */
  presentationCycle: {
    startedAt: string;
    assistIds: string[];
  } | null;
}

/**
 * Connectors — the person's own answers about the connector prompt card.
 *
 * `promptDismissedAt` is keyed by PROVIDER id (`"google"`, and every provider
 * after it) and holds the ISO timestamp of the dismissal, not a boolean: the
 * `connectors.prompt.resurface_days` knob decides whether an organization ever
 * brings the card back, and it needs to know WHEN it was dismissed. Default 0
 * means never — a dismissal is final unless an organization says otherwise.
 *
 * It lives here rather than in `localStorage` because a person who says "not
 * now" on their laptop has said it on their phone too.
 */
export interface ConnectorsPreferences {
  promptDismissedAt: Record<string, string>;
}

/**
 * THE REVERSIBLE ACTION's memory of this person (`lib/reversible`, `@ai-matrx/kit/reversible`):
 * how many times each reversible verb succeeded (`archive` → 7) and each verb on each kind of thing
 * (`archive:table` → 2). It decides how loud the next Undo announcement is — taught the first time,
 * guided the next few, plain after — and it is synced, so a person taught on their laptop is not
 * taught again on their phone. Undo never lowers it. Shape = kit's `ReversibleCounts`.
 */
/**
 * The bell's memory of this person (features/notifications), synced so it follows them to every
 * device. Notices carry their own server-side `seen_at`; these are for the bell's SOURCES (approvals,
 * record-store work, workflows waiting …), which have no "seen" of their own:
 *   - `sourcesSeen` / `sourcesSeenIds`       — each place's count (and item ids, where it has them)
 *     when the bell was last opened; the badge counts what is new since
 *   - `sourcesCleared` / `sourcesClearedIds` — the same, when the person last cleared the place
 *   - `hiddenSources` — places the person took out of the bell ("Hide from bell"); default none
 * Marks move only on open or clear (features/notifications/badge.ts).
 */
export interface InboxPreferences {
  sourcesSeen: Record<string, number>;
  sourcesSeenIds: Record<string, string[]>;
  sourcesCleared: Record<string, number>;
  sourcesClearedIds: Record<string, string[]>;
  hiddenSources: string[];
}

export interface ReversiblePreferences {
  verbs: Record<string, number>;
  pairs: Record<string, number>;
}

export interface OrganizationPreferences {
  /**
   * "Switch organization when a link asks" — DEFAULT ON.
   *
   * Every deep link the platform emits carries `?org=<uuid>` naming the
   * organization the destination is filed under
   * (`lib/organizations/linkOrganization.ts`). With this on, following such a
   * link puts this session in that organization so the thing the link names
   * actually renders; the move is announced whenever it changes the
   * organization the person was working in. With it off, a link that would
   * MOVE them says so in words and offers the switch as an explicit click
   * instead.
   *
   * 🚨 It never governs a link's organization when the person is working in
   * NO organization: there is no switch to refuse there, and the alternative
   * is the "Select an organization first" dead end this whole rung exists to
   * end. And it is not a preselected organization preference — nothing reads it to
   * CHOOSE an organization; it only decides whether a link that already named
   * one is obeyed.
   */
  switchWhenALinkAsks: boolean;
}

export type ThinkingMode = "none" | "simple" | "deep";

export interface PromptsPreferences {
  showSettingsOnMainPage: boolean;
  /**
   * RETIRED 2026-09-12 (Unified Settings Platform): the default model for
   * basic work is the knob `agents.model_prefs.chat_default_model`
   * (`features/ai-models/preferredChatModel.ts`), resolved org → user →
   * device. No screen writes this field and no runtime reads it; it stays in
   * the persisted shape only until `users.normalize_preferences_jsonb` and
   * the drift check drop the key in one migration. Keep it null.
   */
  defaultModel: string | null;
  defaultTemperature: number; // 0-2 in 0.01 increments
  alwaysIncludeInternalWebSearch: boolean;
  includeThinkingInAutoPrompts: ThinkingMode;
  submitOnEnter: boolean;
  autoClearResponsesInEditMode: boolean;
  /**
   * Keep a typed-but-unsent composer message through a reload and put it back,
   * per conversation. Default ON — never losing user input is table stakes
   * (`common-docs/policies/talk-to-arman-like-a-person.md`); the knob
   * exists for shared or kiosk-ish machines where a draft left in the tab's
   * storage is unwanted. Read through `isDraftRestoreEnabled`, which treats a
   * MISSING key as ON so the default never depends on a preferences backfill.
   * Machinery: `features/agents/redux/execution-system/instance-user-input/
   * composer-draft-store.ts`.
   */
  restoreUnsentDrafts: boolean;
  /**
   * Prompt-fix suggestions the person dismissed (rich-editor `PromptFixReview`), by the text they
   * belong to (`agent:<id>:system`, `agent:<id>:message:<n>`) → the dismissed fix ids. Kept in
   * preferences so a dismissal follows the person across browsers; a key is dropped when its
   * last dismissal is forgotten (the fix is no longer suggested).
   */
  dismissedPromptFixes: Record<string, string[]>;
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
  import("@ai-matrx/rich-content/mermaid/types").MermaidOptionPreferences;

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
  /**
   * The viewer's lane toggles (chat | matrx | auto | plugin | subagent) — one
   * choice for every filterable history surface. Absent = never chosen → the
   * default (chat + matrx); `[]` = every lane off. Read through
   * `normalizeLanes` (features/agents/redux/conversation-history/lanes.ts).
   */
  lanes?: string[];
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
  notes: NotesPreferences;
  siteWorkbench: SiteWorkbenchPreferences;
  listViews: ListViewsPreferences;
  lists: ListsPreferences;
  assists: AssistsPreferences;
  connectors: ConnectorsPreferences;
  reversible: ReversiblePreferences;
  inbox: InboxPreferences;
}

/**
 * Whether the person's SAVED preferences are what the slice holds.
 *   - `loading` — not yet: the slice holds built-in defaults
 *   - `loaded`  — a saved record (cache or server) landed, or the source
 *                 answered that there is none (so the defaults ARE the answer)
 *   - `failed`  — the read failed and nothing saved has landed: the defaults
 *                 on screen are NOT the person's settings
 * Set only by the sync engine's load outcomes (REHYDRATE and
 * `sync/remoteFetchStatus`) — see the extraReducers below.
 */
export type PreferencesLoadStatus = "loading" | "loaded" | "failed";

// Add state interface for async operations
export interface UserPreferencesState extends UserPreferences {
  _meta: {
    isLoading: boolean;
    /** Load status of the person's saved preferences (see PreferencesLoadStatus). */
    loadStatus: PreferencesLoadStatus;
    /** Why the last load of the saved preferences failed; null once a load succeeds. */
    error: string | null;
    lastSaved: string | null;
    hasUnsavedChanges: boolean;
    loadedPreferences: UserPreferences | null; // Store original loaded state for reset
    /**
     * Edits made while the saved record had NOT loaded. They show on screen
     * at once, but are never persisted then (the policy's `persistWhen`
     * holds every write) — persisting would put the defaults under them
     * over the saved record. When the record loads they are replayed on top
     * of it, and the merged result is saved (`persistAfterLoad`).
     */
    pendingEdits: PendingPreferenceEdit[];
    /** True right after a load replayed `pendingEdits` — the engine saves once. */
    unsavedAfterLoad: boolean;
  };
}

/** One held edit: which edit reducer, with the payload it was dispatched with. */
export interface PendingPreferenceEdit {
  reducer: PreferenceEditName;
  payload: unknown;
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
    (VideoConferencePreferences & { defaultCamera?: unknown }) | undefined;
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
    dropped.push(
      "videoConference.defaultCamera (placeholder enum, no mapping)",
    );
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
  "prompts" | "aiModels" | "textGeneration" | "imageGeneration";

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
  out = stripRetiredActiveModels(out);
  return out;
}

/**
 * 2026-09-27: `aiModels.activeModels` was an allow-list no model picker ever
 * read (Settings › Models said "0 active" while every model was offered).
 * The one real list is `inactiveModels` (hidden from pickers). Mirrored in
 * `users.normalize_preferences_jsonb`.
 */
export function stripRetiredActiveModels(
  loaded: Partial<UserPreferences>,
): Partial<UserPreferences> {
  const aiModels = loaded.aiModels as (Partial<AiModelsPreferences> & { activeModels?: unknown }) | undefined;
  if (!aiModels || !("activeModels" in aiModels)) return loaded;
  const { activeModels: _retired, ...rest } = aiModels;
  return { ...loaded, aiModels: rest as AiModelsPreferences };
}

/**
 * Model picker stars are dual-homed: UES is the ledger, this array is the
 * instant cache. A remote preferences fetch is last-write-wins on the whole
 * JSON blob — a stale `favoriteModels: []` used to replace in-session stars
 * after `staleAfter`. Union incoming with what's already painted so a hollow
 * blob cannot unstar.
 */
function mergeFavoriteModelIds(
  incoming: string[] | undefined,
  current: string[] | undefined,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...(incoming ?? []), ...(current ?? [])]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

// Helper function to ensure preferences have the proper structure
export const initializeUserPreferencesState = (
  rawPreferences: Partial<UserPreferences> = {},
  setAsLoaded: boolean = false,
): UserPreferencesState => {
  // Callers pass PERSISTED data here (store bootstrap / SSR-loaded rows) —
  // a load boundary, so every known legacy shape drift is normalized.
  const preferences = sanitizeLoadedPreferences(rawPreferences);
  const defaultMeta: UserPreferencesState["_meta"] = {
    isLoading: false,
    // Store construction holds DEFAULTS, never the person's saved record —
    // even when `setAsLoaded` snapshots them for reset. Only the sync
    // engine's load outcome moves this.
    loadStatus: "loading",
    error: null,
    lastSaved: null,
    hasUnsavedChanges: false,
    loadedPreferences: null,
    pendingEdits: [],
    unsavedAfterLoad: false,
  };

  const defaultPreferences: UserPreferences = {
    favorites: {
      items: [],
    },
    display: {
      markdownStudioPreviewUpdates: "live",
      markdownStudioScrollSync: true,
      timeZone: "",
      timeZoneFollowsDevice: true,
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
      restoreUnsentDrafts: true,
      dismissedPromptFixes: {},
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
      matchPairCount: 8,
      testQuestionCount: 20,
      writeCardCount: 10,
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
      memoryLevel: 0,
      preferredProvider: "default",
      preferredModel: "default",
      directiveApplyPolicy: "default",
      showCreatorPanel: false,
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
      defaultOfferingId: null,
      resolution: "1080p",
      style: "",
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
      sandboxCanvasAutoOpen: true,
      toolResultCanvasAutoOpen: true,
    },
    sandbox: {
      // "slim" = the full coding env without aidream-built-in. Matches what
      // the Sandbox admin page's "New sandbox" button creates by default
      // and is the template every explicit sandbox-create flow uses.
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
      inactiveModels: [],
      newModels: [],
      favoriteModels: [],
    },
    system: {
      viewedAnnouncements: [],
      feedbackFeatureViewCount: 0,
      showCostInUsd: false,
      completedTutorials: [],
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
      // Default ON: a link that names an organization is obeyed.
      switchWhenALinkAsks: true,
    },
    scratchpad: {
      // null = no scratchpad yet; the first open/type creates + activates one.
      activeId: null,
    },
    notes: {
      defaultEditorMode: "write",
      defaultPhoneEditorMode: "write",
      noteModes: {},
    },
    siteWorkbench: {
      bookmarks: [],
    },
    // Empty = every list surface falls back to its own declared defaults
    // (lib/list-views/defaults.ts). Keep in sync with defaultUserPreferences.ts.
    listViews: {},
    lists: { archivedDefault: "active" },
    assists: {
      // null = the default bottom-right corner; the user has not dragged it.
      dockPosition: null,
      quietUntil: null,
      presentationCycle: null,
    },
    // Keyed by provider id; absent = the connector card was never dismissed.
    connectors: { promptDismissedAt: {} },
    // Nothing done yet: the first reversible action teaches.
    reversible: { verbs: {}, pairs: {} },
    // Nothing seen, cleared or hidden yet: every source shows in the bell.
    inbox: { sourcesSeen: {}, sourcesSeenIds: {}, sourcesCleared: {}, sourcesClearedIds: {}, hiddenSources: [] },
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
    aiModels: {
      ...defaultPreferences.aiModels,
      ...preferences.aiModels,
      favoriteModels: mergeFavoriteModelIds(
        preferences.aiModels?.favoriteModels,
        defaultPreferences.aiModels.favoriteModels,
      ),
    },
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
    notes: {
      ...defaultPreferences.notes,
      ...preferences.notes,
    },
    siteWorkbench: {
      ...defaultPreferences.siteWorkbench,
      ...preferences.siteWorkbench,
    },
    lists: { ...defaultPreferences.lists, ...preferences.lists },
    listViews: {
      ...defaultPreferences.listViews,
      ...preferences.listViews,
    },
    assists: {
      ...defaultPreferences.assists,
      ...preferences.assists,
    },
    connectors: {
      ...defaultPreferences.connectors,
      ...preferences.connectors,
    },
    reversible: {
      verbs: { ...defaultPreferences.reversible.verbs, ...preferences.reversible?.verbs },
      pairs: { ...defaultPreferences.reversible.pairs, ...preferences.reversible?.pairs },
    },
    inbox: {
      sourcesSeen: { ...preferences.inbox?.sourcesSeen },
      sourcesSeenIds: { ...preferences.inbox?.sourcesSeenIds },
      sourcesCleared: { ...preferences.inbox?.sourcesCleared },
      sourcesClearedIds: { ...preferences.inbox?.sourcesClearedIds },
      hiddenSources: [...(preferences.inbox?.hiddenSources ?? [])],
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

/**
 * Every reducer that EDITS the person's preferences. Kept outside
 * `createSlice` so an edit held while the saved record had not loaded can be
 * replayed through the very same reducer once it does (`replayPendingEdits`).
 */
const preferenceEditReducers = {
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
    // `_meta.error` is the LOAD failure (see extraReducers) — an edit does
    // not make a failed read succeed, so edits never clear it.
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
  },
  // Resetting the person's CHOICES must not forget whether their saved
  // record ever loaded — the load status belongs to the read, not the values.
  // Mutates (rather than returning a fresh state) so a held reset can be
  // replayed on top of the loaded record like every other edit.
  resetAllPreferences: (state: Draft<UserPreferencesState>) => {
    const fresh = initializeUserPreferencesState();
    Object.assign(state, { ...fresh, _meta: state._meta });
    state._meta.loadedPreferences = null;
    state._meta.hasUnsavedChanges = false;
    state._meta.lastSaved = null;
  },
  resetToLoadedPreferences: (state: Draft<UserPreferencesState>) => {
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
      state.notes = {
        ...state._meta.loadedPreferences.notes,
      };
      state.siteWorkbench = {
        ...state._meta.loadedPreferences.siteWorkbench,
      };
      state.listViews = {
        ...state._meta.loadedPreferences.listViews,
      };
      state.lists = {
        ...state._meta.loadedPreferences.lists,
      };
      state._meta.hasUnsavedChanges = false;
    }
  },
  // ── Favorites / pinning ────────────────────────────────────────────────
  // Dedupe + cap live HERE (single source of truth) so every callsite —
  // dashboard PinButton, sidebar, future surfaces — gets identical behavior.
  addFavorite: (
    state: Draft<UserPreferencesState>,
    action: PayloadAction<FavoriteItem>,
  ) => {
    const item = action.payload;
    const next = state.favorites.items.filter((f) => f.id !== item.id);
    next.unshift(item); // newest first
    state.favorites.items = next.slice(0, FAVORITES_MAX);
  },
  removeFavorite: (
    state: Draft<UserPreferencesState>,
    action: PayloadAction<string>,
  ) => {
    state.favorites.items = state.favorites.items.filter(
      (f) => f.id !== action.payload,
    );
  },
  toggleFavorite: (
    state: Draft<UserPreferencesState>,
    action: PayloadAction<FavoriteItem>,
  ) => {
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
  },
  reorderFavorites: (
    state: Draft<UserPreferencesState>,
    action: PayloadAction<string[]>,
  ) => {
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
  },
  setFavorites: (
    state: Draft<UserPreferencesState>,
    action: PayloadAction<FavoriteItem[]>,
  ) => {
    state.favorites.items = action.payload.slice(0, FAVORITES_MAX);
  },
};

export type PreferenceEditName = keyof typeof preferenceEditReducers;

type EditReducer = (
  state: Draft<UserPreferencesState>,
  action: PayloadAction<never>,
) => void;

/** `userPreferences/<edit>` → the edit reducer's name. */
const PREFERENCE_EDIT_BY_TYPE = new Map<string, PreferenceEditName>(
  (Object.keys(preferenceEditReducers) as PreferenceEditName[]).map((name) => [
    `userPreferences/${name}`,
    name,
  ]),
);

/**
 * Replay the edits held while the saved record had not loaded, on top of the
 * record that just landed. Returns how many were replayed.
 */
function replayPendingEdits(state: Draft<UserPreferencesState>): number {
  const pending = state._meta.pendingEdits;
  const held = isDraft(pending) ? current(pending) : pending;
  state._meta.pendingEdits = [];
  for (const edit of held) {
    const reduce: EditReducer = preferenceEditReducers[edit.reducer];
    reduce(state, {
      type: `userPreferences/${edit.reducer}`,
      payload: edit.payload as never,
    });
  }
  return held.length;
}

const userPreferencesSlice = createSlice({
  name: "userPreferences",
  initialState: initializeUserPreferencesState(),
  reducers: {
    ...preferenceEditReducers,
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

      // EVERY MODULE LOADS, BY CONSTRUCTION (2026-10-02). This merge used to name its modules one by
      // one, and three had been left out — `assists`, `connectors` and `reversible`: each was saved
      // and then never read back, so a person's dock position, "not now" on the connector card and
      // reversible-action history all came back as defaults on every load (the reversible action
      // taught the same person "first time" on every visit). It walks the one persisted-module
      // record now, the same one the engine saves, so a module cannot be saved and not loaded.
      for (const key of PREFERENCE_MODULE_KEYS) {
        const incoming = loaded[key];
        if (!incoming) continue;
        if (key === "aiModels") {
          const models = incoming as UserPreferences["aiModels"];
          state.aiModels = {
            ...state.aiModels,
            ...models,
            favoriteModels: mergeFavoriteModelIds(
              models.favoriteModels,
              state.aiModels.favoriteModels,
            ),
          };
          continue;
        }
        (state as unknown as Record<string, unknown>)[key] = {
          ...(state[key] as object),
          ...(incoming as object),
        };
      }

      // Snapshot the loaded state so `resetToLoadedPreferences` still works —
      // and so the sync engine's write base (`remote.baseline`) is the record
      // WITHOUT the held edits replayed below. `current()`, never the draft:
      // a shallow copy of the draft shares its module objects, so an edit
      // replayed in place (`state.favorites.items = …`) rewrote the snapshot
      // too and that edit then read as "unchanged" and was never saved.
      const { _meta, ...currentPreferences } = current(state);
      state._meta.loadedPreferences = {
        ...currentPreferences,
      } as UserPreferences;
      // Engine-managed persistence = never "unsaved" from the user's POV.
      state._meta.hasUnsavedChanges = false;
      // The person's saved record is what the slice now holds.
      state._meta.loadStatus = "loaded";
      state._meta.error = null;
      // Edits made before it landed go on top of the REAL record now, and the
      // engine saves the merged result once (policy.persistAfterLoad).
      state._meta.unsavedAfterLoad = replayPendingEdits(state) > 0;
    });
    // The engine's load outcomes for this slice (lib/sync/engine/remoteFetchStatus.ts).
    // Success is the REHYDRATE above; these are the other three answers.
    builder.addCase(
      REMOTE_FETCH_STATUS_ACTION_TYPE,
      (state, action: RemoteFetchStatusAction) => {
        const { sliceName, phase, reason, error } = action.payload;
        if (sliceName !== "userPreferences") return;
        state._meta.unsavedAfterLoad = false;
        if (phase === "started") {
          // A background refresh over a loaded record changes nothing on
          // screen; a cold-boot fetch or a retry means the saved record is
          // not here yet.
          if (reason !== "stale-refresh" || state._meta.loadStatus !== "loaded") {
            state._meta.loadStatus = "loading";
          }
          return;
        }
        if (phase === "empty") {
          // The source answered: there is no saved record, so the defaults
          // ARE this person's preferences — and any edits held until now
          // (already applied on top of them) are saved once.
          state._meta.loadStatus = "loaded";
          state._meta.error = null;
          state._meta.unsavedAfterLoad = state._meta.pendingEdits.length > 0;
          state._meta.pendingEdits = [];
          return;
        }
        // failed — say why. A record that already loaded stays (still true,
        // just not re-confirmed); otherwise the defaults on screen are NOT
        // the person's settings, and the status says so.
        state._meta.error = error ?? "Your saved preferences could not be loaded.";
        if (state._meta.loadStatus !== "loaded") {
          state._meta.loadStatus = "failed";
        }
      },
    );
    // HOLD every edit made before the saved record loaded (runs after the
    // edit's own case reducer, so the edit is already on screen).
    builder.addMatcher(
      (action): action is PayloadAction<unknown> =>
        PREFERENCE_EDIT_BY_TYPE.has(action.type),
      (state, action) => {
        if (state._meta.loadStatus === "loaded") return;
        const reducer = PREFERENCE_EDIT_BY_TYPE.get(action.type);
        if (reducer) state._meta.pendingEdits.push({ reducer, payload: action.payload });
      },
    );
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

/**
 * EVERY MODULE IS PERSISTED, BY CONSTRUCTION. A module missing from this list is written to Redux
 * and persisted NOWHERE — the choice survives until the next page load and then silently reverts,
 * which is what happened to `lists` on 2026-09-09 and to `connectors` (the connector card's "not
 * now") until 2026-10-02. The record below is typed over EVERY key of `UserPreferences`, so a new
 * module that is not listed here is a type error, not a silent revert.
 */
const PERSISTED_PREFERENCE_MODULES: Record<keyof UserPreferences, true> = {
  favorites: true,
  display: true,
  prompts: true,
  voice: true,
  textToSpeech: true,
  assistant: true,
  email: true,
  videoConference: true,
  photoEditing: true,
  imageGeneration: true,
  textGeneration: true,
  coding: true,
  sandbox: true,
  flashcard: true,
  tutor: true,
  playground: true,
  aiModels: true,
  system: true,
  messaging: true,
  agentContext: true,
  agentConnections: true,
  mermaid: true,
  conversationFilters: true,
  mediaDevices: true,
  organization: true,
  scratchpad: true,
  notes: true,
  siteWorkbench: true,
  listViews: true,
  lists: true,
  assists: true,
  connectors: true,
  reversible: true,
  inbox: true,
};

const PREFERENCE_MODULE_KEYS = Object.keys(
  PERSISTED_PREFERENCE_MODULES,
) as readonly (keyof UserPreferences)[];

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
  // The persisted body is the WHOLE record, so nothing is stored until the
  // saved record has loaded — a write before that would put the defaults
  // over it. Edits made meanwhile are held in `_meta.pendingEdits`, replayed
  // on the loaded record, and saved once (`persistAfterLoad`).
  persistWhen: (state) => state._meta.loadStatus === "loaded",
  // Every save is a per-key merge (see `remote.write`), so a tab reconciles
  // with the server the moment it boots and whenever the person comes back
  // to it — never showing a stale cache for a minute, never saving on one.
  persistAfterLoad: (state) => state._meta.unsavedAfterLoad === true,
  staleAfter: 60_000, // background refresh after 1 min idle
  remote: {
    debounceMs: 250, // prefs edits are noisy (typing, slider drags)
    revalidateOnBoot: true,
    revalidateOnFocus: true,
    // The record as the server held it at the last load — BEFORE any held
    // edits were replayed onto it, so those edits read as changes and are
    // saved. No record loaded yet (the server said "none") = the defaults.
    baseline: (state) => {
      const loaded = state._meta.loadedPreferences;
      const source: Record<string, unknown> = loaded
        ? (loaded as unknown as Record<string, unknown>)
        : (initializeUserPreferencesState() as unknown as Record<string, unknown>);
      const base: Record<string, unknown> = {};
      for (const key of PREFERENCE_MODULE_KEYS) base[key] = source[key];
      return base;
    },
    fetch: async ({ identity, signal }) => {
      if (identity.type !== "auth") return null; // guests have no server state
      // One shared read of the account row (SHELL-DEDUPE): the load ladder takes its two
      // organization columns from the same answer instead of asking again.
      const { readAccountPreferencesRow } = await import("@/lib/account/accountPreferencesRow");
      const { data, error } = await readAccountPreferencesRow(identity.userId);
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      // A failed read THROWS — the engine turns that into the slice's
      // `failed` load status. Returning null here used to make a failure look
      // exactly like "this person saved nothing", and every settings page
      // then rendered the defaults as their settings.
      if (error) throw error;
      if (!data) return null;
      return data.preferences as Partial<UserPreferencesState>;
    },
    write: async ({ identity, signal, body, base }) => {
      if (identity.type !== "auth") return; // guests only live in client storage
      const { supabase } = await import("@/utils/supabase/client");
      // `users.user_preferences` is a user-global singleton (PK = user_id),
      // created at signup together with the person's first organization, and
      // it keeps the organization it was filed under. So a write UPDATES the
      // existing row and never chooses an organization for it — the selected
      // workspace org is unrelated here and can fail RLS when the user is
      // working in HR.
      //
      // 🚨 A save sends ONLY what this tab changed (body − base), merged into
      // the CURRENT row under compare-and-swap on `version`. Never
      // `update({ preferences: body })`: that put a stale tab's whole cached
      // record back over every newer change (2026-09-27, an agent's
      // preselected organization write reverted 15s later). Guard:
      // lib/redux/preferences/__tests__/preference-writes-never-clobber.test.ts
      const table = () => supabase.schema("users").from("user_preferences");
      // The row changed (or may have): the next shared read of it asks the database again.
      const { forgetAccountPreferencesRow } = await import("@/lib/account/accountPreferencesRow");
      try {
        await savePreferencePatch({
          base,
          body,
          modules: PREFERENCE_MODULE_KEYS,
          fetchCurrent: () =>
            table()
              .select(PREFERENCES_ROW_COLUMNS)
              .eq("user_id", identity.userId)
              .abortSignal(signal)
              .maybeSingle(),
          applyUpdate: ({ value, expectedVersion, nextVersion }) =>
            table()
              .update({ preferences: value, version: nextVersion })
              .eq("user_id", identity.userId)
              .eq("version", expectedVersion)
              .select(PREFERENCES_ROW_COLUMNS)
              .abortSignal(signal)
              .maybeSingle(),
        });
      } finally {
        forgetAccountPreferencesRow();
      }
    },
  },
});
