// lib/redux/rootReducer.ts
"use client";

// Slim root reducer — entity-free. Used by `makeStore()` in `./store.ts`
// for the ~95% of routes that don't touch the deprecated entity system.
//
// Entity-bound routes (under `app/(legacy)/legacy/*`) use
// `createEntityRootReducer` from `./entity-rootReducer.ts`, which composes
// `slimReducerMap` with the entity slices (`entities`, `entityFields`,
// `globalCache`, `entitySystem`).
//
// See `~/.claude/plans/the-entity-system-which-bubbly-wind.md` for the
// migration that produced this split.

import { blockStatesReducer } from "@/features/block-state/redux/blockStatesSlice";
import { combineReducers, type Reducer } from "@reduxjs/toolkit";
import { applyIdentityReset } from "@/lib/sync/engine/identityReset";
import { createModuleSlice } from "./slices/moduleSliceCreator";
import { moduleSchemas, type ModuleName } from "./dynamic/moduleSchema";
import layoutReducer from "./slices/layoutSlice";
// Phase 4: legacy `userSlice` replaced by userAuth + userProfile (decisions D1).
// userAuth is volatile (auth secrets MUST NOT persist).
// userProfile uses boot-critical preset (userMetadata persists for first paint).
import userAuthReducer from "./slices/userAuthSlice";
import userProfileReducer from "./slices/userProfileSlice";
import entitlementsReducer from "@/features/entitlements/state/entitlementsSlice";

import userPreferencesReducer from "./preferences/userPreferencesSlice";
import sandboxLifecycleReducer from "./slices/sandboxLifecycleSlice";
import flashcardChatReducer from "./slices/flashcardChatSlice";
import adminDebugReducer from "./preferences/adminDebugSlice";
import creatorDebugReducer from "./preferences/creatorDebugSlice";
import themeReducer from "@/styles/themes/themeSlice";


import overlaySlice from "./slices/overlaySlice";
import storeReadsReducer from "./slices/storeReadsSlice";
import overlayDataReducer from "./slices/overlayDataSlice";
import voicePadReducer from "./slices/voicePadSlice";
// The chat package owns its slices and mounts them under the same keys (P2).
import { chatReducers } from "@ai-matrx/chat/store/slices";
import { agentDefinitionWithBuilderReducer } from "@/features/agents/redux/agent-builder.slice";
import { withAppChatHost } from "./chat-host-from-app";
import windowManagerReducer from "./slices/windowManagerSlice";
import { canvasReducer as canvasHostReducer } from "@ai-matrx/canvas";
import textDiffReducer from "./slices/textDiffSlice";
import noteVersionsReducer from "./slices/noteVersionsSlice";
import notesReducer from "@/features/notes/redux/slice";
import workingCopiesReducer from "@/lib/working-copy/workingCopySlice";
import sharingStatusReducer from "./slices/sharingStatusSlice";
import meetingsReducer from "@/features/meet/redux/meetingsSlice";
import topicalMapReducer from "@/features/marketing/seo/topical-map/redux/slice";
import schedulingTasksReducer from "@/features/scheduling/redux/tasks/slice";
import schedulingRunsReducer from "@/features/scheduling/redux/runs/slice";
import pageExtractionReducer from "@/features/page-extraction/redux/pageExtractionSlice";
import { pdfStudioReducer } from "@/features/pdf-extractor/state/pdfStudioSlice";
import { pdfBatchExtractDebugReducer } from "@/features/pdf-extractor/state/pdfBatchExtractDebugSlice";
import sourceLibraryReducer from "@/features/source-library/redux/sourceLibrarySlice";
import transcriptStudioReducer from "@/features/transcript-studio/redux/slice";
import visionInterviewReducer from "@/features/vision-interview/redux/vision-interview.slice";
import fastFireReducer from "@/features/flashcards/fast-fire/redux/fastFireSlice";
import warRoomReducer from "@/features/war-room/redux/slice";
import warRoomWatchReducer from "@/features/war-room/redux/watchSlice";
import recordingsReducer from "@/lib/redux/slices/recordingsSlice";
import audioPlaybackReducer from "@/lib/redux/slices/audioPlaybackSlice";
import audioSessionsReducer from "@/lib/redux/slices/audioSessionsSlice";
import transcriptsReducer from "@/features/transcripts/redux/transcriptsSlice";
import kgSuggestionsReducer from "@/lib/redux/slices/kgSuggestionsSlice";
import assistsReducer from "@/features/assists/redux/assistsSlice";
import cloudBrowserReducer from "@/features/cloud-browser/redux/cloudBrowserSlice";
import { codeFilesReducer } from "@/features/code-files/redux/slice";
import codeWorkspaceReducer from "@/features/code/redux/codeWorkspaceSlice";
import codeTabsReducer from "@/features/code/redux/tabsSlice";
import codeTerminalReducer from "@/features/code/redux/terminalSlice";
import terminalSessionsReducer from "@/features/code/redux/terminalSessionsSlice";
import codeDiagnosticsReducer from "@/features/code/redux/diagnosticsSlice";
import codePatchesReducer from "@/features/code/redux/codePatchesSlice";
import codeEditHistoryReducer from "@/features/code/redux/codeEditHistorySlice";
import fsChangesReducer from "@/features/code/redux/fsChangesSlice";
// Deep import, NOT the `@/features/files` barrel — see the note in lib/redux/store.ts.
import { cloudFilesReducer } from "@/features/files/redux/slice";
import smsReducer from "@/features/sms/redux/smsSlice";
import adminPreferencesReducer from "./preferences/adminPreferencesSlice";
import apiConfigReducer from "./slices/apiConfigSlice";
import urlSyncReducer from "./slices/urlSyncSlice";

