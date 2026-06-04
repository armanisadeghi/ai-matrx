/**
 * windowRegistryMetadata.ts
 *
 * Static metadata for all registered overlays — no componentImport,
 * no renderTrayPreview, no captureTraySnapshot. This file has ZERO
 * dynamic-import expressions and is safe to import from WindowPanel,
 * WindowPersistenceManager, and any other module that only needs to
 * look up window metadata without pulling in component code.
 *
 * The full registry (with dynamic componentImport functions) lives in
 * windowRegistry.ts and should only be imported by the renderer
 * (UnifiedOverlayController).
 */

import type {
  WindowStaticMetadata,
  OverlayKind,
  MobilePresentation,
  MobileSidebarAs,
  InstanceMode,
} from "./windowRegistryTypes";

// Re-export types so callers can import them from one place
export type {
  WindowStaticMetadata,
  OverlayKind,
  MobilePresentation,
  InstanceMode,
  MobileSidebarAs,
} from "./windowRegistryTypes";
export type {
  PanelState,
  WindowSessionRow,
  TrayPreviewContext,
} from "./windowRegistryTypes";

// ─── Static registry ──────────────────────────────────────────────────────────

const STATIC_REGISTRY: WindowStaticMetadata[] = [
  // ── Code Workspace ────────────────────────────────────────────────────────
  {
    slug: "code-workspace",
    overlayId: "codeWorkspaceWindow",
    kind: "window",
    label: "Code Workspace",
    defaultData: { title: null, sandboxId: null },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  // ── Code Editor ───────────────────────────────────────────────────────────
  {
    slug: "code-editor-window",
    overlayId: "codeEditorWindow",
    kind: "window",
    label: "Code Editor",
    defaultData: {
      files: [],
      fileIds: [],
      activeFile: null,
      activeFileId: null,
      title: null,
    },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  // ── Code File Manager ─────────────────────────────────────────────────────
  {
    slug: "code-file-manager-window",
    overlayId: "codeFileManagerWindow",
    kind: "window",
    label: "Code Files",
    defaultData: {
      selectedFolderId: null,
      searchQuery: "",
      sortBy: "updated",
    },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    instanceMode: "multi",
  },

  // ── Multi-file Smart Code Editor ──────────────────────────────────────────
  {
    slug: "multi-file-smart-code-editor-window",
    overlayId: "multiFileSmartCodeEditorWindow",
    kind: "window",
    label: "Smart Multi-file Editor",
    defaultData: {
      agentId: null,
      files: [],
      initialActiveFile: null,
      title: null,
      defaultWordWrap: "off",
      autoFormatOnOpen: false,
      variables: null,
    },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  // ── Smart Code Editor ─────────────────────────────────────────────────────
  {
    slug: "smart-code-editor-window",
    overlayId: "smartCodeEditorWindow",
    kind: "window",
    label: "Smart Code Editor",
    defaultData: {
      agentId: null,
      initialCode: "",
      language: "plaintext",
      filePath: null,
      selection: null,
      diagnostics: null,
      title: null,
      variables: null,
    },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  // ── Notes (canonical — overlayId stays `notesBetaWindow` for session
  // compatibility; component is now exported as NotesWindow from
  // NotesBetaWindow.tsx). ─────────────────────────────────────────────────
  {
    slug: "notes-beta-window",
    overlayId: "notesBetaWindow",
    kind: "window",
    label: "Notes",
    defaultData: { openNoteId: null, title: undefined },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  // ── Note Info ─────────────────────────────────────────────────────────────
  // Per-note metadata + context inspector. Opened from the note tab's info
  // icon; tied to a specific note so it's ephemeral (nothing to restore).
  {
    slug: "note-info-window",
    overlayId: "noteInfoWindow",
    kind: "window",
    label: "Note Info",
    defaultData: { noteId: null, title: undefined },
    ephemeral: true,
    mobilePresentation: "drawer",
  },

  // ── Notes (legacy) — kept until window-demo + persistence-test are retired
  {
    slug: "notes-window",
    overlayId: "notesWindow",
    kind: "window",
    label: "Notes (legacy)",
    defaultData: {
      initialTabs: [],
      initialActiveTab: null,
      singleNoteId: null,
    },
    mobilePresentation: "fullscreen",
    urlSync: { key: "notes" },
    deprecated: {
      replacedBy: "notesBetaWindow",
      note: "Replaced by the canonical Notes window (overlayId `notesBetaWindow`). Only kept while the window-demo and persistence-test admin pages still reference it.",
    },
  },

  // ── Quick Note Save ───────────────────────────────────────────────────────
  {
    slug: "quick-note-save-window",
    overlayId: "quickNoteSaveWindow",
    kind: "window",
    label: "Quick Save Note",
    defaultData: { initialContent: "", defaultFolder: "Scratch" },
    ephemeral: true,
    mobilePresentation: "drawer",
  },

  // ── Quick Data ────────────────────────────────────────────────────────────
  {
    slug: "quick-data-window",
    overlayId: "quickDataWindow",
    kind: "window",
    label: "Data Tables",
    defaultData: { selectedTable: null, search: "", filters: {} },
    mobilePresentation: "fullscreen",
    urlSync: { key: "quick_data" },
  },

  // ── Quick Tasks ───────────────────────────────────────────────────────────
  {
    slug: "quick-tasks-window",
    overlayId: "quickTasksWindow",
    kind: "window",
    label: "Tasks",
    defaultData: { orgId: null, projectId: null, taskId: null, search: "" },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    urlSync: { key: "quick_tasks" },
  },

  // ── Quick Task Create ─────────────────────────────────────────────────────
  {
    slug: "task-quick-create-window",
    overlayId: "taskQuickCreateWindow",
    kind: "window",
    label: "Create Task",
    defaultData: {
      entity_type: null,
      entity_id: null,
      label: "",
      metadata: {},
      source: undefined,
      prePopulate: { title: "", description: "", priority: null },
    },
    ephemeral: true,
    mobilePresentation: "drawer",
  },

  // ── Cloud Files ───────────────────────────────────────────────────────────
  {
    slug: "cloud-files-window",
    overlayId: "cloudFilesWindow",
    kind: "window",
    label: "Cloud Files",
    defaultData: { activeTab: "browse" },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
    urlSync: { key: "cloud_files" },
  },

  // ── Creator Hub ─────────────────────────────────────────────────────────
  {
    slug: "creator-hub-window",
    overlayId: "creatorHub",
    kind: "window",
    label: "Creator Hub",
    defaultData: { activeTab: "settings" },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
    urlSync: { key: "creator_hub" },
  },

  // ── File Preview ──────────────────────────────────────────────────────────
  {
    slug: "file-preview-window",
    overlayId: "filePreviewWindow",
    kind: "window",
    label: "File preview",
    defaultData: { fileId: null },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    urlSync: { key: "file_preview" },
  },

  // ── Web Scraper ───────────────────────────────────────────────────────────
  {
    slug: "scraper-window",
    overlayId: "scraperWindow",
    kind: "window",
    label: "Web Scraper",
    defaultData: {
      mode: "single",
      url: "",
      keyword: "",
      maxPages: 1,
      results: [],
      scrapeStates: {},
      selectedIndex: null,
      activeTab: "results",
    },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
    urlSync: { key: "scraper" },
  },

  // ── PDF Extractor ─────────────────────────────────────────────────────────
  {
    slug: "pdf-extractor-window",
    overlayId: "pdfExtractorWindow",
    kind: "window",
    label: "PDF Extractor",
    defaultData: { history: [], currentIndex: null },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
  },

  // ── Gallery ───────────────────────────────────────────────────────────────
  {
    slug: "gallery-window",
    overlayId: "galleryWindow",
    kind: "window",
    label: "Gallery",
    defaultData: {
      query: "",
      orientation: "all",
      viewMode: "grid",
      favorites: [],
    },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
    urlSync: { key: "gallery" },
  },

  // ── News ──────────────────────────────────────────────────────────────────
  {
    slug: "news-window",
    overlayId: "newsWindow",
    kind: "window",
    label: "News",
    defaultData: { category: "general", country: "us" },
    mobilePresentation: "fullscreen",
    urlSync: { key: "news" },
  },

  // ── Embedded browser ─────────────────────────────────────────────────────
  {
    slug: "browser-frame-window",
    overlayId: "browserFrameWindow",
    kind: "window",
    label: "Site frame",
    defaultData: {
      initialUrl: "https://lucide.dev/icons/",
      initialWindowTitle: null,
    },
    mobilePresentation: "fullscreen",
  },
  {
    slug: "browser-workbench-window",
    overlayId: "browserWorkbenchWindow",
    kind: "window",
    label: "Site workbench",
    defaultData: { bookmarks: [], tabs: [], activeTabId: null },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
  },

  // ── List Manager ──────────────────────────────────────────────────────────
  {
    slug: "list-manager-window",
    overlayId: "listManagerWindow",
    kind: "window",
    label: "List Manager",
    defaultData: { activeListId: null },
    mobilePresentation: "fullscreen",
    urlSync: { key: "listManager" },
  },

  // ── Picklist Manager V1 (sidebar + spreadsheet) ───────────────────────────
  {
    slug: "picklist-manager-v1-window",
    overlayId: "picklistManagerV1Window",
    kind: "window",
    label: "Picklists — v1",
    defaultData: { forcedListId: null, title: null },
    mobilePresentation: "fullscreen",
    urlSync: { key: "picklistManagerV1" },
  },

  // ── Picklist Manager V2 (compact switcher + flat table) ───────────────────
  {
    slug: "picklist-manager-v2-window",
    overlayId: "picklistManagerV2Window",
    kind: "window",
    label: "Picklists — v2",
    defaultData: { forcedListId: null, title: null },
    mobilePresentation: "fullscreen",
    urlSync: { key: "picklistManagerV2" },
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  {
    slug: "user-preferences-window",
    overlayId: "userPreferencesWindow",
    kind: "window",
    label: "Settings",
    defaultData: { initialTabId: null },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    urlSync: { key: "user_preferences" },
  },

  // ── Agent Settings ────────────────────────────────────────────────────────
  {
    slug: "agent-settings-window",
    overlayId: "agentSettingsWindow",
    kind: "window",
    label: "Agent Settings",
    defaultData: { initialAgentId: null },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    urlSync: { key: "agent-settings" },
  },

  // ── Agent Run History ─────────────────────────────────────────────────────
  {
    slug: "agent-run-history-window",
    overlayId: "agentRunHistoryWindow",
    kind: "window",
    label: "Run History",
    defaultData: { agentId: null, initialSelectedConversationId: null },
    mobilePresentation: "fullscreen",
  },

  // ── Agent Run ─────────────────────────────────────────────────────────────
  {
    slug: "agent-run-window",
    overlayId: "agentRunWindow",
    kind: "window",
    label: "Agent Run",
    defaultData: { initialAgentId: null, initialSelectedConversationId: null },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
    urlSync: { key: "agent" },
  },

  // ── Agent Content (advanced editor) ──────────────────────────────────────
  {
    slug: "agent-advanced-editor-window",
    overlayId: "agentAdvancedEditorWindow",
    kind: "window",
    label: "Agent Advanced Editor",
    defaultData: { initialAgentId: null, initialTab: "messages", tabs: null },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    urlSync: { key: "agent-content" },
  },

  // ── Agent Content Sidebar ─────────────────────────────────────────────────
  {
    slug: "agent-content-sidebar-window",
    overlayId: "agentContentSidebarWindow",
    kind: "window",
    label: "Agent Editor (Sidebar)",
    defaultData: { initialAgentId: null, activeTab: "messages" },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    deprecated: {
      replacedBy: "agentAdvancedEditorWindow",
      note: "The Advanced Editor now ships the same sidebar + multi-agent tabs + dirty-change guard by default. Open both side-by-side to confirm parity, then this window will be removed.",
    },
  },

  // ── Agent Gate ────────────────────────────────────────────────────────────
  {
    slug: "agent-gate-window",
    overlayId: "agentGateWindow",
    kind: "window",
    label: "Agent Gate",
    defaultData: { conversationId: null },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  // ── Chat Debug ────────────────────────────────────────────────────────────
  {
    slug: "chat-debug-window",
    overlayId: "chatDebugWindow",
    kind: "window",
    label: "Chat Debug",
    defaultData: { sessionId: null },
    ephemeral: true,
    mobilePresentation: "card",
  },

  // ── Agent Debug ───────────────────────────────────────────────────────────
  {
    slug: "agent-debug-window",
    overlayId: "agentDebugWindow",
    kind: "window",
    label: "Agent Debug",
    defaultData: { initialAgentId: null, initialConversationId: null },
    ephemeral: true,
    mobilePresentation: "card",
  },

  // ── Instance UI State ─────────────────────────────────────────────────────
  {
    slug: "instance-ui-state-window",
    overlayId: "instanceUIStateWindow",
    kind: "window",
    label: "Instance UI State",
    defaultData: { selectedConversationId: null },
    ephemeral: true,
    mobilePresentation: "card",
  },

  // ── Execution Inspector ───────────────────────────────────────────────────
  {
    slug: "exec-inspector-window",
    overlayId: "executionInspectorWindow",
    kind: "window",
    label: "Execution Inspector",
    defaultData: {},
    ephemeral: true,
    mobilePresentation: "card",
    urlSync: { key: "exec-inspector" },
  },

  // ── Context Switcher ──────────────────────────────────────────────────────
  {
    slug: "context-switcher-window",
    overlayId: "contextSwitcherWindow",
    kind: "window",
    label: "Context Switcher",
    defaultData: {},
    mobilePresentation: "drawer",
  },

  // ── Hierarchy Creation ────────────────────────────────────────────────────
  {
    slug: "hierarchy-creation-window",
    overlayId: "hierarchyCreationWindow",
    kind: "window",
    label: "New Organization / Project",
    defaultData: { entityType: null, presetIds: {} },
    ephemeral: true,
    mobilePresentation: "drawer",
  },

  // ── Canvas Viewer ─────────────────────────────────────────────────────────
  {
    slug: "canvas-viewer-window",
    overlayId: "canvasViewerWindow",
    kind: "window",
    label: "Canvas Viewer",
    defaultData: { shareToken: null },
    mobilePresentation: "fullscreen",
  },

  // ── Feedback ──────────────────────────────────────────────────────────────
  {
    slug: "feedback-window",
    overlayId: "feedbackDialog",
    kind: "window",
    label: "Feedback",
    defaultData: { draftText: null, attachmentUrls: [] },
    mobilePresentation: "drawer",
    urlSync: { key: "feedback" },
  },

  // ── Share Modal Window ────────────────────────────────────────────────────
  {
    slug: "share-modal-window",
    overlayId: "shareModalWindow",
    kind: "window",
    label: "Share",
    defaultData: {
      resourceType: null,
      resourceId: null,
      resourceName: null,
      isOwner: false,
    },
    mobilePresentation: "drawer",
    urlSync: { key: "share_modal" },
  },

  // ── Email Dialog ──────────────────────────────────────────────────────────
  {
    slug: "email-dialog-window",
    overlayId: "emailDialogWindow",
    kind: "window",
    label: "Email",
    defaultData: { to: null, subject: null, draftBody: null },
    mobilePresentation: "drawer",
    urlSync: { key: "email_dialog" },
  },

  // ── Markdown Editor ───────────────────────────────────────────────────────
  {
    slug: "markdown-editor-window",
    overlayId: "markdownEditorWindow",
    kind: "window",
    label: "Markdown Editor",
    defaultData: {
      content: null,
      processorId: null,
      coordinatorId: null,
      sampleId: null,
    },
    mobilePresentation: "fullscreen",
    urlSync: { key: "markdown_editor" },
  },

  // ── Image Viewer ──────────────────────────────────────────────────────────
  {
    slug: "image-viewer-window",
    overlayId: "imageViewer",
    kind: "window",
    label: "Image Viewer",
    defaultData: {
      images: [],
      initialIndex: 0,
      alts: undefined,
      title: undefined,
    },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  // ── Curated Icon Picker ───────────────────────────────────────────────────
  // Floating gallery for picking from the curated icon set. Open via
  // `useOpenCuratedIconPickerWindow()` and listen for the `picked` event.
  {
    slug: "curated-icon-picker-window",
    overlayId: "curatedIconPickerWindow",
    kind: "window",
    label: "Icon Picker",
    defaultData: { callbackGroupId: null as string | null },
    mobilePresentation: "drawer",
    instanceMode: "multi",
    ephemeral: true,
  },

  // ── Crop Studio ───────────────────────────────────────────────────────────
  {
    slug: "crop-studio-window",
    overlayId: "cropStudioWindow",
    kind: "window",
    label: "Crop Studio",
    defaultData: {
      folderId: null as string | null,
      defaultFolderPath: "Images/Crops",
      aspect: null as number | null,
    },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
    urlSync: { key: "crop_studio" },
  },

  // ── Image Uploader ────────────────────────────────────────────────────────
  {
    slug: "image-uploader-window",
    overlayId: "imageUploaderWindow",
    kind: "window",
    label: "Upload Image",
    defaultData: {
      callbackGroupId: null,
      preset: "social",
      bucket: null,
      folder: null,
      title: null,
      description: null,
      currentUrl: null,
      allowUrlPaste: true,
    },
    ephemeral: true,
    mobilePresentation: "drawer",
    instanceMode: "multi",
  },

  // ── AI Voice ──────────────────────────────────────────────────────────────
  {
    slug: "ai-voice-window",
    overlayId: "aiVoiceWindow",
    kind: "window",
    label: "AI Voice",
    defaultData: { voiceId: null, speed: null, model: null },
    mobilePresentation: "fullscreen",
    urlSync: { key: "aiVoiceWindow" },
  },

  // ── Voice Pad ─────────────────────────────────────────────────────────────
  // Voice-pad components rely on `instanceId` (Redux selectors, mic id,
  // window id, urlSyncId) so they MUST be rendered through the
  // multi-instance surface — singleton mode does not pass `instanceId`
  // and silently breaks state isolation.
  {
    slug: "voice-pad",
    overlayId: "voicePad",
    kind: "window",
    label: "Voice Pad",
    defaultData: { transcript: null },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
    urlSync: { key: "voice" },
  },
  {
    slug: "voice-pad-advanced",
    overlayId: "voicePadAdvanced",
    kind: "window",
    label: "Advanced Voice Pad",
    defaultData: { transcript: null },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },
  {
    slug: "transcription-cleanup",
    overlayId: "transcriptionCleanup",
    kind: "window",
    label: "Transcription Cleanup",
    defaultData: { transcript: null },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  {
    // 4-column live transcription studio. Same `StudioView` as the route
    // at /transcription/studio, but mounted inside a floating WindowPanel so
    // users can record + watch agents work without leaving the page they're
    // on. Recording continues across navigation because the recorder lives
    // in the global provider.
    slug: "transcript-studio-window",
    overlayId: "transcriptStudioWindow",
    kind: "window",
    label: "Transcript Studio",
    defaultData: { activeSessionId: null },
    mobilePresentation: "fullscreen",
    urlSync: { key: "studio" },
  },

  // ── Chat History ──────────────────────────────────────────────────────────
  // Cross-agent conversation history. Sidebar groups by date (default) or by
  // agent, with search + agent multi-select filter. Replaces the legacy
  // "quick-ai-results" sheet that pointed at the deprecated prompts system.
  //
  // 2026-05-05 RENAME: previously slug "quick-ai-results" / overlayId
  // "quickAIResults" / file AIResultsWindow.tsx. Existing window_sessions
  // rows are migrated automatically by WindowPersistenceManager
  // (SLUG_MIGRATIONS map). New code MUST use "quick-chat-history" /
  // "quickChatHistory".
  {
    slug: "quick-chat-history",
    overlayId: "quickChatHistory",
    kind: "window",
    label: "Chat History",
    defaultData: { selectedConversationId: null, groupBy: "date" },
    mobilePresentation: "fullscreen",
  },

  // ── Stream Debug ──────────────────────────────────────────────────────────
  {
    slug: "stream-debug",
    overlayId: "streamDebug",
    kind: "widget",
    label: "Stream Debug",
    defaultData: { conversationId: null, requestIdOverride: undefined },
    ephemeral: true,
  },

  // ── Message Analysis ──────────────────────────────────────────────────────
  {
    slug: "message-analysis-window",
    overlayId: "messageAnalysisWindow",
    kind: "window",
    label: "Response Analysis",
    defaultData: {
      conversationId: null,
      requestId: null,
      messageId: null,
      activeTab: "request",
    },
    ephemeral: true,
    mobilePresentation: "card",
  },

  // ── Stream Debug History ──────────────────────────────────────────────────
  {
    slug: "stream-debug-history",
    overlayId: "streamDebugHistoryWindow",
    kind: "window",
    label: "Stream History",
    defaultData: { initialConversationId: null },
    ephemeral: true,
    mobilePresentation: "card",
  },

  // ── State Analyzer ────────────────────────────────────────────────────────
  {
    slug: "state-analyzer-window",
    overlayId: "adminStateAnalyzerWindow",
    kind: "window",
    label: "State Analyzer",
    defaultData: {},
    ephemeral: true,
    mobilePresentation: "card",
    urlSync: { key: "state_analyzer" },
  },

  // ── JSON Truncator ────────────────────────────────────────────────────────
  {
    slug: "json-truncator",
    overlayId: "jsonTruncator",
    kind: "modal",
    label: "JSON Truncator",
    defaultData: { input: null },
    ephemeral: true,
    urlSync: { key: "json_truncator" },
  },

  // ── Resource Picker ───────────────────────────────────────────────────────
  {
    slug: "resource-picker-window",
    overlayId: "resourcePickerWindow",
    kind: "window",
    label: "Resource Picker",
    defaultData: { lastResourceType: null },
    ephemeral: true,
    mobilePresentation: "drawer",
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  {
    slug: "projects-window",
    overlayId: "projectsWindow",
    kind: "window",
    label: "Projects",
    defaultData: { orgId: null },
    mobilePresentation: "fullscreen",
  },

  // ── Agent MD Debug ────────────────────────────────────────────────────────
  {
    slug: "agent-md-debug-window",
    overlayId: "agentAssistantMarkdownDebugWindow",
    kind: "window",
    label: "MD Debug",
    defaultData: {},
    ephemeral: true,
    mobilePresentation: "card",
    urlSync: { key: "agent-md-debug" },
  },

  // ── Agent Import ──────────────────────────────────────────────────────────
  {
    slug: "agent-import-window",
    overlayId: "agentImportWindow",
    kind: "window",
    label: "Import Agent",
    defaultData: { selectedSource: "agent-json", pastedText: "" },
    mobilePresentation: "drawer",
  },

  // ── Content Editor ────────────────────────────────────────────────────────
  {
    slug: "content-editor-window",
    overlayId: "contentEditorWindow",
    kind: "window",
    label: "Content Editor",
    defaultData: {
      documentId: "default",
      documentTitle: null,
      value: "",
      title: null,
    },
    mobilePresentation: "fullscreen",
    instanceMode: "multi",
  },

  // ── Content Editor List ───────────────────────────────────────────────────
  {
    slug: "content-editor-list-window",
    overlayId: "contentEditorListWindow",
    kind: "window",
    label: "Content List Editor",
    defaultData: {
      documents: [],
      activeDocumentId: null,
      listTitle: null,
      title: null,
    },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    instanceMode: "multi",
  },

  // ── Content Editor Workspace ──────────────────────────────────────────────
  {
    slug: "content-editor-workspace-window",
    overlayId: "contentEditorWorkspaceWindow",
    kind: "window",
    label: "Content Workspace",
    defaultData: {
      documents: [],
      openDocumentIds: [],
      activeDocumentId: null,
      listTitle: null,
      title: null,
    },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    instanceMode: "multi",
  },

  // ── Agent Connections ─────────────────────────────────────────────────────
  {
    slug: "agent-connections-window",
    overlayId: "agentConnectionsWindow",
    kind: "window",
    label: "Agent Connections",
    defaultData: {
      activeSection: "overview",
      scope: "user",
      scopeId: null,
      selectedItemId: null,
    },
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
  },

  // ── Agent Placeholder Windows ─────────────────────────────────────────────
  {
    slug: "agent-optimizer-window",
    overlayId: "agentOptimizerWindow",
    kind: "window",
    label: "Matrx Agent Optimizer",
    defaultData: { agentId: null },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    deprecated: {
      note: "Stub — not yet implemented. Will be removed if no implementation lands.",
    },
  },
  {
    slug: "agent-interface-variations-window",
    overlayId: "agentInterfaceVariationsWindow",
    kind: "window",
    label: "Interface Variations",
    defaultData: { agentId: null },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    deprecated: {
      note: "Stub — not yet implemented. Will be removed if no implementation lands.",
    },
  },
  {
    slug: "agent-create-app-window",
    overlayId: "agentCreateAppWindow",
    kind: "window",
    label: "Create Agent App",
    defaultData: { agentId: null },
    ephemeral: true,
    mobilePresentation: "fullscreen",
  },
  {
    slug: "agent-data-storage-window",
    overlayId: "agentDataStorageWindow",
    kind: "window",
    label: "Data Storage Support",
    defaultData: { agentId: null },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    deprecated: {
      note: "Stub — not yet implemented. Will be removed if no implementation lands.",
    },
  },
  {
    slug: "agent-find-usages-window",
    overlayId: "agentFindUsagesWindow",
    kind: "window",
    label: "Find Usages",
    defaultData: { agentId: null },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    deprecated: {
      note: "Stub — not yet implemented. Will be removed if no implementation lands.",
    },
  },
  {
    slug: "agent-convert-system-window",
    overlayId: "agentConvertSystemWindow",
    kind: "window",
    label: "Convert to System Agent",
    defaultData: { agentId: null },
    ephemeral: true,
    mobilePresentation: "fullscreen",
  },
  {
    slug: "agent-admin-shortcut-window",
    overlayId: "agentAdminShortcutWindow",
    kind: "window",
    label: "Create Shortcut",
    defaultData: { agentId: null, activeTab: "essentials" },
    ephemeral: true,
    mobilePresentation: "drawer",
  },
  {
    slug: "agent-admin-find-usages-window",
    overlayId: "agentAdminFindUsagesWindow",
    kind: "window",
    label: "Find Usages (Admin)",
    defaultData: { agentId: null },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    deprecated: {
      note: "Stub — not yet implemented. Will be removed if no implementation lands.",
    },
  },

  // ── Tool Call Window ──────────────────────────────────────────────────────
  {
    slug: "tool-call-window",
    overlayId: "toolCallWindow",
    kind: "window",
    label: "Tool Results",
    defaultData: {
      requestId: null,
      callIds: [],
      entries: null,
      initialCallId: null,
      initialTab: null,
    },
    ephemeral: true,
    instanceMode: "multi",
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
  },

  // ── Observational Memory ──────────────────────────────────────────────────
  {
    slug: "observational-memory-window",
    overlayId: "observationalMemoryWindow",
    kind: "window",
    label: "Memory Inspector",
    defaultData: { initialSelectedConversationId: null },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
  },

  // ── Messages (sidebar list + chat thread) ────────────────────────────────
  {
    slug: "messages-window",
    overlayId: "messagesWindow",
    kind: "window",
    label: "Messages",
    defaultData: { conversationId: null, search: "" },
    mobilePresentation: "fullscreen",
    mobileSidebarAs: "drawer",
    urlSync: { key: "messages" },
  },

  // ── Single conversation (just one chat thread, multi-instance) ───────────
  {
    slug: "single-message-window",
    overlayId: "singleMessageWindow",
    kind: "window",
    label: "Conversation",
    defaultData: { conversationId: null },
    mobilePresentation: "drawer",
    instanceMode: "multi",
  },

  // ── Non-window overlays (widgets / sheets / modals) ───────────────────────

  {
    slug: "markdown-editor-fullscreen",
    overlayId: "markdownEditor",
    kind: "widget",
    label: "Markdown Editor (fullscreen)",
    defaultData: {
      initialMarkdown: undefined,
      showConfigSelector: undefined,
      showSampleSelector: undefined,
    },
    ephemeral: true,
  },
  {
    slug: "socket-accordion-fullscreen",
    overlayId: "socketAccordion",
    kind: "widget",
    label: "Socket Accordion",
    defaultData: { taskId: undefined },
    ephemeral: true,
  },
  {
    slug: "broker-state-fullscreen",
    overlayId: "brokerState",
    kind: "widget",
    label: "Broker State",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "announcements",
    overlayId: "announcements",
    kind: "widget",
    label: "Announcements",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "undo-history",
    overlayId: "undoHistory",
    kind: "widget",
    label: "Undo History",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "admin-state-analyzer",
    overlayId: "adminStateAnalyzer",
    kind: "widget",
    label: "State Analyzer (overlay)",
    defaultData: {},
    ephemeral: true,
  },
  {
    // Floating admin indicator chip (size cycler + drag handle). Toggled
    // from sidebar/menu items via dispatch(toggleOverlay({ overlayId:
    // "adminIndicator" })). Registered as a widget so the unified renderer
    // owns the mount instead of the bespoke AdminIndicatorWrapper. The
    // component itself self-gates on selectIsSuperAdmin — non-admins never
    // download the chunk because nothing in their UI dispatches the toggle.
    slug: "admin-indicator",
    overlayId: "adminIndicator",
    kind: "widget",
    label: "Admin Indicator",
    defaultData: {},
    ephemeral: true,
  },
  {
    // Bottom-right toast stack that pops up whenever an AI image_output
    // block arrives in any active stream.  Opened automatically by
    // process-stream.ts (dispatch openOverlay) — no user action required.
    // Self-closes when all peek cards are dismissed. Clicking a card opens
    // the full ImageViewerWindow. Ephemeral so the stack never persists
    // across page loads.
    slug: "image-peek-host",
    overlayId: "imagePeekHost",
    kind: "widget",
    label: "Image Peek Notifications",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "html-preview",
    overlayId: "htmlPreview",
    kind: "widget",
    label: "HTML Preview",
    defaultData: {
      content: "",
      messageId: undefined,
      conversationId: undefined,
      title: undefined,
      description: undefined,
      onSave: undefined,
      showSaveButton: undefined,
      isAgentSystem: undefined,
    },
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "full-screen-editor",
    overlayId: "fullScreenEditor",
    kind: "widget",
    label: "Fullscreen Chat Editor",
    defaultData: {
      content: "",
      mode: undefined,
      conversationId: undefined,
      messageId: undefined,
      onSave: undefined,
      tabs: undefined,
      initialTab: undefined,
      analysisData: undefined,
      title: undefined,
      description: undefined,
      showSaveButton: undefined,
      showCopyButton: undefined,
    },
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "content-history",
    overlayId: "contentHistory",
    kind: "widget",
    label: "Content History",
    defaultData: { sessionId: null, messageId: null },
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "save-to-notes",
    overlayId: "saveToNotes",
    kind: "widget",
    label: "Save to Notes",
    defaultData: {
      initialContent: "",
      defaultFolder: undefined,
      initialEditorMode: undefined,
    },
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "save-to-notes-fullscreen",
    overlayId: "saveToNotesFullscreen",
    kind: "widget",
    label: "Save to Notes (fullscreen)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "save-to-code",
    overlayId: "saveToCode",
    kind: "widget",
    label: "Save Code",
    defaultData: {
      initialContent: "",
      initialLanguage: undefined,
      suggestedName: undefined,
      defaultFolderId: null,
    },
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "quick-notes-sheet",
    overlayId: "quickNotes",
    kind: "sheet",
    label: "Quick Notes",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "quick-tasks-sheet",
    overlayId: "quickTasks",
    kind: "sheet",
    label: "Quick Tasks",
    defaultData: { prePopulate: undefined, content: undefined },
    ephemeral: true,
  },
  {
    slug: "quick-chat-sheet",
    overlayId: "quickChat",
    kind: "sheet",
    label: "Quick Chat",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "quick-chat-window",
    overlayId: "quickChatWindow",
    kind: "window",
    label: "Quick Chat",
    defaultData: {},
    mobilePresentation: "fullscreen",
    ephemeral: true,
  },
  {
    slug: "quick-data-sheet",
    overlayId: "quickData",
    kind: "sheet",
    label: "Quick Data",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "quick-utilities-sheet",
    overlayId: "quickUtilities",
    kind: "sheet",
    label: "Utilities",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "user-preferences-modal",
    overlayId: "userPreferences",
    kind: "modal",
    label: "Settings",
    defaultData: {},
    ephemeral: true,
  },
  {
    slug: "auth-gate-modal",
    overlayId: "authGate",
    kind: "modal",
    label: "Sign-in Gate",
    defaultData: { featureName: null, featureDescription: null },
    ephemeral: true,
  },
  {
    slug: "email-input-dialog",
    overlayId: "emailDialog",
    kind: "modal",
    label: "Email Input",
    defaultData: { content: "", metadata: null, title: null },
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "share-modal-bridge",
    overlayId: "shareModal",
    kind: "modal",
    label: "Share",
    defaultData: {
      resourceType: null,
      resourceId: null,
      resourceName: null,
      isOwner: false,
    },
    ephemeral: true,
    instanceMode: "multi",
  },

  // ── Agent widgets ─────────────────────────────────────────────────────────
  {
    slug: "agent-full-modal",
    overlayId: "agentFullModal",
    kind: "widget",
    label: "Agent (full modal)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-compact-modal",
    overlayId: "agentCompactModal",
    kind: "widget",
    label: "Agent (compact)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-chat-bubble",
    overlayId: "agentChatBubble",
    kind: "widget",
    label: "Agent Chat Bubble",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-inline-overlay",
    overlayId: "agentInlineOverlay",
    kind: "widget",
    label: "Agent (inline)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-sidebar-overlay",
    overlayId: "agentSidebarOverlay",
    kind: "widget",
    label: "Agent (sidebar)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-flexible-panel",
    overlayId: "agentFlexiblePanel",
    kind: "widget",
    label: "Agent (flexible)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-panel-overlay",
    overlayId: "agentPanelOverlay",
    kind: "widget",
    label: "Agent (panel)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-toast-overlay",
    overlayId: "agentToastOverlay",
    kind: "widget",
    label: "Agent (toast)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-floating-chat",
    overlayId: "agentFloatingChat",
    kind: "widget",
    label: "Agent (floating chat)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-chat-collapsible",
    overlayId: "agentChatCollapsible",
    kind: "widget",
    label: "Agent Chat (collapsible)",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },
  {
    slug: "agent-chat-assistant",
    overlayId: "agentChatAssistant",
    kind: "widget",
    label: "Agent Chat Assistant",
    defaultData: {},
    ephemeral: true,
    instanceMode: "multi",
  },

  // ── WhatsApp Demo ─────────────────────────────────────────────────────────
  {
    slug: "whatsapp-shell-window",
    overlayId: "whatsappShellWindow",
    kind: "window",
    label: "WhatsApp",
    defaultData: {
      userName: null as string | null,
      userAvatarUrl: null as string | null,
    },
    ephemeral: true,
    mobilePresentation: "fullscreen",
    instanceMode: "singleton",
  },
  {
    slug: "whatsapp-settings-window",
    overlayId: "whatsappSettings",
    kind: "window",
    label: "WhatsApp Settings",
    defaultData: {
      userName: null as string | null,
      userAvatarUrl: null as string | null,
      initialNavId: "account",
    },
    ephemeral: true,
    mobilePresentation: "drawer",
    mobileSidebarAs: "drawer",
    instanceMode: "singleton",
  },
  {
    slug: "whatsapp-media-window",
    overlayId: "whatsappMedia",
    kind: "window",
    label: "WhatsApp Media",
    defaultData: {
      initialTabId: "media",
    },
    ephemeral: true,
    mobilePresentation: "drawer",
    instanceMode: "singleton",
  },
];

// ─── Lookup maps ──────────────────────────────────────────────────────────────

const BY_SLUG: ReadonlyMap<string, WindowStaticMetadata> = new Map(
  STATIC_REGISTRY.map((e) => [e.slug, e]),
);

const BY_OVERLAY_ID: ReadonlyMap<string, WindowStaticMetadata> = new Map(
  STATIC_REGISTRY.map((e) => [e.overlayId, e]),
);

// ─── Public API ───────────────────────────────────────────────────────────────

/** All static metadata entries (for iteration). */
export const ALL_WINDOW_STATIC_METADATA: ReadonlyArray<WindowStaticMetadata> =
  STATIC_REGISTRY;

/**
 * Look up static metadata by overlayId.
 * Returns undefined if the overlayId is not registered.
 */
export function getStaticEntryByOverlayId(
  overlayId: string,
): WindowStaticMetadata | undefined {
  return BY_OVERLAY_ID.get(overlayId);
}

/**
 * Look up static metadata by slug.
 * Returns undefined if the slug is not registered.
 */
export function getStaticEntryBySlug(
  slug: string,
): WindowStaticMetadata | undefined {
  return BY_SLUG.get(slug);
}

/**
 * True when the given overlayId maps to a non-ephemeral registered window.
 * Used by WindowPanel to decide whether to create a session row on save.
 */
export function isPersistableWindow(overlayId: string): boolean {
  const entry = BY_OVERLAY_ID.get(overlayId);
  return entry !== undefined && !entry.ephemeral;
}
