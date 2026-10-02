"use client";

/**
 * Window openers through the windows port (CPM-009c, slice P18).
 *
 * The package opens host windows (agent builder windows, notes, tasks, the
 * scraper, mandate windows …) through typed opener functions the HOST
 * registers on `windows.openers`. Each `useOpen…` hook below has the exact
 * name and call shape the package always used, so a call site only changes
 * its import path. An opener the host does not register is the stand-in: it
 * opens nothing and says so once per opener (console), never silently.
 *
 * The option and handle shapes are the package's own; matrx-frontend's adapter
 * assigns its openers to `ChatWindowOpeners`, so a drift between the two is a
 * compile error there.
 */

import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import type { DiffEngine, DiffView } from "@ai-matrx/diff/react";
import type { Resource } from "../agents/resources/types";
import type { RunControlsTab } from "../agents/components/inputs/smart-input/RunControlsTabPanel";
import { announceOnce } from "./errors";
import { useChatWindows } from "./windows-react";

// ── Handles ──────────────────────────────────────────────────────────────────

export interface ChatWindowHandle {
  close: () => void;
}

export interface ChatInstanceWindowHandle extends ChatWindowHandle {
  instanceId: string;
}

// ── Options (one per opener) ─────────────────────────────────────────────────

export interface OpenAgentIdWindowOptions {
  agentId?: string | null;
}
export type OpenAgentAdminFindUsagesWindowOptions = OpenAgentIdWindowOptions;
export type OpenAgentCreateAppWindowOptions = OpenAgentIdWindowOptions;
export type OpenAgentDataStorageWindowOptions = OpenAgentIdWindowOptions;
export type OpenAgentFindUsagesWindowOptions = OpenAgentIdWindowOptions;
export type OpenAgentInterfaceVariationsWindowOptions = OpenAgentIdWindowOptions;
export type OpenAgentOptimizerWindowOptions = OpenAgentIdWindowOptions;

export interface OpenAgentShortcutQuickCreateWindowOptions {
  agentId?: string | null;
  initialActiveTab?: unknown;
}
export interface OpenAgentContentWindowOptions {
  initialAgentId?: string | null;
  initialTab?: unknown;
  tabs?: unknown;
  multiAgentMode?: boolean;
}
export interface OpenAgentConvertSystemWindowOptions {
  agentId?: string | null;
  mandateId?: string | null;
  mandateKey?: AnyMandateKey | null;
  mandateLabel?: string | null;
}
export type OpenAgentImportWindowOptions = Record<string, never>;
export interface OpenAgentRunHistoryWindowOptions {
  agentId?: string | null;
  initialSelectedConversationId?: string | null;
  subject?: string | null;
}
export interface OpenAgentSettingsWindowOptions {
  initialAgentId?: string;
  surfaceName?: string;
  initialView?: "info" | "surface";
}
export interface OpenAuthGateDialogOptions {
  featureName?: string;
  featureDescription?: string;
}
export interface OpenChatDebugWindowOptions {
  sessionId: string | null;
}
export interface OpenContextPreviewPanelOptions {
  conversationId?: string;
  agentId?: string;
}
export interface OpenPromptPreviewWindowOptions {
  conversationId: string;
}
export interface OpenQuickChatSheetOptions {
  className?: string;
  initialConversationId?: string;
  title?: string;
}
export interface OpenRunControlsWindowOptions {
  conversationId: string;
  includeAttach?: boolean;
  initialTab?: RunControlsTab;
}
export interface OpenSaveKitDialogOptions {
  initialAgentId?: string | null;
  editKitKey?: string | null;
}
export interface OpenSurfaceContextInspectorOptions {
  surfaceName: string | null;
  scope?: Record<string, unknown>;
  isEditable: boolean;
  preferRuntime?: boolean;
}
export interface OpenSurfaceContextWindowOptions {
  surfaceName: string;
  isEditable?: boolean;
}
export interface OpenSystemInstructionWindowOptions {
  conversationId: string;
}
export interface OpenAgentRunWindowOptions {
  instanceId?: string;
  initialAgentId?: string | null;
  initialSelectedConversationId?: string | null;
  initialAgentName?: string | null;
  initialDraftText?: string | null;
  initialVariableValues?: Record<string, string> | null;
  initialResources?: Resource[] | null;
  initialToolsOpen?: boolean;
  initialResourceIdentity?: { userId: string; organizationId: string } | null;
  initialAutoRun?: boolean;
  mandateKey?: AnyMandateKey | null;
  surfaceName?: string | null;
}
export interface OpenDiffViewerWindowOptions {
  original: string;
  modified: string;
  originalLabel?: string;
  modifiedLabel?: string;
  title?: string | null;
  engine?: DiffEngine;
  language?: string;
  defaultView?: DiffView;
  instanceId?: string;
}
export type MandateWindowView = "yours" | "admin";
export interface OpenMandateWindowOptions {
  initialMandateKey?: AnyMandateKey;
  mandateKeys?: AnyMandateKey[];
  surfaceName?: string | null;
  initialView?: MandateWindowView;
}
export interface OpenNotesWindowOptions {
  instanceId?: string;
  title?: string;
  windowInstanceId?: string;
  initialNoteId?: string;
}
export type ScraperWindowMode = "web" | "url" | "batch";
export interface OpenScraperWindowOptions {
  url?: string;
  mode?: ScraperWindowMode;
}
export interface OpenStructuredListManagerV2WindowOptions {
  title?: string;
  forcedListId?: string | null;
}
export interface OpenTaskEditorWindowOptions {
  taskId: string;
  instanceId?: string;
}
export type TopicalMapWindowScreen =
  | "outline"
  | "table"
  | "graph"
  | "text"
  | "pages"
  | "history";