import { agentAssignmentsReducer } from "@/features/agents/redux/agent-assignments/agent-assignments.slice";
import agentComparisonReducer from "@/features/agent-comparison/redux/battleSlice";
import agentComparisonSettingsReducer from "@/features/agent-comparison/modes/settings/redux/slice";
import agentComparisonSystemPromptReducer from "@/features/agent-comparison/modes/system-prompt/redux/slice";
import agentComparisonToolsReducer from "@/features/agent-comparison/modes/tools/redux/slice";
import agentComparisonRequestModReducer from "@/features/agent-comparison/modes/request-mod/redux/slice";
import agentComparisonMatrixReducer from "@/features/agent-comparison/modes/matrix/redux/slice";
import agentComparisonModelReducer from "@/features/agent-comparison/modes/model/redux/slice";
import agentComparisonTuningReducer from "@/features/agent-comparison/modes/tuning/redux/slice";
import agentComparisonVariationsReducer from "@/features/agent-comparison/modes/variations/redux/slice";
import agentComparisonConversationReducer from "@/features/agent-comparison/modes/conversation/redux/slice";
import agentUsagesReducer from "@/features/agents/redux/usages/usages.slice";
import orchestrasReducer from "@/features/agents/redux/orchestras/slice";
import { sklReducer } from "@/features/agent-connections/redux/skl/slice";
import { skillsReducer } from "@/features/skills/redux/skillsSlice";
import { dictionaryReducer } from "@/features/dictionary/redux/dictionarySlice";
import { agentConnectionsUiReducer } from "@/features/agent-connections/redux/ui/slice";
import { appletReducer } from "@/features/agents/redux/applets/slice";

import artifactsReducer from "./slices/artifactsSlice";
import htmlPagesReducer from "./slices/htmlPagesSlice";

import appContextReducer from "@/lib/redux/slices/appContextSlice";
import wizardDraftReducer from "@/lib/redux/slices/wizardDraftSlice";

