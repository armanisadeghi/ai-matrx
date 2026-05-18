/**
 * windowRegistry.ts
 *
 * Full window registry — merges static metadata (windowRegistryMetadata.ts)
 * with the dynamic componentImport / renderTrayPreview / captureTraySnapshot
 * additions. This is the ONLY file that contains dynamic `import()` expressions
 * for window components.
 *
 * ⚠️  Only import this file from the renderer layer:
 *     - UnifiedOverlayController / OverlaySurface (mounts components)
 *     - TrayChipPreview (reads renderTrayPreview / captureTraySnapshot)
 *     - Test files and dev scripts
 *
 * For metadata-only lookups (WindowPanel, WindowPersistenceManager, WindowTray,
 * ToolsGrid, initUrlHydration) import from windowRegistryMetadata.ts instead
 * to avoid pulling 50+ dynamic import expressions into every window
 * component's async chunk.
 */

import { assertLazyLoaded } from "../utils/lazy-bundle-guard";
assertLazyLoaded("features/window-panels/registry/windowRegistry.ts");

import {
  ALL_WINDOW_STATIC_METADATA,
  getStaticEntryByOverlayId,
  getStaticEntryBySlug,
} from "./windowRegistryMetadata";
import type {
  WindowRegistryEntry,
  TrayPreviewContext,
  ComponentImport,
} from "./windowRegistryTypes";
import {
  notesTrayPreview,
  quickTasksTrayPreview,
  cloudFilesTrayPreview,
  scraperTrayPreview,
  smartCodeEditorTrayPreview,
} from "./tray-previews";

// Re-export all types so existing imports still work
export type {
  OverlayKind,
  MobilePresentation,
  InstanceMode,
  MobileSidebarAs,
  LucideIconName,
  ToolsCategory,
  ComponentImport,
  PanelState,
  WindowSessionRow,
  TrayPreviewContext,
  WindowStaticMetadata,
  WindowRegistryEntry,
} from "./windowRegistryTypes";

// ─── Dynamic additions ────────────────────────────────────────────────────────
//
// Each key is the overlayId from the static registry.
// Only componentImport is required; the others are opt-in.

type DynamicAddition = {
  componentImport: ComponentImport;
  renderTrayPreview?: (ctx: TrayPreviewContext) => import("react").ReactNode;
  captureTraySnapshot?: (bodyEl: HTMLElement) => Promise<string | null>;
};

