// Deep imports (not the `@/lib/sync` barrel) match the pattern used by
// themeSlice.ts — the barrel re-exports `syncPolicies` from `./registry`,
// which imports `userPreferencesPolicy` back from this file. Routing through
// the barrel creates a runtime initialization cycle under Turbopack/Next
// ("Cannot access 'userPreferencesPolicy' before initialization").
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { definePolicy } from "@/lib/sync/policies/define";
import {
  REHYDRATE_ACTION_TYPE,
  type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";
// Note: the Supabase client is imported lazily inside `remote.fetch`/`remote.write`
// rather than at module load. This keeps unit tests — which mount the slice
// without the browser Supabase env — from blowing up at import time.
import { AIProvider } from "@/lib/ai/aiChat.types";
import { MatrxRecordId } from "@/types/entityTypes";

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

// Text-to-Speech preferences (Groq PlayAI TTS) - separate from Voice service
export type GroqTtsVoice =
  | "Arista-PlayAI"
  | "Atlas-PlayAI"
  | "Basil-PlayAI"
  | "Briggs-PlayAI"
  | "Calum-PlayAI"
  | "Celeste-PlayAI"
  | "Cheyenne-PlayAI"
  | "Chip-PlayAI"
  | "Cillian-PlayAI"
  | "Deedee-PlayAI"
  | "Fritz-PlayAI"
  | "Gail-PlayAI"
  | "Indigo-PlayAI"
  | "Mamaw-PlayAI"
  | "Mason-PlayAI"
  | "Mikail-PlayAI"
  | "Mitch-PlayAI"
  | "Quinn-PlayAI"
  | "Thunder-PlayAI";

export interface TextToSpeechPreferences {
  preferredVoice: GroqTtsVoice;
  autoPlay: boolean;
  processMarkdown: boolean;
}

export interface AssistantPreferences {
  alwaysActive: boolean;
  alwaysWatching: boolean;
  useAudio: boolean;
  name: string;
  isPersonal: boolean;
  memoryLevel: number;
  preferredProvider: AIProvider;
  preferredModel: string;
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
export interface VideoConferencePreferences {
  background: string;
  filter: string;
  defaultCamera: string;
  defaultMicrophone: string;
  defaultSpeaker: string;
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
  defaultModel: string;
  resolution: string;
  style: string;
  useAiEnhancements: boolean;
  colorPalette: string;
}

export interface TextGenerationPreferences {
  defaultModel: string;
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

export interface PlaygroundPreferences {
  lastRecipeId: MatrxRecordId;
  preferredProvider: MatrxRecordId;
  preferredModel: MatrxRecordId;
  preferredEndpoint: MatrxRecordId;
}

export interface AiModelsPreferences {
  defaultModel: string;
  activeModels: string[];
  inactiveModels: string[];
  newModels: string[];
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

export type ThinkingMode = "none" | "simple" | "deep";

export interface PromptsPreferences {
  showSettingsOnMainPage: boolean;
  defaultModel: string; // ID of the default model from active models
  defaultTemperature: number; // 0-2 in 0.01 increments
  alwaysIncludeInternalWebSearch: boolean;
  includeThinkingInAutoPrompts: ThinkingMode;
  submitOnEnter: boolean;
  autoClearResponsesInEditMode: boolean;
}

/**
 * One user-defined transcription cleaner agent. Mirrors
 * `AiPostProcessAgent` so the Transcription Cleanup pad can drop these
 * straight into its agent picker alongside the system-owned agents in
 * `ai-agents.ts`.
 */
export interface CustomCleanerAgent {
  /** Agent UUID (must exist in the agents system). */
  id: string;
  /** Label shown in the picker. */
  displayName: string;
  /** Variable key on the agent that should receive the transcript. */
  transcriptVariableKey: string;
  /** Optional context slot key for slot-based agents. */
  contextSlotKey?: string;
  /** Optional context variable key for variable-based agents. */
  contextVariableKey?: string;
}

export interface TranscriptionPreferences {
  /** User-added cleaner agents merged into the Transcription Cleanup picker. */
  customCleanerAgents: CustomCleanerAgent[];
  /**
   * User-wide default agent for the Scribe audio assistant. Null → fall back to
   * the seeded AUDIO_ASSISTANT_AGENT_ID. Per-session choices override this.
   */
  scribeAssistantAgentId: string | null;
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
export type MermaidPreferences = import("@/components/mermaid/types").MermaidOptionPreferences;

// Combine all module preferences into one interface
export interface UserPreferences {
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
  playground: PlaygroundPreferences;
  aiModels: AiModelsPreferences;
  system: SystemPreferences;
  messaging: MessagingPreferences;
  agentContext: AgentContextPreferences;
  transcription: TranscriptionPreferences;
  agentConnections: AgentConnectionsPreferences;
  mermaid: MermaidPreferences;
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

// Helper function to ensure preferences have the proper structure
export const initializeUserPreferencesState = (
  preferences: Partial<UserPreferences> = {},
  setAsLoaded: boolean = false,
): UserPreferencesState => {
  const defaultMeta = {
    isLoading: false,
    error: null,
    lastSaved: null,
    hasUnsavedChanges: false,
    loadedPreferences: null as UserPreferences | null,
  };

  const defaultPreferences: UserPreferences = {
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
      defaultModel: "548126f2-714a-4562-9001-0c31cbeea375", // GPT-4.1 Mini
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
      preferredVoice: "Cheyenne-PlayAI",
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
    assistant: {
      alwaysActive: false,
      alwaysWatching: false,
      useAudio: false,
      name: "Assistant",
      isPersonal: false,
      memoryLevel: 0,
      preferredProvider: "default",
      preferredModel: "default",
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
      defaultCamera: "default",
      defaultMicrophone: "default",
      defaultSpeaker: "default",
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
      defaultModel: "standard",
      resolution: "1080p",
      style: "realistic",
      useAiEnhancements: true,
      colorPalette: "vibrant",
    },
    textGeneration: {
      defaultModel: "GPT-4o",
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
      defaultModel: "548126f2-714a-4562-9001-0c31cbeea375", // GPT-4.1 Mini
      activeModels: [],
      inactiveModels: [],
      newModels: [],
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
    transcription: {
      customCleanerAgents: [],
      scribeAssistantAgentId: null,
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
  };

  // Merge with defaults to ensure all properties exist
  const mergedPreferences: UserPreferences = {
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
    playground: { ...defaultPreferences.playground, ...preferences.playground },
    aiModels: { ...defaultPreferences.aiModels, ...preferences.aiModels },
    system: { ...defaultPreferences.system, ...preferences.system },
    messaging: { ...defaultPreferences.messaging, ...preferences.messaging },
    agentContext: {
      ...defaultPreferences.agentContext,
      ...preferences.agentContext,
    },
    transcription: {
      ...defaultPreferences.transcription,
      ...preferences.transcription,
    },
    agentConnections: {
      ...defaultPreferences.agentConnections,
      ...preferences.agentConnections,
    },
    mermaid: { ...defaultPreferences.mermaid, ...preferences.mermaid },
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
    setPreference: (
      state,
      action: PayloadAction<{
        module: keyof UserPreferences;
        preference: string;
        value: any;
      }>,
    ) => {
      const { module, preference, value } = action.payload;
      (state[module] as any)[preference] = value;
      // Persistence is engine-managed (definePolicy → debounced 250ms remote
      // upsert + pagehide flush). The flag was leftover from a pre-engine
      // manual-save workflow; setting it produced a "Unsaved changes" banner
      // with no user-actionable Save button. Leaving the flag at its current
      // value (which is `false` once REHYDRATE has fired) means the UI never
      // surfaces a phantom dirty state.
      state._meta.error = null;
    },
    setModulePreferences: <T extends keyof UserPreferences>(
      state,
      action: PayloadAction<{
        module: T;
        preferences: Partial<UserPreferences[T]>;
      }>,
    ) => {
      const { module, preferences } = action.payload;
      state[module] = {
        ...state[module],
        ...preferences,
      } as UserPreferences[T];
      // See note in `setPreference` — auto-save handles persistence.
      state._meta.error = null;
    },
    resetModulePreferences: <T extends keyof UserPreferences>(
      state,
      action: PayloadAction<T>,
    ) => {
      const module = action.payload;
      state[module] = initializeUserPreferencesState()[
        module
      ] as UserPreferences[T];
      // See note in `setPreference` — auto-save handles persistence.
      state._meta.error = null;
    },
    resetAllPreferences: () => initializeUserPreferencesState(),
    resetToLoadedPreferences: (state) => {
      if (state._meta.loadedPreferences) {
        // Restore each module from loaded preferences
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
        state.flashcard = { ...state._meta.loadedPreferences.flashcard };
        state.playground = { ...state._meta.loadedPreferences.playground };
        state.aiModels = { ...state._meta.loadedPreferences.aiModels };
        state.system = { ...state._meta.loadedPreferences.system };
        state.messaging = { ...state._meta.loadedPreferences.messaging };
        state.agentContext = { ...state._meta.loadedPreferences.agentContext };
        state.mermaid = { ...state._meta.loadedPreferences.mermaid };
        state._meta.hasUnsavedChanges = false;
        state._meta.error = null;
      }
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
      const loaded = action.payload.state as
        | Partial<UserPreferences>
        | undefined;
      if (!loaded) return;

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
      if (loaded.playground)
        state.playground = { ...state.playground, ...loaded.playground };
      if (loaded.aiModels)
        state.aiModels = { ...state.aiModels, ...loaded.aiModels };
      if (loaded.system) state.system = { ...state.system, ...loaded.system };
      if (loaded.messaging)
        state.messaging = { ...state.messaging, ...loaded.messaging };
      if (loaded.agentContext)
        state.agentContext = { ...state.agentContext, ...loaded.agentContext };
      if (loaded.mermaid)
        state.mermaid = { ...state.mermaid, ...loaded.mermaid };

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
  "flashcard",
  "playground",
  "aiModels",
  "system",
  "messaging",
  "agentContext",
  "mermaid",
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
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", identity.userId)
        .abortSignal(signal)
        .single();
      if (error || !data) return null;
      return data.preferences as Partial<UserPreferencesState>;
    },
    write: async ({ identity, signal, body }) => {
      if (identity.type !== "auth") return; // guests only live in client storage
      const { supabase } = await import("@/utils/supabase/client");
      await supabase
        .from("user_preferences")
        .upsert({ user_id: identity.userId, preferences: body })
        .abortSignal(signal);
      void signal; // AbortSignal forwarded via query builder above
    },
  },
});