export interface OpenTopicalMapWindowOptions {
  mapId: string;
  screen?: TopicalMapWindowScreen | null;
  siteId?: string | null;
}
export interface OpenWorkingDocumentPanelOptions {
  conversationId: string;
  title?: string;
  initialKind?: "working" | "scratch";
}
export interface OpenWorkingDocumentWindowOptions {
  conversationId: string;
}
export interface OpenScratchpadPanelOptions {
  /** The chat the scratchpad was opened from — unlocks its "Share with this chat" toggle. */
  gateConversationId?: string;
}

// ── The registry a host fills ────────────────────────────────────────────────

/** Plain functions (not hooks): the host builds them once and the package calls them on demand. */
export interface ChatWindowOpeners {
  openAgentAdminFindUsagesWindow: (opts?: OpenAgentAdminFindUsagesWindowOptions) => ChatWindowHandle;
  openAgentShortcutQuickCreateWindow: (opts?: OpenAgentShortcutQuickCreateWindowOptions) => ChatWindowHandle;
  openAgentContentWindow: (opts?: OpenAgentContentWindowOptions) => ChatWindowHandle;
  openAgentConvertSystemWindow: (opts?: OpenAgentConvertSystemWindowOptions) => ChatWindowHandle;
  openAgentCreateAppWindow: (opts?: OpenAgentCreateAppWindowOptions) => ChatWindowHandle;
  openAgentDataStorageWindow: (opts?: OpenAgentDataStorageWindowOptions) => ChatWindowHandle;
  openAgentFindUsagesWindow: (opts?: OpenAgentFindUsagesWindowOptions) => ChatWindowHandle;
  openAgentImportWindow: (opts?: OpenAgentImportWindowOptions) => ChatWindowHandle;
  openAgentInterfaceVariationsWindow: (opts?: OpenAgentInterfaceVariationsWindowOptions) => ChatWindowHandle;
  openAgentMemoryWindow: () => ChatWindowHandle;
  openAgentOptimizerWindow: (opts?: OpenAgentOptimizerWindowOptions) => ChatWindowHandle;
  openAgentRunHistoryWindow: (opts?: OpenAgentRunHistoryWindowOptions) => ChatWindowHandle;
  openAgentSettingsWindow: (opts?: OpenAgentSettingsWindowOptions) => ChatWindowHandle;
  openAgentRunWindow: (opts?: OpenAgentRunWindowOptions) => ChatInstanceWindowHandle;
  openAuthGateDialog: (opts?: OpenAuthGateDialogOptions) => ChatWindowHandle;
  openChatDebugWindow: (opts: OpenChatDebugWindowOptions) => ChatWindowHandle;
  openContextPreviewPanel: (opts?: OpenContextPreviewPanelOptions) => ChatWindowHandle;
  openDiffViewerWindow: (opts: OpenDiffViewerWindowOptions) => ChatInstanceWindowHandle;
  openLiveIntegrationsWindow: () => ChatWindowHandle;
  openMandateWindow: (opts?: OpenMandateWindowOptions) => ChatWindowHandle;
  openNotesWindow: (opts?: OpenNotesWindowOptions) => ChatInstanceWindowHandle;
  openPromptPreviewWindow: (opts: OpenPromptPreviewWindowOptions) => ChatWindowHandle;
  openQuickChatSheet: (opts?: OpenQuickChatSheetOptions) => ChatWindowHandle;
  openRunControlsWindow: (opts: OpenRunControlsWindowOptions) => ChatWindowHandle;
  openSaveKitDialog: (opts?: OpenSaveKitDialogOptions) => void;
  openScraperWindow: (opts?: OpenScraperWindowOptions) => ChatWindowHandle;
  openScratchpadPanel: (opts?: OpenScratchpadPanelOptions) => ChatWindowHandle;
  openStructuredListManagerV2Window: (opts?: OpenStructuredListManagerV2WindowOptions) => ChatWindowHandle;
  openSurfaceContextInspector: (opts: OpenSurfaceContextInspectorOptions) => ChatWindowHandle;
  openSurfaceContextWindow: (opts: OpenSurfaceContextWindowOptions) => void;
  openSystemInstructionWindow: (opts: OpenSystemInstructionWindowOptions) => ChatWindowHandle;
  openTaskEditorWindow: (opts: OpenTaskEditorWindowOptions) => ChatInstanceWindowHandle;
  openTopicalMapWindow: (opts: OpenTopicalMapWindowOptions) => ChatWindowHandle;
  openWorkingDocumentPanel: (opts: OpenWorkingDocumentPanelOptions) => ChatWindowHandle;
  openWorkingDocumentWindow: (opts: OpenWorkingDocumentWindowOptions) => ChatInstanceWindowHandle;
}