// ─── New scopes module (features/scopes) ────────────────────────────
// These two keys are the only scope state. The legacy `scopes` /
// `scopeTypes` keys were deleted 2026-09-25 (lane SCOPE-ADMIN-CANONICAL), and
// `contextItems`, `scopeValues`, `templates` the same day (lane SCOPE-ADMIN-2):
// catalogs live on `scopesTree.contextItemsByTypeId`, values on `contextValues`,
// templates are no longer in the store (the gallery reads them itself).
import scopesTreeReducer from "@/features/scopes/redux/scopesSlice";
import contextValuesReducer from "@/features/scopes/redux/contextValuesSlice";

import hierarchyReducer from "@/features/agent-context/redux/hierarchySlice";
import organizationsReducer from "@/features/agent-context/redux/organizationsSlice";
import projectsReducer from "@/features/agent-context/redux/projectsSlice";
import tasksReducer from "@/features/agent-context/redux/tasksSlice";
import taskUiReducer from "@/features/tasks/redux/taskUiSlice";
import quickTasksWindowReducer from "@/features/tasks/redux/quickTasksWindowSlice";
import taskAssociationsReducer from "@/features/tasks/redux/taskAssociationsSlice";

import { editorStateReducer } from "@/features/code-editor/redux/editor-state.slice";
import { default as workflowRunsReducer } from "@/features/workflow-runtime/redux/workflow-runs.slice";
import { default as netRequestsReducer } from "@/lib/redux/net/netRequestsSlice";
import { default as netHealthReducer } from "@/lib/redux/net/netHealthSlice";
import markdownSamplesReducer from "@/lib/redux/slices/markdownSamples/slice";
import userMarkdownSamplesReducer from "@/lib/redux/slices/userMarkdownSamples/slice";
import diffCompareReducer from "@/lib/redux/slices/diffCompareSlice";
import accessSetupReducer from "@/features/access-setup/redux/accessSetupSlice";

const moduleReducers = Object.keys(moduleSchemas).reduce<
  Record<string, Reducer>
>((acc, moduleName) => {
  const moduleSchema = moduleSchemas[moduleName as keyof typeof moduleSchemas];
  const moduleSlice = createModuleSlice(moduleName as ModuleName, moduleSchema);
  acc[moduleName] = moduleSlice.reducer;
  return acc;
}, {});

/**
 * Slice map for the slim store. Every key here is a non-entity slice — safe
 * to mount on routes that don't import the entity system.
 *
 * `createEntityRootReducer` (in ./entity-rootReducer.ts) spreads this map and
 * appends the entity-only keys (`entities`, `entityFields`, `globalCache`,
 * `entitySystem`).
 */
