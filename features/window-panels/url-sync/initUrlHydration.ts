import { getHydrator, registerPanelHydrator } from "./UrlPanelRegistry";
import { initInstanceUIState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";
import {
  parseTopicPanelInstanceId,
  topicPanelInstanceId,
} from "@/features/marketing/seo/topical-map/panel/topicPanelInstance";
import {
  DETAIL_URL_AS_ARG,
  parseDetailInstanceKey,
  presentationFromUrlArg,
  detailListFromUrlArgs,
} from "@/lib/detail/presentation";
import { openDetailSingleton } from "@/features/window-panels/detail/openDetailSingleton";
import { parseVariableEditorInstanceId } from "@/features/agents/components/variables-management/variableEditorAddress";
import { dispatchThunk } from "@/lib/redux/hooks";

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
    const displayMode = resolveAgentPanelDisplayMode(args.m);
    dispatch(
      initInstanceUIState({
        conversationId: id,
        displayMode,
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

  // Topical map — `?panels=topical_map:<mapId>:s-<screen>` reopens one map's
  // window on that screen; the bare key (or `:picker`) opens the map picker.
  registerPanelHydrator("topical_map", (dispatch, id, args) => {
    const mapId = id && id !== "picker" && id !== "default" ? id : "";
    const screen = args.s;
    dispatch(
      openOverlay({
        overlayId: "topicalMapWindow",
        instanceId: mapId || "picker",
        data: {
          mapId,
          screen:
            screen === "outline" ||
            screen === "table" ||
            screen === "graph" ||
            screen === "text" ||
            screen === "pages" ||
            screen === "history"
              ? screen
              : "outline",
          siteId: null,
        },
      }),
    );
  });

  // Topical map — one topic. `?panels=topic:<mapId>|<slug>` reopens the
  // floating topic panel the link was made from. The instance id IS the
  // (map, topic) pair, parsed by the module that mints it, so the two never
  // drift apart. `siteId` is deliberately not carried: it is a viewing scope,
  // not part of the topic's identity, and the `?panels=` arg encoding
  // (`k-v` pairs split on `-`) cannot round-trip a UUID.
  registerPanelHydrator("topic", (dispatch, id) => {
    const identity = parseTopicPanelInstanceId(id);
    if (!identity) {
      // Nothing fails silently: half an identity has no topic to show, and an
      // empty frame would be worse than not restoring at all.
      console.warn(
        `[initUrlHydration] Ignoring "?panels=topic:${id}": a topic panel is ` +
          `addressed as "<mapId>|<slug>". Re-copy the link from the panel's ` +
          `own share control.`,
      );
      return;
    }
    dispatch(
      openOverlay({
        overlayId: "topicalMapTopicPanel",
        instanceId: topicPanelInstanceId(identity),
        data: { stackIndex: 0, ...identity, siteId: null },
      }),
    );
  });

  // Agent variable editor — `?panels=agent_variable:<agentId>|<variableName>`
  // reopens the editor on the exact variable the link was made from. The window
  // is a singleton (one editor at a time), so the subject rides in the URL's
  // instance slot while the overlay itself stays on `default` — the same shape
  // the vault below uses for its selected item.
  registerPanelHydrator("agent_variable", (dispatch, id) => {
    const address = parseVariableEditorInstanceId(id);
    if (!address) {
      // Nothing fails silently: half an identity has no variable to edit, and
      // an empty editor would be worse than not restoring at all.
      console.warn(
        `[initUrlHydration] Ignoring "?panels=agent_variable:${id}": the variable ` +
          `editor is addressed as "<agentId>|<variableName>". Re-copy the link ` +
          "from the editor's own window controls.",
      );
      return;
    }
    dispatch(
      openOverlay({
        overlayId: "agentVariableEditorWindow",
        instanceId: "default",
        data: { ...address, justCreated: false },
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

  // Record detail (the Detail primitive, lib/detail) —
  // `?panels=detail:<type>.<id>:as-window|docked`. The instance is the record
  // (`type.id`); `as` picks the in-place presentation, window by default. The
  // page presentation is its own route and never appears here.
  registerPanelHydrator("detail", (dispatch, id, args) => {
    const ref = parseDetailInstanceKey(id);
    if (!ref) {
      console.warn(
        `[UrlPanelManager] ?panels=detail:${id} names no record — expected detail:<type>.<id>.`,
      );
      return;
    }
    const presentation = presentationFromUrlArg(args[DETAIL_URL_AS_ARG]);
    // 🚨 D8 — THROUGH THE ONE PRIMITIVE, NEVER `openOverlay` DIRECTLY. A link
    // may name two records (`detail:file.B,detail:file.C`): this hydrator runs
    // once per token, the second call retargets the same singleton, and when it
    // dispatched the open itself the first record was closed in silence — the
    // exact defect the openers' announcement was written for (VERIFY-U-P1-R2).
    dispatchThunk(
      dispatch,
      openDetailSingleton({
        presentation,
        // 🚨 NEW-15 — the list the window was opened from, when the token
        // carries it. `null` only when the link genuinely has none.
        data: {
          type: ref.type,
          id: ref.id,
          seed: null,
          list: detailListFromUrlArgs(args),
        },
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

  // Topic panel — `?panels=topic:<mapId>|<slug>:s-<siteId>`. The registry has
  // declared this key since the panel shipped and NOTHING answered it: the
  // link opened nothing and `UrlPanelManager` logged a warning nobody read
  // (found by the dev integrity check below, which only screams in a browser).
  registerPanelHydrator("topic", (dispatch, id, args) => {
    const [mapId, slug] = (id ?? "").split("|");
    if (!mapId || !slug) {
      console.warn(
        `[UrlPanelManager] ?panels=topic:${id} names no topic — expected topic:<mapId>|<slug>.`,
      );
      return;
    }
    dispatch(
      openOverlay({
        overlayId: "topicalMapTopicPanel",
        instanceId: id,
        data: {
          stackIndex: 0,
          mapId,
          slug,
          siteId: args.s ?? null,
        },
      }),
    );
  });

  // ── Google-native panels (V-23 / R35) ────────────────────────────────────
  // Every one of these was reachable ONLY by clicking the surface that raised
  // it: no address, so no deep link, no verification from the seat, and no way
  // for the extension or the desktop app to reach the same panel (PLAN §5.7).

  // Agenda — `?panels=agenda` opens the agenda over synced Calendar events.
  registerPanelHydrator("agenda", (dispatch) => {
    dispatch(openOverlay({ overlayId: "googleAgendaWindow" }));
  });

  // Waiting on you — `?panels=approvals` opens the approval queue in place.
  registerPanelHydrator("approvals", (dispatch) => {
    dispatch(openOverlay({ overlayId: "approvalsWindow" }));
  });

  // Import from Google Contacts —
  // `?panels=google_contacts_import:<externalContactId>:o-<organizationId>`.
  // The bare key opens the panel with nothing pre-selected.
  registerPanelHydrator("google_contacts_import", (dispatch, id, args) => {
    const initialExternalId = getRestorableResourceId(
      id,
      "googleContactsImportWindow",
    );
    const organizationId = args.o ?? null;
    dispatch(
      openOverlay({
        overlayId: "googleContactsImportWindow",
        data: { organizationId, initialExternalId },
      }),
    );
  });

  // Import from Google Tasks —
  // `?panels=google_tasks_import:<projectId>:o-<organizationId>`.
  registerPanelHydrator("google_tasks_import", (dispatch, id, args) => {
    const projectId = getRestorableResourceId(id, "googleTasksImportWindow");
    const organizationId = args.o ?? null;
    dispatch(
      openOverlay({
        overlayId: "googleTasksImportWindow",
        data: { organizationId, projectId },
      }),
    );
  });

  // Connect Google — `?panels=google_connect` (optionally `:<reason>`).
  registerPanelHydrator("google_connect", (dispatch, id) => {
    const reason = getRestorableResourceId(id, "googleConnectWindow");
    dispatch(
      openOverlay({
        overlayId: "googleConnectWindow",
        data: reason ? { reason } : null,
      }),
    );
  });

  // Site Quick view — `?panels=site_quick_view:<siteId>`. The window's whole
  // subject is one site, so a token with no id opens nothing rather than an
  // empty frame (the render site already refuses a missing `siteId`).
  registerPanelHydrator("site_quick_view", (dispatch, id) => {
    const siteId = getRestorableResourceId(id, "siteQuickViewWindow");
    if (!siteId) {
      console.warn(
        `[UrlPanelManager] ?panels=site_quick_view:${id} names no site — expected site_quick_view:<siteId>.`,
      );
      return;
    }
    dispatch(
      openOverlay({
        overlayId: "siteQuickViewWindow",
        data: { siteId, siteLabel: null },
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

const RESTORABLE_AGENT_DISPLAY_MODES = new Set<ResultDisplayMode>([
  "floating-chat",
  "flexible-panel",
  "modal-full",
  "modal-compact",
  "panel",
  "sidebar",
]);

export function resolveAgentPanelDisplayMode(
  mode: string | undefined,
): ResultDisplayMode {
  if (!mode || mode === "fc") return "floating-chat";
  return RESTORABLE_AGENT_DISPLAY_MODES.has(mode as ResultDisplayMode)
    ? (mode as ResultDisplayMode)
    : "floating-chat";
}