export type ChatWindowOpenerName = keyof ChatWindowOpeners;

// ── The stand-in (no opener registered) ──────────────────────────────────────

const NOTHING_OPENED: ChatInstanceWindowHandle = {
  instanceId: "",
  close: () => {},
};

function unhosted(name: ChatWindowOpenerName) {
  return (..._args: unknown[]): ChatInstanceWindowHandle => {
    announceOnce(
      `window-opener-unhosted:${name}`,
      `Chat could not open a window: this host registers no "${name}" opener. ` +
        "Pass it on the chat host's `windows.openers`.",
    );
    return NOTHING_OPENED;
  };
}

/** What a host that registers no openers gets — every one announces itself. */
export const UNHOSTED_WINDOW_OPENERS: ChatWindowOpeners = {
  openAgentAdminFindUsagesWindow: unhosted("openAgentAdminFindUsagesWindow"),
  openAgentShortcutQuickCreateWindow: unhosted("openAgentShortcutQuickCreateWindow"),
  openAgentContentWindow: unhosted("openAgentContentWindow"),
  openAgentConvertSystemWindow: unhosted("openAgentConvertSystemWindow"),
  openAgentCreateAppWindow: unhosted("openAgentCreateAppWindow"),
  openAgentDataStorageWindow: unhosted("openAgentDataStorageWindow"),
  openAgentFindUsagesWindow: unhosted("openAgentFindUsagesWindow"),
  openAgentImportWindow: unhosted("openAgentImportWindow"),
  openAgentInterfaceVariationsWindow: unhosted("openAgentInterfaceVariationsWindow"),
  openAgentMemoryWindow: unhosted("openAgentMemoryWindow"),
  openAgentOptimizerWindow: unhosted("openAgentOptimizerWindow"),
  openAgentRunHistoryWindow: unhosted("openAgentRunHistoryWindow"),
  openAgentSettingsWindow: unhosted("openAgentSettingsWindow"),
  openAgentRunWindow: unhosted("openAgentRunWindow"),
  openAuthGateDialog: unhosted("openAuthGateDialog"),
  openChatDebugWindow: unhosted("openChatDebugWindow"),
  openContextPreviewPanel: unhosted("openContextPreviewPanel"),
  openDiffViewerWindow: unhosted("openDiffViewerWindow"),
  openLiveIntegrationsWindow: unhosted("openLiveIntegrationsWindow"),
  openMandateWindow: unhosted("openMandateWindow"),
  openNotesWindow: unhosted("openNotesWindow"),
  openPromptPreviewWindow: unhosted("openPromptPreviewWindow"),
  openQuickChatSheet: unhosted("openQuickChatSheet"),
  openRunControlsWindow: unhosted("openRunControlsWindow"),
  openSaveKitDialog: unhosted("openSaveKitDialog"),
  openScraperWindow: unhosted("openScraperWindow"),
  openScratchpadPanel: unhosted("openScratchpadPanel"),
  openStructuredListManagerV2Window: unhosted("openStructuredListManagerV2Window"),
  openSurfaceContextInspector: unhosted("openSurfaceContextInspector"),
  openSurfaceContextWindow: unhosted("openSurfaceContextWindow"),
  openSystemInstructionWindow: unhosted("openSystemInstructionWindow"),
  openTaskEditorWindow: unhosted("openTaskEditorWindow"),
  openTopicalMapWindow: unhosted("openTopicalMapWindow"),
  openWorkingDocumentPanel: unhosted("openWorkingDocumentPanel"),
  openWorkingDocumentWindow: unhosted("openWorkingDocumentWindow"),
};