export const slimReducerMap = {
  userAuth: userAuthReducer,
  userProfile: userProfileReducer,
  entitlements: entitlementsReducer,
  userPreferences: userPreferencesReducer,
  sandboxLifecycle: sandboxLifecycleReducer,

  adminDebug: adminDebugReducer,
  creatorDebug: creatorDebugReducer,
  overlays: overlaySlice,
  overlayData: overlayDataReducer,
  voicePad: voicePadReducer,
  windowManager: windowManagerReducer,
  urlSync: urlSyncReducer,

  // Canvas and Artifacts system ----------
  // THE canvas (@ai-matrx/canvas): column, panes, tabs, items, width.
  canvasHost: canvasHostReducer,
  // Artifact tracking — universal registry for all AI-generated content
  artifacts: artifactsReducer,
  // HTML pages — editor session state + page catalog
  htmlPages: htmlPagesReducer,

  // Text diff system
  textDiff: textDiffReducer,
  noteVersions: noteVersionsReducer,
  notes: notesReducer,
  // THE working copy of every record being edited (lib/working-copy).
  workingCopies: workingCopiesReducer,
  // Each record's visibility, read once per tab (useSharingStatus).
  sharingStatus: sharingStatusReducer,
  // Each meeting with its invitees and occurrences, loaded once per tab
  // (features/meet/redux/meetingsSlice.ts — useMeetingById, useMeetingLive).
  meetings: meetingsReducer,
  // Topical map workspace — selection, expansion, view, filters and optimistic
  // edits per open map. Views are ROUTES, so this slice is what makes selection
  // and expansion survive switching between outline/table/graph/text.
  topicalMap: topicalMapReducer,
  // Media Source Catalog — what a Library sync and a selection job are doing
  // right now. A CACHE over the server's own mount reads, never the truth.
  sourceLibrary: sourceLibraryReducer,
  transcriptStudio: transcriptStudioReducer,
  // Vision Interview — multi-agent interview room (features/vision-interview)
  visionInterview: visionInterviewReducer,
  // FastFire — the voice-graded flashcard drill state machine
  // (features/flashcards/fast-fire). ONE slice owns the whole drill lifecycle.
  fastFire: fastFireReducer,
  // War Room — session-based multitasking command center (features/war-room)
  warRoom: warRoomReducer,
  // War Room master-agent live-watch layer (ephemeral UI; features/war-room)
  warRoomWatch: warRoomWatchReducer,
  recordings: recordingsReducer,
  audioPlayback: audioPlaybackReducer,
  audioSessions: audioSessionsReducer,
  transcripts: transcriptsReducer,
  codeFiles: codeFilesReducer,

  // New VSCode-style workspace (features/code) ----------------------------
  codeWorkspace: codeWorkspaceReducer,
  codeTabs: codeTabsReducer,
  codeTerminal: codeTerminalReducer,
  terminalSessions: terminalSessionsReducer,
  codeDiagnostics: codeDiagnosticsReducer,
  codePatches: codePatchesReducer,
  codeEditHistory: codeEditHistoryReducer,
  fsChanges: fsChangesReducer,
  // cld_files — the single file system. Backed by the Python `/files/*`
  // API (AWS S3 storage). All file flows funnel through `features/files`
  // (the universal file handler).
  cloudFiles: cloudFilesReducer,
  // SMS integration
  sms: smsReducer,

  theme: themeReducer,

  ...moduleReducers,
  layout: layoutReducer,
  flashcardChat: flashcardChatReducer,


  adminPreferences: adminPreferencesReducer,



  apiConfig: apiConfigReducer,

  // NEW AGENTS SYSTEM =======================================================
  // Every slice @ai-matrx/chat owns, under today's top-level keys (P2).
  ...chatReducers,
  // The builder's edit reducers (agentBuilder/*) composed onto chat's agent record (B2).
  agentDefinition: agentDefinitionWithBuilderReducer,
  agentAssignments: agentAssignmentsReducer,
  agentUsages: agentUsagesReducer,
  // Orchestras — Orchestra list + per-Orchestra member/config cache.
  // Membership truth lives in platform.associations; see features/agents/orchestras.
  orchestras: orchestrasReducer,
  skl: sklReducer,
  // New skills slice — canonical source going forward. Backed by /api/skills
  // (the Python backend), not Supabase. The old `skl` key is retained for
  // render-blocks / render-components / resources until those move too.
  skills: skillsReducer,
  // Custom Dictionary (terminology + pronunciation) + the generic per-surface
  // user-state store it rides on.
  dictionary: dictionaryReducer,
  agentConnectionsUi: agentConnectionsUiReducer,
  applet: appletReducer,

  appContext: appContextReducer,

  // Generic persisted wizard-draft primitive (survives refresh/idle/step-nav;
  // sync-engine policy in the slice file). Keyed by wizardId — reusable, never
  // feature-specific.
  wizardDraft: wizardDraftReducer,

  // ─── features/scopes — the only scope state ─────────────────────────
  scopesTree: scopesTreeReducer,
  contextValues: contextValuesReducer,
  // Reads kept by key and read once (`lib/redux/store-reads/useStoreRead.ts`):
  // a remount, a wake or a second view renders the answer and reads nothing.
  storeReads: storeReadsReducer,


  hierarchy: hierarchyReducer,

  organizations: organizationsReducer,
  projects: projectsReducer,
  tasks: tasksReducer,

  tasksUi: taskUiReducer,
  quickTasksWindow: quickTasksWindowReducer,
  taskAssociations: taskAssociationsReducer,

  editorState: editorStateReducer,

  workflowRuns: workflowRunsReducer,
  netRequests: netRequestsReducer,
  netHealth: netHealthReducer,




  // What a person picked OUT of a connection — the repositories, files and
  // sheets attached to one conversation. A connection is account-wide; these
  // are not, which is why they are keyed by conversation and never by slug.

  schedulingTasks: schedulingTasksReducer,
  schedulingRuns: schedulingRunsReducer,

  pageExtraction: pageExtractionReducer,
  pdfStudio: pdfStudioReducer,
  pdfBatchExtractDebug: pdfBatchExtractDebugReducer,

  kgSuggestions: kgSuggestionsReducer,
  assists: assistsReducer,
  blockStates: blockStatesReducer,
  cloudBrowser: cloudBrowserReducer,

  agentComparison: agentComparisonReducer,
  agentComparisonSettings: agentComparisonSettingsReducer,
  agentComparisonSystemPrompt: agentComparisonSystemPromptReducer,
  agentComparisonTools: agentComparisonToolsReducer,
  agentComparisonRequestMod: agentComparisonRequestModReducer,
  agentComparisonMatrix: agentComparisonMatrixReducer,
  agentComparisonModel: agentComparisonModelReducer,
  agentComparisonTuning: agentComparisonTuningReducer,
  agentComparisonVariations: agentComparisonVariationsReducer,
  agentComparisonConversation: agentComparisonConversationReducer,

  // Admin Markdown Tester — super-admin curated test samples.
  markdownSamples: markdownSamplesReducer,
  // Markdown Studio — per-user samples (RLS scoped to auth.uid()).
  userMarkdownSamples: userMarkdownSamplesReducer,

  // RichDocument remote-surface registry — maps surfaceId → stack of
  // registered RichDocument providers so a <RichDocumentActionSurface/>
  // can render actions for whichever document is currently on top.
  // See features/rich-document/FEATURE.md.

  // Canonical diff system — pinned "comparison base" for the pick-two
  // compare flow (components/diff). See components/diff/FEATURE.md.
  diffCompare: diffCompareReducer,

  // People involved (access setup) panel — features/access-setup/FEATURE.md.
  accessSetup: accessSetupReducer,
};

