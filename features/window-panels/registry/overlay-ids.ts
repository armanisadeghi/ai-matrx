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
  "agentMemoryWindow",
  "agentOptimizerWindow",
  "agentPanelOverlay",
  "agentRunHistoryWindow",
  "agentRunWindow",
  "agentSettingsWindow",
  "agentSkillsWindow",
  "agentSidebarOverlay",
  "agentToastOverlay",
  "aiVoiceWindow",
  "announcements",
  "authGate",
  "brokerState",
  "browserFrameWindow",
  "browserWorkbenchWindow",
  "canvasViewerWindow",
  "characterCounterWindow",
  "chatDebugWindow",
  "cloudFilesWindow",
  "codeEditorWindow",
  "codeFileManagerWindow",
  "codeWorkspaceWindow",
  "contentEditorListWindow",
  "contentEditorWindow",
  "contentEditorWorkspaceWindow",
  "contextAssignment",
  "contextItemsWindow",
  "contextSwitcherWindow",
  "credentialVaultWindow",
  "drillDeckContextWindow",
  "createProjectWindow",
  "creatorHub",
  "crmManagerWindow",
  "crmCreatePartyWindow",
  "cropStudioWindow",
  "curatedIconPickerWindow",
  "dictionarySelectorWindow",
  "diffViewerWindow",
  "emailDialog",
  "emailDialogWindow",
  "errorInspectorWindow",
  "executionInspectorWindow",
  "extractionCellEditorWindow",
  "feedbackDialog",
  "filePreviewWindow",
  "flashcardItemWindow",
  "flashcardsBlockWindow",
  "flashcardStudyWindow",
  "flashcardSubcardsWindow",
  "findReplace",
  "fullScreenEditor",
  "galleryWindow",
  "hierarchyCreationWindow",
  "htmlPreview",
  "imageAnnotationWindow",
  "imageUploaderWindow",
  "imageViewer",
  "instanceUIStateWindow",
  "itemDetailWindow",
  "jsonTruncator",
  "keywordWindow",
  "kgSuggestionsDrawer",
  "listManagerWindow",
  "markdownEditor",
  "markdownEditorWindow",
  "messageAnalysisWindow",
  "messagesWindow",
  "multiFileSmartCodeEditorWindow",
  "newsWindow",
  "noteInfoWindow",
  "researchContextPreviewWindow",
  "noteKnowledgePanel",
  "notesWindow",
  "observationalMemoryWindow",
  "pdfExtractorWindow",
  "pdfBatchExtractDebugWindow",
  "structuredListManagerV1Window",
  "structuredListManagerV2Window",
  "projectsWindow",
  "contextPreviewPanel",
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
  "ragAiCopyWindow",
  "resourcePickerWindow",
  "runControlsWindow",
  "saveToCode",
  "saveToNotes",
  "saveToNotesFullscreen",
  "scopeEditWindow",
  "scratchpadPanel",
  "scraperWindow",
  "keywordResearchWindow",
  "serpAnalyzerWindow",
  "setContextValueWindow",
  "shareModal",
  "shareModalWindow",
  "singleMessageWindow",
  "smartCodeEditorWindow",
  "socialCardAnalyzerWindow",
  "sourceInspectorWindow",
  "systemInstructionWindow",
  "promptPreviewWindow",
  "scopeBatchImportWindow",
  "surfaceAgentBindWindow",
  "surfaceContextWindow",
  "surfaceContextInspector",
  "streamDebug",
  "streamDebugHistoryWindow",
  "captureInspectorWindow",
  "tableViewerWindow",
  "userTableWindow",
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