const DYNAMIC: Record<string, DynamicAddition> = {
  // ── Code Workspace ──────────────────────────────────────────────────────
  codeWorkspaceWindow: {
    componentImport: () =>
      import("@/features/code/host/CodeWorkspaceWindow").then((m) => ({
        default: m.CodeWorkspaceWindow,
      })),
  },

  // ── Code Editor ─────────────────────────────────────────────────────────
  codeEditorWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/code/CodeEditorWindow").then(
        (m) => ({ default: m.CodeEditorWindow }),
      ),
  },

  // ── Code File Manager ────────────────────────────────────────────────────
  codeFileManagerWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/code/CodeFileManagerWindow").then(
        (m) => ({ default: m.CodeFileManagerWindow }),
      ),
  },

  // ── Multi-file Smart Code Editor ─────────────────────────────────────────
  multiFileSmartCodeEditorWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/multi-file-smart-code-editor/MultiFileSmartCodeEditorWindow").then(
        (m) => ({ default: m.MultiFileSmartCodeEditorWindow }),
      ),
  },

  // ── Smart Code Editor ────────────────────────────────────────────────────
  smartCodeEditorWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/smart-code-editor/SmartCodeEditorWindow").then(
        (m) => ({ default: m.SmartCodeEditorWindow }),
      ),
    renderTrayPreview: smartCodeEditorTrayPreview,
  },

  // ── Notes ────────────────────────────────────────────────────────────────
  notesWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/notes/NotesWindow").then(
        (m) => ({ default: m.NotesWindow }),
      ),
    renderTrayPreview: notesTrayPreview,
  },

  // ── Notes Beta ───────────────────────────────────────────────────────────
  notesBetaWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/notes/NotesBetaWindow").then(
        (m) => ({ default: m.NotesBetaWindow }),
      ),
  },

  // ── Quick Note Save ──────────────────────────────────────────────────────
  quickNoteSaveWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/notes/QuickNoteSaveWindow"),
  },

  // ── Quick Data ───────────────────────────────────────────────────────────
  quickDataWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/QuickDataWindow"),
  },

  // ── Quick Tasks ──────────────────────────────────────────────────────────
  quickTasksWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/context-scopes/QuickTasksWindow"),
    renderTrayPreview: quickTasksTrayPreview,
  },

  // ── Quick Task Create ────────────────────────────────────────────────────
  taskQuickCreateWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/tasks/TaskQuickCreateWindow"),
  },

  // ── Cloud Files ──────────────────────────────────────────────────────────
  cloudFilesWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/cloud-files/CloudFilesWindow"),
    renderTrayPreview: cloudFilesTrayPreview,
  },

  // ── File Preview ─────────────────────────────────────────────────────────
  filePreviewWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/cloud-files/FilePreviewWindow"),
  },

  // ── Web Scraper ──────────────────────────────────────────────────────────
  scraperWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/ScraperWindow"),
    renderTrayPreview: scraperTrayPreview,
  },

  // ── PDF Extractor ────────────────────────────────────────────────────────
  pdfExtractorWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/PdfExtractorWindow"),
  },

  // ── Gallery ──────────────────────────────────────────────────────────────
  galleryWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/image/GalleryWindow"),
  },

  // ── News ─────────────────────────────────────────────────────────────────
  newsWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/NewsWindow"),
  },

  // ── Embedded browser ─────────────────────────────────────────────────────
  browserFrameWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/iframe/BrowserFrameWindow"),
  },
  browserWorkbenchWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/iframe/BrowserWorkbenchWindow"),
  },

  // ── List Manager ─────────────────────────────────────────────────────────
  listManagerWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/ListManagerWindow"),
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  userPreferencesWindow: {
    componentImport: () =>
      import("@/features/settings/components/SettingsShellOverlay"),
  },

  // ── Agent Settings ────────────────────────────────────────────────────────
  agentSettingsWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentSettingsWindow"),
  },

  // ── Agent Run History ─────────────────────────────────────────────────────
  agentRunHistoryWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentRunHistoryWindow"),
  },

  // ── Agent Run ─────────────────────────────────────────────────────────────
  agentRunWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentRunWindow"),
  },

  // ── Agent Content (advanced editor) ──────────────────────────────────────
  agentAdvancedEditorWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentContentWindow"),
  },

  // ── Agent Content Sidebar ─────────────────────────────────────────────────
  agentContentSidebarWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentContentSidebarWindow"),
  },

  // ── Agent Gate ────────────────────────────────────────────────────────────
  agentGateWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentGateWindow"),
  },

  // ── Chat Debug ────────────────────────────────────────────────────────────
  chatDebugWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/admin/ChatDebugWindow"),
  },

  // ── Agent Debug ───────────────────────────────────────────────────────────
  agentDebugWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentDebugWindow"),
  },

  // ── Instance UI State ─────────────────────────────────────────────────────
  instanceUIStateWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/admin/InstanceUIStateWindow"),
  },

  // ── Execution Inspector ───────────────────────────────────────────────────
  executionInspectorWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/admin/ExecutionInspectorWindow"),
  },

  // ── Context Switcher ──────────────────────────────────────────────────────
  contextSwitcherWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/context-scopes/ContextSwitcherWindow").then(
        (m) => ({ default: m.ContextSwitcherWindow }),
      ),
  },

  // ── Hierarchy Creation ────────────────────────────────────────────────────
  hierarchyCreationWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/context-scopes/HierarchyCreationWindow"),
  },

  // ── Canvas Viewer ─────────────────────────────────────────────────────────
  canvasViewerWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/CanvasViewerWindow").then(
        (m) => ({ default: m.CanvasViewerWindow }),
      ),
  },

  // ── Feedback ──────────────────────────────────────────────────────────────
  feedbackDialog: {
    componentImport: () =>
      import("@/features/window-panels/windows/FeedbackWindow").then((m) => ({
        default: m.FeedbackWindow,
      })),
  },

  // ── Share Modal Window ────────────────────────────────────────────────────
  shareModalWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/ShareModalWindow"),
  },

  // ── Email Dialog ──────────────────────────────────────────────────────────
  emailDialogWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/EmailDialogWindow"),
  },

  // ── Markdown Editor ───────────────────────────────────────────────────────
  markdownEditorWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/MarkdownEditorWindow"),
  },

  // ── Image Viewer ──────────────────────────────────────────────────────────
  imageViewer: {
    componentImport: () =>
      import("@/features/window-panels/windows/image/ImageViewerWindow").then(
        (m) => ({ default: m.ImageViewerWindow }),
      ),
  },

  // ── Curated Icon Picker ───────────────────────────────────────────────────
  curatedIconPickerWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/icons/CuratedIconPickerWindow").then(
        (m) => ({ default: m.CuratedIconPickerWindow }),
      ),
  },

  // ── Crop Studio ───────────────────────────────────────────────────────────
  cropStudioWindow: {
    componentImport: () =>
      import("@/features/image-studio/components/CropStudioWindow"),
  },

  // ── Image Uploader ────────────────────────────────────────────────────────
  imageUploaderWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/image/ImageUploaderWindow"),
  },

  // ── AI Voice ──────────────────────────────────────────────────────────────
  aiVoiceWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/voice/AiVoiceWindow"),
  },

  // ── Voice Pad ─────────────────────────────────────────────────────────────
  voicePad: {
    componentImport: () =>
      import("@/components/official-candidate/voice-pad/components/VoicePad"),
  },
  voicePadAdvanced: {
    componentImport: () =>
      import("@/components/official-candidate/voice-pad/components/VoicePadAdvanced"),
  },
  voicePadAi: {
    componentImport: () =>
      import("@/components/official-candidate/voice-pad/components/VoicePadAi"),
  },
  transcriptStudioWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/transcript-studio/TranscriptStudioWindow").then(
        (m) => ({ default: m.TranscriptStudioWindow }),
      ),
  },

  // ── AI Results ────────────────────────────────────────────────────────────
  // Cross-agent conversation history. Replaces the legacy
  // QuickChatHistorySheet (prompts system) — slug + overlayId kept for
  // backward compatibility with the user menu and Tools-grid tile.
  quickChatHistory: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/ChatHistoryWindow"),
  },

  // ── Stream Debug ──────────────────────────────────────────────────────────
  streamDebug: {
    componentImport: () =>
      import("@/features/agents/components/debug/StreamDebugFloating").then(
        (m) => ({ default: m.StreamDebugFloating }),
      ),
  },

  // ── Message Analysis ──────────────────────────────────────────────────────
  messageAnalysisWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/MessageAnalysisWindow"),
  },

  // ── Stream Debug History ──────────────────────────────────────────────────
  streamDebugHistoryWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/admin/StreamDebugHistoryWindow"),
  },

  // ── State Analyzer ────────────────────────────────────────────────────────
  adminStateAnalyzerWindow: {
    componentImport: () =>
      import("@/components/admin/state-analyzer/StateViewerWindow"),
  },

  // ── JSON Truncator ────────────────────────────────────────────────────────
  jsonTruncator: {
    componentImport: () =>
      import("@/components/official-candidate/json-truncator/JsonTruncatorDialog"),
  },

  // ── Resource Picker ───────────────────────────────────────────────────────
  resourcePickerWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/ResourcePickerWindow").then(
        (m) => ({ default: m.ResourcePickerWindow }),
      ),
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  projectsWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/context-scopes/ProjectsWindow"),
  },

  // ── Agent MD Debug ────────────────────────────────────────────────────────
  agentAssistantMarkdownDebugWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentAssistantMarkdownDebugWindow"),
  },

  // ── Agent Import ──────────────────────────────────────────────────────────
  agentImportWindow: {
    componentImport: () => import("@/features/agents/import/AgentImportWindow"),
  },

  // ── Content Editor ────────────────────────────────────────────────────────
  contentEditorWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/content-editors/ContentEditorWindow").then(
        (m) => ({ default: m.ContentEditorWindow }),
      ),
  },

  // ── Content Editor List ───────────────────────────────────────────────────
  contentEditorListWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/content-editors/ContentEditorListWindow").then(
        (m) => ({ default: m.ContentEditorListWindow }),
      ),
  },

  // ── Content Editor Workspace ──────────────────────────────────────────────
  contentEditorWorkspaceWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/content-editors/ContentEditorWorkspaceWindow").then(
        (m) => ({ default: m.ContentEditorWorkspaceWindow }),
      ),
  },

  // ── Agent Connections ─────────────────────────────────────────────────────
  agentConnectionsWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentConnectionsWindow"),
  },

  // ── Agent Placeholder Windows ─────────────────────────────────────────────
  agentOptimizerWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentPlaceholderWindows").then(
        (m) => ({ default: m.AgentOptimizerWindow }),
      ),
  },
  agentInterfaceVariationsWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentPlaceholderWindows").then(
        (m) => ({ default: m.AgentInterfaceVariationsWindow }),
      ),
  },
  agentCreateAppWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentCreateAppWindow"),
  },
  agentDataStorageWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentPlaceholderWindows").then(
        (m) => ({ default: m.AgentDataStorageWindow }),
      ),
  },
  agentFindUsagesWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentPlaceholderWindows").then(
        (m) => ({ default: m.AgentFindUsagesWindow }),
      ),
  },
  agentConvertSystemWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentConvertSystemWindow"),
  },
  agentAdminShortcutWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentShortcutQuickCreateWindow"),
  },
  agentAdminFindUsagesWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/AgentPlaceholderWindows").then(
        (m) => ({ default: m.AgentAdminFindUsagesWindow }),
      ),
  },

  // ── Tool Call Window ──────────────────────────────────────────────────────
  toolCallWindow: {
    componentImport: () =>
      import("@/features/tool-call-visualization/window-panel/ToolCallWindowPanel"),
  },

  // ── Observational Memory ──────────────────────────────────────────────────
  observationalMemoryWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/agents/ObservationalMemoryWindow"),
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  messagesWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/messaging/MessagesWindow"),
  },
  singleMessageWindow: {
    componentImport: () =>
      import("@/features/window-panels/windows/messaging/SingleMessageWindow"),
  },

  // ── Non-window overlays ───────────────────────────────────────────────────
  markdownEditor: {
    componentImport: () =>
      import("@/components/mardown-display/markdown-classification/FullscreenMarkdownEditor"),
  },
  socketAccordion: {
    componentImport: () =>
      import("@/components/socket/response/FullscreenSocketAccordion"),
  },
  brokerState: {
    componentImport: () =>
      import("@/features/applet/runner/response/FullscreenBrokerState"),
  },
  announcements: {
    componentImport: () =>
      import("@/components/layout/AnnouncementsViewer").then((m) => ({
        default: m.AnnouncementsViewer,
      })),
  },
  undoHistory: {
    componentImport: () =>
      import("@/features/agents/components/undo-history/UndoHistoryOverlay").then(
        (m) => ({ default: m.UndoHistoryOverlay }),
      ),
  },
  adminStateAnalyzer: {
    componentImport: () =>
      import("@/components/admin/state-analyzer/StateViewerOverlay"),
  },
  adminIndicator: {
    componentImport: () => import("@/components/admin/controls/AdminIndicator"),
  },

  // ── Image Peek Notifications ───────────────────────────────────────────────
  imagePeekHost: {
    componentImport: () =>
      import("@/features/agents/components/notifications/ImageArrivalPeekHost").then(
        (m) => ({ default: m.ImageArrivalPeekHost }),
      ),
  },
  htmlPreview: {
    componentImport: () =>
      import("@/features/cx-conversation/components/HtmlPreviewBridge").then(
        (m) => ({ default: m.HtmlPreviewBridge }),
      ),
  },
  fullScreenEditor: {
    componentImport: () =>
      import("@/components/mardown-display/chat-markdown/FullScreenMarkdownEditorBridge").then(
        (m) => ({ default: m.FullScreenMarkdownEditorBridge }),
      ),
  },
  contentHistory: {
    componentImport: () =>
      import("@/features/agents/components/TO-BE-ORGANIZED/ContentHistoryViewer").then(
        (m) => ({ default: m.ContentHistoryViewer }),
      ),
  },
  saveToNotes: {
    componentImport: () =>
      import("@/features/notes/actions/quick-save/QuickNoteSaveOverlay").then(
        (m) => ({ default: m.QuickNoteSaveOverlay }),
      ),
  },
  saveToNotesFullscreen: {
    componentImport: () =>
      import("@/features/notes/actions/quick-save/QuickNoteSaveOverlay").then(
        (m) => ({ default: m.QuickNoteSaveOverlay }),
      ),
  },
  saveToCode: {
    componentImport: () =>
      import("@/features/code-files/actions/QuickSaveCodeDialog").then((m) => ({
        default: m.QuickSaveCodeDialog,
      })),
  },
  quickNotes: {
    componentImport: () =>
      import("@/features/notes/actions/QuickNotesSheet").then((m) => ({
        default: m.QuickNotesSheet,
      })),
  },
  quickTasks: {
    componentImport: () =>
      import("@/features/tasks/components/QuickTasksSheet").then((m) => ({
        default: m.QuickTasksSheet,
      })),
  },
  quickChat: {
    componentImport: () =>
      import("@/features/quick-actions/components/QuickChatSheet").then(
        (m) => ({ default: m.QuickChatSheet }),
      ),
  },
  quickChatWindow: {
    componentImport: () =>
      import("@/features/quick-actions/components/QuickChatSheet").then(
        (m) => ({ default: m.QuickChatSheet }),
      ),
  },
  quickData: {
    componentImport: () =>
      import("@/features/quick-actions/components/QuickDataSheet").then(
        (m) => ({ default: m.QuickDataSheet }),
      ),
  },
  quickUtilities: {
    componentImport: () =>
      import("@/features/quick-actions/components/UtilitiesOverlay").then(
        (m) => ({ default: m.UtilitiesOverlay }),
      ),
  },
  userPreferences: {
    componentImport: () =>
      import("@/features/settings/components/SettingsShellOverlay"),
  },
  authGate: {
    componentImport: () =>
      import("@/components/dialogs/AuthGateDialog").then((m) => ({
        default: m.AuthGateDialog,
      })),
  },
  emailDialog: {
    // EmailDialogBridge subscribes to the overlay state itself, supplies the
    // missing `onSubmit` callback that can't travel through Redux, and wraps
    // the underlying EmailInputDialog. Going through this bridge is required
    // for the unauthenticated "Email to me" flow to actually work.
    componentImport: () => import("@/components/dialogs/EmailDialogBridge"),
  },
  shareModal: {
    componentImport: () =>
      import("@/features/sharing/components/ShareModal").then((m) => ({
        default: m.ShareModal,
      })),
  },

  // ── Agent widgets ──────────────────────────────────────────────────────
  agentFullModal: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentFullModal").then(
        (m) => ({ default: m.AgentFullModal }),
      ),
  },
  agentCompactModal: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentCompactModal").then(
        (m) => ({ default: m.AgentCompactModal }),
      ),
  },
  agentChatBubble: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentChatBubble").then(
        (m) => ({ default: m.AgentChatBubble }),
      ),
  },
  agentInlineOverlay: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentInlineOverlay").then(
        (m) => ({ default: m.AgentInlineOverlay }),
      ),
  },
  agentSidebarOverlay: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentSidebarOverlay").then(
        (m) => ({ default: m.AgentSidebarOverlay }),
      ),
  },
  agentFlexiblePanel: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentFlexiblePanel").then(
        (m) => ({ default: m.AgentFlexiblePanel }),
      ),
  },
  agentPanelOverlay: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentPanelOverlay").then(
        (m) => ({ default: m.AgentPanelOverlay }),
      ),
  },
  agentToastOverlay: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentToastOverlay").then(
        (m) => ({ default: m.AgentToastOverlay }),
      ),
  },
  agentFloatingChat: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/AgentFloatingChat").then(
        (m) => ({ default: m.AgentFloatingChat }),
      ),
  },
  agentChatCollapsible: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/ChatCollapsible").then(
        (m) => ({ default: m.ChatCollapsible }),
      ),
  },
  agentChatAssistant: {
    componentImport: () =>
      import("@/features/agents/components/agent-widgets/chat-assistant/AgentChatAssistant").then(
        (m) => ({ default: m.AgentChatAssistant }),
      ),
  },

  // ── WhatsApp Demo ───────────────────────────────────────────────────────────
  whatsappShellWindow: {
    componentImport: () =>
      import("@/features/whatsapp-clone/windows/WhatsAppShellWindow").then(
        (m) => ({ default: m.WhatsAppShellWindow }),
      ),
  },
  whatsappSettings: {
    componentImport: () =>
      import("@/features/whatsapp-clone/windows/WhatsAppSettingsWindow").then(
        (m) => ({ default: m.WhatsAppSettingsWindow }),
      ),
  },
  whatsappMedia: {
    componentImport: () =>
      import("@/features/whatsapp-clone/windows/WhatsAppMediaWindow").then(
        (m) => ({ default: m.WhatsAppMediaWindow }),
      ),
  },
};

