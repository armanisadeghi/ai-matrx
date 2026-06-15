import { getHydrator, registerPanelHydrator } from "./UrlPanelRegistry";
import { setDisplayMode } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";

/**
 * Register all known panel URL hydrators.
 * This runs exactly once on client mount.
 */
export function initUrlHydration() {
  // Agent execution floating panels
  registerPanelHydrator("agent", (dispatch, id, args) => {
    dispatch(
      setDisplayMode({
        conversationId: id,
        displayMode:
          (args.m as "floating-chat" | "modal-full" | "panel") ||
          "floating-chat",
      }),
    );
  });

  // Voice Pad — simple
  registerPanelHydrator("voice", (dispatch, id) => {
    dispatch(openOverlay({ overlayId: "voicePad", instanceId: id }));
  });

  // Voice Pad — advanced
  registerPanelHydrator("voice-advanced", (dispatch, id) => {
    dispatch(openOverlay({ overlayId: "voicePadAdvanced", instanceId: id }));
  });

  // Voice Pad — AI
  registerPanelHydrator("transcription-cleanup", (dispatch, id) => {
    dispatch(
      openOverlay({ overlayId: "transcriptionCleanup", instanceId: id }),
    );
  });

  // Notes (NotesWindow — primary instance; title stays "Notes" in chrome)
  registerPanelHydrator("notes", (dispatch) => {
    dispatch(
      openOverlay({
        overlayId: "notesWindow",
        instanceId: "default",
        data: { title: "Notes" },
      }),
    );
  });

  // Feedback Window
  registerPanelHydrator("feedback", (dispatch) => {
    dispatch(openOverlay({ overlayId: "feedbackDialog" }));
  });

  // JSON Truncator
  registerPanelHydrator("json_truncator", (dispatch) => {
    dispatch(openOverlay({ overlayId: "jsonTruncator" }));
  });

  // Quick Tasks Window
  registerPanelHydrator("quick_tasks", (dispatch) => {
    dispatch(openOverlay({ overlayId: "quickTasksWindow" }));
  });

  // Quick Data Window — `?panels=quick_data` opens with the last-used selection
  // restored from `window_sessions`, while `?panels=quick_data:<tableId>` deep
  // links to a specific table (used after saving a new table from a chat).
  registerPanelHydrator("quick_data", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "quickDataWindow",
        data: id ? { selectedTable: id } : null,
      }),
    );
  });

  // Cloud Files Window (legacy URL key "files" still honored — points at the
  // new cloud-files window registered in Phase 6).
  registerPanelHydrator("files", (dispatch) => {
    dispatch(openOverlay({ overlayId: "cloudFilesWindow" }));
  });

  // State Analyzer Window
  registerPanelHydrator("state_analyzer", (dispatch) => {
    dispatch(openOverlay({ overlayId: "adminStateAnalyzerWindow" }));
  });

  // AI Voice Window
  registerPanelHydrator("aiVoiceWindow", (dispatch) => {
    dispatch(openOverlay({ overlayId: "aiVoiceWindow" }));
  });

  // Gallery Window
  registerPanelHydrator("gallery", (dispatch) => {
    dispatch(openOverlay({ overlayId: "galleryWindow" }));
  });

  // News Window
  registerPanelHydrator("news", (dispatch) => {
    dispatch(openOverlay({ overlayId: "newsWindow" }));
  });

  // User Preferences Window
  registerPanelHydrator("user_preferences", (dispatch) => {
    dispatch(openOverlay({ overlayId: "userPreferencesWindow" }));
  });

  // Share Modal Window
  registerPanelHydrator("share_modal", (dispatch) => {
    dispatch(openOverlay({ overlayId: "shareModalWindow" }));
  });

  // Markdown Editor Window
  registerPanelHydrator("markdown_editor", (dispatch) => {
    dispatch(openOverlay({ overlayId: "markdownEditorWindow" }));
  });

  // Email Dialog Window
  registerPanelHydrator("email_dialog", (dispatch) => {
    dispatch(openOverlay({ overlayId: "emailDialogWindow" }));
  });

  // List Manager Window
  registerPanelHydrator("listManager", (dispatch) => {
    dispatch(openOverlay({ overlayId: "listManagerWindow" }));
  });

  // Cloud Files Window
  registerPanelHydrator("cloud_files", (dispatch) => {
    dispatch(openOverlay({ overlayId: "cloudFilesWindow" }));
  });

  // Web Scraper Window
  registerPanelHydrator("scraper", (dispatch) => {
    dispatch(openOverlay({ overlayId: "scraperWindow" }));
  });

  // Agent Settings Window
  registerPanelHydrator("agent-settings", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "agentSettingsWindow",
        data: id && id !== "agentSettingsWindow" ? { initialAgentId: id } : {},
      }),
    );
  });

  // Agent Advanced Editor (Agent Content) Window
  registerPanelHydrator("agent-content", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "agentAdvancedEditorWindow",
        data:
          id && id !== "agentAdvancedEditorWindow"
            ? { initialAgentId: id }
            : {},
      }),
    );
  });

  // Execution Inspector Window
  registerPanelHydrator("exec-inspector", (dispatch) => {
    dispatch(openOverlay({ overlayId: "executionInspectorWindow" }));
  });

  // Agent Assistant Markdown Debug Window
  registerPanelHydrator("agent-md-debug", (dispatch) => {
    dispatch(openOverlay({ overlayId: "agentAssistantMarkdownDebugWindow" }));
  });

  // Transcript Studio Window — `?panels=studio` opens the floating studio.
  // Optional `?panels=studio:<sessionId>` deep-links to a specific session
  // (StudioView reads activeSessionId from data on mount).
  registerPanelHydrator("studio", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "transcriptStudioWindow",
        data: id ? { activeSessionId: id } : null,
      }),
    );
  });

  // File Preview Window — `?panels=file_preview:<fileId>` deep-links to a file.
  registerPanelHydrator("file_preview", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "filePreviewWindow",
        data: id ? { fileId: id } : null,
      }),
    );
  });

  // Crop Studio Window — `?panels=crop_studio` opens the studio.
  // Optional `?panels=crop_studio:<folderId>` pre-selects a destination folder.
  registerPanelHydrator("crop_studio", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "cropStudioWindow",
        data: id ? { folderId: id } : null,
      }),
    );
  });

  // Messages Window — `?panels=messages` opens the messaging window.
  // Optional `?panels=messages:<conversationId>` deep-links to a conversation.
  registerPanelHydrator("messages", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "messagesWindow",
        data: id ? { activeConversationId: id } : null,
      }),
    );
  });

  // ── Dev-only integrity check ─────────────────────────────────────────────
  // Every registry entry that declares `urlSync.key` must have a hydrator
  // registered above. Drift here is silent: `?panels=<key>` would just
  // log a console warning from UrlPanelManager and do nothing. This check
  // fails loudly in development so missing hydrators land in a failing PR
  // instead of a broken deep-link in production.
  if (process.env.NODE_ENV !== "production") {
    const missing: Array<{ overlayId: string; key: string }> = [];
    for (const entry of ALL_WINDOW_STATIC_METADATA) {
      const key = entry.urlSync?.key;
      if (!key) continue;
      if (!getHydrator(key)) {
        missing.push({ overlayId: entry.overlayId, key });
      }
    }
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[initUrlHydration] ${missing.length} registry urlSync key(s) have no hydrator:\n` +
          missing.map((m) => `  - ${m.overlayId} → "${m.key}"`).join("\n") +
          `\nRegister a hydrator in features/window-panels/url-sync/initUrlHydration.ts.`,
      );
    }
  }
}
