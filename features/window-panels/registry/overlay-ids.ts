/**
 * overlay-ids.ts
 *
 * Single source of truth for the `OverlayId` string-literal union. Every
 * `dispatch(openOverlay({ overlayId: "..." }))` call site is type-narrowed
 * by this union — typo a key and TypeScript fails before the dispatch runs.
 *
 * Hand-maintained list, automatically verified against the actual
 * `STATIC_REGISTRY` by `pnpm check:registry` (build-time gate). If you add a
 * new entry to `windowRegistryMetadata.ts`, add the same overlayId here OR
 * the build fails.
 *
 * Why hand-maintained instead of derived via `as const`: the
 * `STATIC_REGISTRY` array is 1,300+ lines with deeply-nested `defaultData`
 * objects. `as const` on the whole array would explode TypeScript's literal-
 * type machinery and balloon type-check time across the project. A flat
 * tuple of just the IDs is cheap and adequate for our needs.
 */

export const OVERLAY_IDS = [
  "adminIndicator",
  "imagePeekHost",
  "adminStateAnalyzer",
  "adminStateAnalyzerWindow",
  "audioControlWindow",
  "audioDevices",
  "favoritesManagerWindow",
  "agentAdminFindUsagesWindow",
  "agentAdminShortcutWindow",
  "agentAdvancedEditorWindow",
  "agentAssistantMarkdownDebugWindow",
  "agentChatAssistant",
  "agentChatBubble",
  "agentChatCollapsible",
  "agentCompactModal",
  "agentConnectionsWindow",
  "agentConvertSystemWindow",
  "agentCreateAppWindow",
  "agentDataStorageWindow",
  "agentDebugWindow",
  "agentFindUsagesWindow",
  "agentFlexiblePanel",
  "agentFloatingChat",
  "agentFullModal",
  "agentGateWindow",
  "agentImportWindow",
  "agentInlineOverlay",
  "agentInterfaceVariationsWindow",
  "agentOptimizerWindow",
  "agentPanelOverlay",
  "agentRunHistoryWindow",
  "agentRunWindow",
  "agentSettingsWindow",
  "agentSidebarOverlay",
  "agentToastOverlay",
  "aiVoiceWindow",
  "announcements",
  "authGate",
  "brokerState",
  "browserFrameWindow",
  "browserWorkbenchWindow",
  "canvasViewerWindow",
  "chatDebugWindow",
  "cloudFilesWindow",
  "codeEditorWindow",
  "codeFileManagerWindow",
  "codeWorkspaceWindow",
  "contentEditorListWindow",
  "contentEditorWindow",
  "contentEditorWorkspaceWindow",
  "contentHistory",
  "contextAssignment",
  "contextSwitcherWindow",
  "createProjectWindow",
  "creatorHub",
  "cropStudioWindow",
  "curatedIconPickerWindow",
  "dictionarySelectorWindow",
  "diffViewerWindow",
  "emailDialog",
  "emailDialogWindow",
  "errorInspectorWindow",
  "executionInspectorWindow",
  "feedbackDialog",
  "filePreviewWindow",
  "findReplace",
  "fullScreenEditor",
  "galleryWindow",
  "hierarchyCreationWindow",
  "htmlPreview",
  "imageUploaderWindow",
  "imageViewer",
  "instanceUIStateWindow",
  "itemDetailWindow",
  "jsonTruncator",
  "kgSuggestionsDrawer",
  "listManagerWindow",
  "markdownEditor",
  "markdownEditorWindow",
  "messageAnalysisWindow",
  "messagesWindow",
  "multiFileSmartCodeEditorWindow",
  "newsWindow",
  "noteInfoWindow",
  "noteKnowledgePanel",
  "notesWindow",
  "observationalMemoryWindow",
  "pdfExtractorWindow",
  "picklistManagerV1Window",
  "picklistManagerV2Window",
  "projectsWindow",
  "quickChat",
  "quickChatHistory",
  "quickChatWindow",
  "quickData",
  "quickDataWindow",
  "quickNoteSaveWindow",
  "quickNotes",
  "quickScribe",
  "quickTasks",
  "quickTasksWindow",
  "quickUtilities",
  "resourcePickerWindow",
  "saveToCode",
  "saveToNotes",
  "saveToNotesFullscreen",
  "scopeEditWindow",
  "scraperWindow",
  "shareModal",
  "shareModalWindow",
  "singleMessageWindow",
  "smartCodeEditorWindow",
  "socketAccordion",
  "sourceInspectorWindow",
  "systemInstructionWindow",
  "surfaceContextInspector",
  "streamDebug",
  "streamDebugHistoryWindow",
  "tableViewerWindow",
  "taskEditorWindow",
  "taskQuickCreateWindow",
  "toolCallWindow",
  "transcriptStudioWindow",
  "transcriptionCleanup",
  "undoHistory",
  "userPreferences",
  "userPreferencesWindow",
  "voicePad",
  "voicePadAdvanced",
  "whatsappMedia",
  "whatsappSettings",
  "whatsappShellWindow",
  "workingDocumentWindow",
  "workingDocumentPanel",
] as const;

/**
 * Compile-time string-literal union of every registered overlay's
 * `overlayId`. Use this as the type of `openOverlay`'s `overlayId`
 * parameter to catch typos at call sites.
 */
export type OverlayId = (typeof OVERLAY_IDS)[number];

/**
 * Runtime guard — useful when accepting an overlayId from outside code
 * (URL params, postMessage payloads, etc.) and narrowing it to the
 * known set.
 */
export function isOverlayId(value: unknown): value is OverlayId {
  return (
    typeof value === "string" &&
    (OVERLAY_IDS as readonly string[]).includes(value)
  );
}