/**
 * The root reducer, wrapped so a PERSONA SWAP cannot leave one person's state
 * standing in another person's session.
 *
 * `applyIdentityReset` deletes the named slices from the state object, which
 * makes `combineReducers` hand those reducers `undefined` and take their
 * `initialState`. Doing it HERE, rather than as an `extraReducers` case in each
 * slice, is the whole point: a slice cannot forget to handle an action it never
 * has to know about. See `lib/sync/engine/identityReset.ts` for what leaked.
 */
export const createSlimRootReducer = () => {
  const combined = combineReducers(slimReducerMap);
  const withIdentityReset: typeof combined = (state, action) =>
    combined(applyIdentityReset(state, action), action);
  // The chat package reads who is signed in and the active organization from its own
  // `chatHost` slice; this keeps that slice equal to this app's state in the same reduction.
  return withAppChatHost(withIdentityReset);
};

/**
 * Derive RootState from the root reducer directly so that slice files and
 * thunks can import it from here instead of from store.ts, avoiding the
 * store → rootReducer → slice → store circular dependency.
 *
 * This type is structurally identical to `ReturnType<AppStore["getState"]>`
 * in store.ts — both are driven by the same slimReducerMap.
 */
export type RootState = ReturnType<ReturnType<typeof createSlimRootReducer>>;