// ─── Build full registry ───────────────────────────────────────────────────────

const REGISTRY: WindowRegistryEntry[] = ALL_WINDOW_STATIC_METADATA.map(
  (meta) => {
    const dynamic = DYNAMIC[meta.overlayId];
    if (!dynamic) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          `[windowRegistry] No componentImport found for overlayId: "${meta.overlayId}". ` +
            `Add an entry to the DYNAMIC map in windowRegistry.ts.`,
        );
      }
      // Fallback: render nothing (prevents a crash while surfacing the error)
      return {
        ...meta,
        componentImport: async () => ({
          default: () => null as unknown as React.ReactElement,
        }),
      } as WindowRegistryEntry;
    }
    return { ...meta, ...dynamic } as WindowRegistryEntry;
  },
);

// ─── Lookup maps ──────────────────────────────────────────────────────────────

/** Map from slug → entry (for DB lookups) */
export const WINDOW_REGISTRY_BY_SLUG: ReadonlyMap<string, WindowRegistryEntry> =
  new Map(REGISTRY.map((e) => [e.slug, e]));

/** Map from overlayId → entry (for component lookups) */
export const WINDOW_REGISTRY_BY_OVERLAY_ID: ReadonlyMap<
  string,
  WindowRegistryEntry
> = new Map(REGISTRY.map((e) => [e.overlayId, e]));