function useOpener<K extends ChatWindowOpenerName>(name: K): ChatWindowOpeners[K] {
  return useChatWindows().openers?.[name] ?? UNHOSTED_WINDOW_OPENERS[name];
}

// ── The hooks package code calls ─────────────────────────────────────────────

export function useOpenAgentAdminFindUsagesWindow() {
  return useOpener("openAgentAdminFindUsagesWindow");
}
export function useOpenAgentShortcutQuickCreateWindow() {
  return useOpener("openAgentShortcutQuickCreateWindow");
}
export function useOpenAgentContentWindow() {
  return useOpener("openAgentContentWindow");
}
export function useOpenAgentConvertSystemWindow() {
  return useOpener("openAgentConvertSystemWindow");
}
export function useOpenAgentCreateAppWindow() {
  return useOpener("openAgentCreateAppWindow");
}
export function useOpenAgentDataStorageWindow() {
  return useOpener("openAgentDataStorageWindow");
}
export function useOpenAgentFindUsagesWindow() {
  return useOpener("openAgentFindUsagesWindow");
}
export function useOpenAgentImportWindow() {
  return useOpener("openAgentImportWindow");
}
export function useOpenAgentInterfaceVariationsWindow() {
  return useOpener("openAgentInterfaceVariationsWindow");
}
export function useOpenAgentMemoryWindow() {
  return useOpener("openAgentMemoryWindow");
}
export function useOpenAgentOptimizerWindow() {
  return useOpener("openAgentOptimizerWindow");
}
export function useOpenAgentRunHistoryWindow() {
  return useOpener("openAgentRunHistoryWindow");
}
export function useOpenAgentSettingsWindow() {
  return useOpener("openAgentSettingsWindow");
}
export function useOpenAgentRunWindow() {
  return useOpener("openAgentRunWindow");
}
export function useOpenAuthGateDialog() {
  return useOpener("openAuthGateDialog");
}
export function useOpenChatDebugWindow() {
  return useOpener("openChatDebugWindow");
}
export function useOpenContextPreviewPanel() {
  return useOpener("openContextPreviewPanel");
}
export function useOpenDiffViewerWindow() {
  return useOpener("openDiffViewerWindow");
}
export function useOpenLiveIntegrationsWindow() {
  return useOpener("openLiveIntegrationsWindow");
}
export function useOpenMandateWindow() {
  return useOpener("openMandateWindow");
}
export function useOpenNotesWindow() {
  return useOpener("openNotesWindow");
}
export function useOpenPromptPreviewWindow() {
  return useOpener("openPromptPreviewWindow");
}
export function useOpenQuickChatSheet() {
  return useOpener("openQuickChatSheet");
}
export function useOpenRunControlsWindow() {
  return useOpener("openRunControlsWindow");
}
export function useOpenSaveKitDialog() {
  return useOpener("openSaveKitDialog");
}
export function useOpenScraperWindow() {
  return useOpener("openScraperWindow");
}
export function useOpenStructuredListManagerV2Window() {
  return useOpener("openStructuredListManagerV2Window");
}
export function useOpenSurfaceContextInspector() {
  return useOpener("openSurfaceContextInspector");
}
export function useOpenSurfaceContextWindow() {
  return useOpener("openSurfaceContextWindow");
}
export function useOpenSystemInstructionWindow() {
  return useOpener("openSystemInstructionWindow");
}
export function useOpenTaskEditorWindow() {
  return useOpener("openTaskEditorWindow");
}
export function useOpenTopicalMapWindow() {
  return useOpener("openTopicalMapWindow");
}
export function useOpenScratchpadPanel() {
  return useOpener("openScratchpadPanel");
}
export function useOpenWorkingDocumentPanel() {
  return useOpener("openWorkingDocumentPanel");
}
export function useOpenWorkingDocumentWindow() {
  return useOpener("openWorkingDocumentWindow");
}
