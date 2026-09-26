import { getHydrator, registerPanelHydrator } from "./UrlPanelRegistry";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { DISPLAY_MODE_TO_OVERLAY_ID } from "@/features/agents/redux/execution-system/display-mode-overlay";
import {
  AGENT_RUN_WINDOW_AGENT_ARG,
  AGENT_RUN_WINDOW_CONVERSATION_ARG,
  AGENT_RUN_WINDOW_URL_MODE,
} from "@/features/window-panels/windows/agents/agentRunWindowAddress";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";
import { PANEL_KEY_ALIASES } from "./panelKeyAliases";
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
  // Agent execution panels — `?panels=agent:<conversationId>:m-<mode>`.
  //
  // 🚨 THE HYDRATOR OPENS THE WINDOW. Until 2026-09-19 this one dispatched
  // `initInstanceUIState` and stopped: it wrote the display CONFIG for a
  // conversation and never opened the shell that config describes, never
  // fetched the conversation, and therefore never registered a urlSync entry —
  // so `UrlPanelManager` waited out its grace period and erased the token from
  // the address bar. Every agent deep link, in the app and in every share, did
  // exactly what Arman reported: bounced to the bare route with nothing open.
  //
  // Restoring an agent panel is the SAME sequence a click performs, in the same
  // order, through the same map (`DISPLAY_MODE_TO_OVERLAY_ID`, shared with
  // `launchAgentExecution` so the two can never disagree):
  //   1. open the shell for the mode, keyed by the conversation, so the frame
  //      is there immediately;
  //   2. read the conversation back out of the database — nothing else on the
  //      page will, because a floating panel is not a route and no page owns
  //      it (`AgentConversationDisplay` deliberately never self-loads);
  //   3. re-assert the mode the LINK named, after the load, because
  //      `loadConversation` replaces the whole ui-state entry from
  //      `metadata.display` and the link is the more specific intent.
  // `expectMaterialized: true` is what makes step 2 honest: a reopen that
  // comes back empty is a failed read, and the transcript says so with a
  // retry instead of painting an empty room (law 4).
  registerPanelHydrator("agent", (dispatch, id, args) => {
    const subject = getRestorableResourceId(id);
    if (!subject) {
      console.warn(
        `[UrlPanelManager] ?panels=agent:${id} names no conversation — ` +
          "expected agent:<conversationId>:m-<mode>.",
      );
      return;
    }

    // The Chat window (`agentRunWindow`) shares this key: it is a WINDOW that
    // hosts conversations, not one conversation's shell, so its subject is its
    // own window instance and the chat it has open rides in the args.
    if (args.m === AGENT_RUN_WINDOW_URL_MODE) {
      dispatch(
        openOverlay({
          overlayId: "agentRunWindow",
          instanceId: subject,
          data: {
            initialAgentId: args[AGENT_RUN_WINDOW_AGENT_ARG] ?? null,
            initialSelectedConversationId:
              args[AGENT_RUN_WINDOW_CONVERSATION_ARG] ?? null,
          },
        }),
      );
      return;
    }

    const conversationId = subject;
    const displayMode = resolveAgentPanelDisplayMode(args.m);
    const overlayId = DISPLAY_MODE_TO_OVERLAY_ID[displayMode];
    if (!overlayId) {
      // A mode with no shell paints nothing. An address that opens nothing has
      // to say so rather than leave a token that looks like it worked.
      console.warn(
        `[UrlPanelManager] ?panels=agent:${id}:m-${args.m} names display mode ` +
          `"${displayMode}", which has no overlay to open.`,
      );
      return;
    }

    dispatch(
      openOverlay({
        overlayId,
        instanceId: conversationId,
        data: { conversationId },
      }),
    );

    // `displayOverrides` lands in the SAME dispatch that stamps
    // `metadata.display`, so there is no render in which the stored values are
    // live and the link's are not. Two things are asserted there:
    //   • the display mode the LINK named — it is the more specific intent;
    //   • `autoRun: false` — reopening an address is NEVER a decision to spend
    //     a paid run. Nobody clicked; a refresh must not fire an agent.
    dispatchThunk(
      dispatch,
      loadConversation({
        conversationId,
        expectMaterialized: true,
        displayOverrides: { displayMode, autoRun: false },
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
  // new cloud-files window registered in Phase 6). The window publishes its
  // address as `cloud_files`, so this key is declared an ALIAS in
  // `panelKeyAliases.ts`: without that declaration UrlPanelManager cannot tell
  // that the registration it caused is the one it is waiting for (V-29 NEW-1).
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

  // Mandates (new window) — `?panels=mandate_next:<mandateKey>:t-<tab>`; the id
  // is the selected mandate key and `t` its tab, so a reload reopens both.
  registerPanelHydrator("mandate_next", (dispatch, id, args) => {
    const initialMandateKey = getRestorableResourceId(
      id,
      "mandateWindowNext",
      "mandate-window-next",
    );
    dispatch(
      openOverlay({
        overlayId: "mandateWindowNext",
        data: { initialMandateKey, initialTab: args.t ?? null },
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

  // Site Analytics — `?panels=site_analytics:<siteId>`.
  registerPanelHydrator("site_analytics", (dispatch, id) => {
    const siteId = getRestorableResourceId(id, "siteAnalyticsWindow");
    if (!siteId) {
      console.warn(
        `[UrlPanelManager] ?panels=site_analytics:${id} names no site — expected site_analytics:<siteId>.`,
      );
      return;
    }
    dispatch(
      openOverlay({
        overlayId: "siteAnalyticsWindow",
        data: { siteId, siteLabel: null },
      }),
    );
  });

  // Site tracking — `?panels=site_tracking:<siteId>`. The window's whole subject is one site, so
  // a token with no id opens nothing rather than an empty frame (the render site already refuses
  // a missing `siteId`).
  registerPanelHydrator("site_tracking", (dispatch, id) => {
    const siteId = getRestorableResourceId(id, "siteTrackingWindow");
    if (!siteId) {
      console.warn(
        `[UrlPanelManager] ?panels=site_tracking:${id} names no site — expected site_tracking:<siteId>.`,
      );
      return;
    }
    dispatch(
      openOverlay({
        overlayId: "siteTrackingWindow",
        data: { siteId, siteLabel: null },
      }),
    );
  });

  // Brand channel — `?panels=brand_channel:<brandId>`. The window's whole subject is one brand,
  // so a token with no id opens nothing rather than an empty frame (the render site already
  // refuses a missing `brandId`).
  registerPanelHydrator("brand_channel", (dispatch, id) => {
    const brandId = getRestorableResourceId(id, "brandChannelWindow");
    if (!brandId) {
      console.warn(
        `[UrlPanelManager] ?panels=brand_channel:${id} names no brand — expected brand_channel:<brandId>.`,
      );
      return;
    }
    dispatch(
      openOverlay({
        overlayId: "brandChannelWindow",
        data: { brandId, brandLabel: null },
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

    // Every declared alias must be real in both directions, or the manager
    // resolves a token against a key nothing will ever publish and the V-29
    // NEW-1 false alarm comes straight back.
    const registryKeys = new Set(
      ALL_WINDOW_STATIC_METADATA.map((entry) => entry.urlSync?.key).filter(
        (key): key is string => Boolean(key),
      ),
    );
    const brokenAliases: string[] = [];
    for (const [aliasKey, canonicalKey] of Object.entries(PANEL_KEY_ALIASES)) {
      if (!getHydrator(aliasKey)) {
        brokenAliases.push(
          `  - "${aliasKey}" is declared an alias but has no hydrator: the link opens nothing.`,
        );
      }
      if (!registryKeys.has(canonicalKey)) {
        brokenAliases.push(
          `  - "${aliasKey}" → "${canonicalKey}": no registry entry declares urlSync.key "${canonicalKey}", so the alias can never be settled.`,
        );
      }
      if (registryKeys.has(aliasKey)) {
        brokenAliases.push(
          `  - "${aliasKey}" is BOTH a registry urlSync.key and an alias: a window already publishes it, so the alias must be removed.`,
        );
      }
    }
    if (brokenAliases.length > 0) {
      console.error(
        `[initUrlHydration] ${brokenAliases.length} broken \`?panels=\` alias declaration(s):\n` +
          brokenAliases.join("\n") +
          `\nFix features/window-panels/url-sync/panelKeyAliases.ts.`,
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