/** All registered entries (for iteration). */
export const ALL_WINDOW_REGISTRY_ENTRIES: ReadonlyArray<WindowRegistryEntry> =
  REGISTRY;

// ─── Public lookup API ────────────────────────────────────────────────────────

/**
 * Look up a registry entry by its overlay ID.
 * Returns undefined if the overlayId is not registered.
 */
export function getRegistryEntryByOverlayId(
  overlayId: string,
): WindowRegistryEntry | undefined {
  return WINDOW_REGISTRY_BY_OVERLAY_ID.get(overlayId);
}

/**
 * Look up a registry entry by its slug.
 * Returns undefined if the slug is not found.
 */
export function getRegistryEntryBySlug(
  slug: string,
): WindowRegistryEntry | undefined {
  return WINDOW_REGISTRY_BY_SLUG.get(slug);
}

/**
 * True when the given overlayId maps to a non-ephemeral registered window.
 */
export function isPersistableWindow(overlayId: string): boolean {
  const entry = WINDOW_REGISTRY_BY_OVERLAY_ID.get(overlayId);
  return entry !== undefined && !entry.ephemeral;
}

/**
 * Filter entries by kind. Useful for the unified renderer's per-kind
 * render loops.
 */
export function getEntriesByKind(
  kind: import("./windowRegistryTypes").OverlayKind,
): WindowRegistryEntry[] {
  return REGISTRY.filter((e) => e.kind === kind);
}

/**
 * Dev-only runtime assertion — called once at startup to catch missing
 * required fields before they cause silent failures at render time.
 */
export function assertRegistryIntegrity(): void {
  const seenOverlayIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const errors: string[] = [];

  for (const entry of REGISTRY) {
    if (seenOverlayIds.has(entry.overlayId)) {
      errors.push(`Duplicate overlayId: ${entry.overlayId}`);
    }
    if (seenSlugs.has(entry.slug)) {
      errors.push(`Duplicate slug: ${entry.slug}`);
    }
    seenOverlayIds.add(entry.overlayId);
    seenSlugs.add(entry.slug);

    if (entry.kind === "window" && !entry.mobilePresentation) {
      errors.push(
        `Entry ${entry.overlayId}: kind "window" requires mobilePresentation`,
      );
    }
    if (typeof entry.componentImport !== "function") {
      errors.push(
        `Entry ${entry.overlayId}: componentImport must be a function`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `windowRegistry integrity errors:\n  - ${errors.join("\n  - ")}`,
    );
  }
}

// Also re-export static metadata helpers for convenience
export {
  getStaticEntryByOverlayId,
  getStaticEntryBySlug,
  ALL_WINDOW_STATIC_METADATA,
} from "./windowRegistryMetadata";
