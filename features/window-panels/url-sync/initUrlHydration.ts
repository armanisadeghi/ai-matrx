import { getHydrator, registerPanelHydrator } from "./UrlPanelRegistry";
import { setDisplayMode } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";

/**
 * URL sync uses the instance slot for both singleton window identities and
 * resource identities. Only the latter may be forwarded into feature data.
 */
function getRestorableResourceId(
  id: string,
  ...singletonIds: string[]
): string | null {
  if (!id || id === "default" || singletonIds.includes(id)) return null;
  return id;
}

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

  // Notes (NotesWindow — multi-instance; `?panels=notes` opens the primary,
  // `?panels=notes:<instanceId>` the exact window the link was made from.
  // Title stays "Notes" in chrome.)
  registerPanelHydrator("notes", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "notesWindow",
        instanceId: id || "default",
        data: { title: "Notes" },
      }),
    );
  });

  // Vault — `?panels=vault` (optionally `:itemId`) so a link can drop someone
  // straight onto the credential they need.
  registerPanelHydrator("vault", (dispatch, id) => {
    dispatch(
      openOverlay({
        overlayId: "credentialVaultWindow",
        instanceId: "default",
        data: { selectedItemId: id ?? null, scope: "mine" },
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

  // Quick Data Window — if UrlPanelManager is re-enabled,
  // `?panels=quick_data:<tableId>` deep-links to a specific table. The bare
  // key opens without a selected table; no cloud window-session fallback exists.
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

  // File Preview Window — `?panels=file_preview:<fileId>:p-<page>` deep-links
  // to a file and, for PDFs, an optional 1-based page.
  registerPanelHydrator("file_preview", (dispatch, id, args) => {
    const parsedPage = Number.parseInt(args.p ?? "", 10);
    const pageNumber = Number.isFinite(parsedPage)
      ? Math.max(1, parsedPage)
      : null;
    dispatch(
      openOverlay({
        overlayId: "filePreviewWindow",
        data: id
          ? {
              fileId: id,
              pageNumber,
              navigationRequestId: Date.now(),
            }
          : null,
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
        data: id ? { conversationId: id } : null,
      }),
    );
  });

  // Keyword Research — `?panels=keyword_research` opens the canonical
  // research runner window. Never auto-runs (a run is a paid pipeline).
  registerPanelHydrator("keyword_research", (dispatch) => {
    dispatch(openOverlay({ overlayId: "keywordResearchWindow" }));
  });

  // Keyword Intelligence — `?panels=keyword` opens the canonical keyword
  // dossier window (blank; scope/phrase arrive via the opener, not the URL).
  registerPanelHydrator("keyword", (dispatch) => {
    dispatch(openOverlay({ overlayId: "keywordWindow" }));
  });

  // Search Appearance — `?panels=serp_analyzer` (key declared in the
  // registry since the window shipped; hydrator was missing — drift the
  // dev check below exists to catch).
  registerPanelHydrator("serp_analyzer", (dispatch) => {
    dispatch(openOverlay({ overlayId: "serpAnalyzerWindow" }));
  });

  // Social Cards — `?panels=social_cards` (same missing-hydrator drift).
  registerPanelHydrator("social_cards", (dispatch) => {
    dispatch(openOverlay({ overlayId: "socialCardAnalyzerWindow" }));
  });

  // Creator Hub — `?panels=creator_hub` (optionally `:<tabId>`).
  registerPanelHydrator("creator_hub", (dispatch, id) => {
    const initialTab = getRestorableResourceId(id, "creatorHub");
    dispatch(
      openOverlay({
        overlayId: "creatorHub",
        data: initialTab ? { initialTab } : null,
      }),
    );
  });

  // Mandates — `?panels=mandate` (optionally `:<mandateKey>`) opens the
  // mandate window in place, which is the ONLY way a mandate opens.
  registerPanelHydrator("mandate", (dispatch, id) => {
    const initialMandateKey = getRestorableResourceId(
      id,
      "mandateWindow",
      "mandate-window",
    );
    dispatch(
      openOverlay({
        overlayId: "mandateWindow",
        data: initialMandateKey ? { initialMandateKey } : null,
      }),
    );
  });

  // Picklists v1 — `?panels=structuredListManagerV1` (optionally `:<listId>`).
  registerPanelHydrator("structuredListManagerV1", (dispatch, id) => {
    const forcedListId = getRestorableResourceId(
      id,
      "structuredListManagerV1Window",
    );
    dispatch(
      openOverlay({
        overlayId: "structuredListManagerV1Window",
        data: forcedListId ? { forcedListId } : null,
      }),
    );
  });

  // Picklists v2 — `?panels=structuredListManagerV2` (optionally `:<listId>`).
  registerPanelHydrator("structuredListManagerV2", (dispatch, id) => {
    const forcedListId = getRestorableResourceId(
      id,
      "structuredListManagerV2Window",
    );
    dispatch(
      openOverlay({
        overlayId: "structuredListManagerV2Window",
        data: forcedListId ? { forcedListId } : null,
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
      console.error(
        `[initUrlHydration] ${missing.length} registry urlSync key(s) have no hydrator:\n` +
          missing.map((m) => `  - ${m.overlayId} → "${m.key}"`).join("\n") +
          `\nRegister a hydrator in features/window-panels/url-sync/initUrlHydration.ts.`,
      );
    }
  }
}
