"use client";

// providers/ChatHostAdapter.tsx
//
// THE ONE `@ai-matrx/chat` host mount (PACKAGE-INDEPENDENCE §2.1, slice P1).
// The package's ports are wired here to what this app already has — nothing
// in the package reads them yet (each port slice P4–P22 switches its call
// sites), so mounting this changes no behaviour.
//
//   identity    → Redux userAuth/userProfile (lane-aware admin level), read by
//                 lib/redux/chat-host-from-app — the same reading the root
//                 reducer uses to keep the package's `chatHost` slice equal
//   org         → appContext active org (same reading); require = the
//                 canonical gate (lib/organization/chat-org-port)
//   server      → apiConfig's resolved aidream URL; bearer + X-Organization-Id; `api` = lib/api (P9)
//   notify      → lib/toast (`toast`, `recordToast`)
//   diagnostics → the Error Inspector capture store (which persists through
//                 `log_client_error`) — lib/diagnostics/chat-diagnostics-port;
//                 sourceApp names this client for the package default as well
//   navigation  → the package's Next binding (`@ai-matrx/chat/next/navigation`):
//                 the app router + next/link (P10)
//   windows     → the overlay system (`openOverlay` / `closeOverlay`) and
//                 the window manager; every CHAT_WINDOWS id must be an
//                 OverlayId (`chatWindowOverlay` fails to compile otherwise)
//                 or a canvas-hosted tool (`CANVAS_HOSTED_WINDOWS`: Quick Chat,
//                 the context preview); openers → the app's overlay and
//                 canvas openers (`useAppWindowOpeners`)
//   catalog     → the app's one agent catalog (created by AgentCatalogHost,
//                 read lazily so its archive-knob seed is never pre-empted)
//   prefs       → strings: the package's localStorage default (unchanged);
//                 preferences: userPreferences / adminPreferences / creatorDebug /
//                 adminDebug + the super-admin debugger flag, read by
//                 lib/redux/chat-host-from-app (the same reading the root
//                 reducer uses); writes are package actions the root
//                 reducer turns into the app's own in the same reduction;
//                 knobs → lib/scoped-config (the settings register);
//                 SettingDoor → features/settings doors
//   chrome      → the app shell (features/shell): header slots, the phone ⋮
//                 sheet, the nav drawer, canvas chrome, full-screen layers
//   feedback    → the `submitFeedback` action (the in-app feedback window's path)
//   routes      → nav-data's Workflow Studio address
//   canvas      → the app's @ai-matrx/canvas binding (features/canvas/host):
//                 content-typed opens, tab sources, the artifact on screen
//
// Inside StoreProvider: every port reads the live store, and the same store is
// handed to the package (`store`), which keeps its `chatHost` slice synced.

import type { ReactNode } from "react";
import { ChatProvider } from "@ai-matrx/chat/host/react";
import { useNextNavigation } from "@ai-matrx/chat/next/navigation";
import type {
  ChatChromePort,
  ChatHost,
  ChatKnobsPort,
  ChatPreferences,
  ChatPrefsPort,
  ChatSettingDoorProps,
  ChatIdentity,
  ChatIdentityPort,
  ChatNotifyOptions,
  ChatNotifyPort,
  ChatOrganization,
  ChatOrgPort,
  ChatWindowId,
  ChatWindowOpeners,
  ChatWindowsPort,
} from "@ai-matrx/chat/host";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { AppStore } from "@/lib/redux/store";
import { selectAccessToken } from "@/lib/redux/selectors/userSelectors";
import {
  readAppChatIdentity,
  readAppChatOrg,
  readAppChatPreferences,
  sameChatIdentity,
  sameChatOrg,
  sameChatPreferences,
} from "@/lib/redux/chat-host-from-app";
import { createWebPrefs } from "@ai-matrx/chat/host";
import { chatRequestHeaders } from "@ai-matrx/chat/host/request-headers";
import {
  getSessionKnob,
  useSessionKnob,
} from "@/lib/scoped-config/sessionKnob";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { setKnobOverride } from "@/lib/scoped-config/service";
import { SettingDoor } from "@/features/settings/doors/SettingDoor";
import { VOICE_SETTING_DOORS } from "@/features/settings/tabs/voices/voiceSettingDoors";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { appChatServerApi } from "@/lib/api/chat-server-api";
import {
  closeOverlay,
  openOverlay,
  selectIsOverlayOpen,
} from "@/lib/redux/slices/overlaySlice";
import {
  focusWindow,
  restoreWindow,
  selectAllWindows,
} from "@/lib/redux/slices/windowManagerSlice";
import type { OverlayId } from "@/features/overlays/catalogue";
import { requireOrganizationForChat } from "@/lib/organization/chat-org-port";
import { toast, recordToast } from "@/lib/toast";
import { createAppChatDiagnostics } from "@/lib/diagnostics/chat-diagnostics-port";
import { getAgentCatalog } from "@/lib/agents/catalog";
import { useOpenAgentAdminFindUsagesWindow } from "@/features/overlays/openers/agentAdminFindUsagesWindow";
import { useOpenAgentShortcutQuickCreateWindow } from "@/features/overlays/openers/agentAdminShortcutWindow";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";
import { useOpenAgentConvertSystemWindow } from "@/features/overlays/openers/agentConvertSystemWindow";
import { useOpenAgentCreateAppWindow } from "@/features/overlays/openers/agentCreateAppWindow";
import { useOpenAgentDataStorageWindow } from "@/features/overlays/openers/agentDataStorageWindow";
import { useOpenAgentFindUsagesWindow } from "@/features/overlays/openers/agentFindUsagesWindow";
import { useOpenAgentImportWindow } from "@/features/overlays/openers/agentImportWindow";
import { useOpenAgentInterfaceVariationsWindow } from "@/features/overlays/openers/agentInterfaceVariationsWindow";
import { useOpenAgentMemoryWindow } from "@/features/overlays/openers/agentMemoryWindow";
import { useOpenAgentOptimizerWindow } from "@/features/overlays/openers/agentOptimizerWindow";
import { useOpenAgentRunHistoryWindow } from "@/features/overlays/openers/agentRunHistoryWindow";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { useOpenAgentSettingsWindow } from "@/features/overlays/openers/agentSettingsWindow";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";
import { useOpenChatDebugWindow } from "@/features/overlays/openers/chatDebugWindow";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { useOpenLiveIntegrationsWindow } from "@/features/overlays/openers/liveIntegrationsWindow";
import { useOpenGmailComposeWindow } from "@/features/overlays/openers/gmailComposeWindow";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import { useOpenFullScreenMarkdownEditorBridge } from "@/features/overlays/openers/fullScreenEditor";
import { openImageViewer } from "@/features/overlays/openers/imageViewer";
import { useOpenShortcutEditorWindow } from "@/features/overlays/openers/shortcutEditorWindow";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";
import { useOpenPromptPreviewWindow } from "@/features/overlays/openers/promptPreviewWindow";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { useOpenSaveTemplateDialog } from "@/features/overlays/openers/saveTemplateDialog";
import { useOpenScraperWindow } from "@/features/overlays/openers/scraperWindow";
import { useOpenPickListManagerWindow } from "@/features/overlays/openers/pickListManagerWindow";
import { useOpenSurfaceContextInspector } from "@/features/overlays/openers/surfaceContextInspector";
import { useOpenSurfaceContextWindow } from "@/features/overlays/openers/surfaceContextWindow";
import { useOpenSystemInstructionWindow } from "@/features/overlays/openers/systemInstructionWindow";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { useOpenTopicalMapWindow } from "@/features/overlays/openers/topicalMapWindow";
import { useOpenWorkingDocumentWindow } from "@/features/overlays/openers/workingDocumentWindow";
import { submitFeedback } from "@/actions/feedback.actions";
import PageHeaderPortal from "@/features/shell/components/header/PageHeaderPortal";
import PageHeaderRightPortal from "@/features/shell/components/header/PageHeaderRightPortal";
import { HeaderActionsSlot } from "@/features/shell/components/header/HeaderActionsSlot";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { HeaderControlSet } from "@/features/shell/components/header/HeaderControlSet";
import {
  NavItemTooltip,
  NavTooltipProvider,
} from "@/features/shell/components/header/NavItemTooltip";
import {
  NAV_ITEM_SELECTED,
  NAV_ITEM_UNSELECTED,
} from "@/features/shell/components/header/navItemClasses";
import { usePhonePageActions } from "@/features/shell/components/header/phone-page-actions";
import IconButton from "@/features/shell/components/IconButton";
import {
  ShellChromeMode,
  useShellCanvasFullScreen,
} from "@/features/shell/components/ShellChromeMode";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import {
  closeShellMobileMenu,
  openShellMobileMenu,
} from "@/features/shell/utils/closeShellMobileMenu";
import { pushFullScreenLayer } from "@/features/shell/canvas-chrome/open-layer";
import { appChatCanvasPort } from "@/features/canvas/host/chatCanvasPort";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { canvasItemId, type CanvasController } from "@ai-matrx/canvas";
import { canvasHoldsKind, openToolInCanvas, type ToolOpenInput } from "@/features/canvas/host/toolCanvas";
import {
  QUICK_CHAT_KIND,
  quickChatOpenInput,
  useOpenQuickChat,
  type OpenQuickChatOptions,
} from "@/features/quick-actions/canvas/quickChatKind";
import {
  CONTEXT_PREVIEW_KIND,
  contextPreviewOpenInput,
  useOpenContextPreview,
  type OpenContextPreviewOptions,
} from "@/features/canvas/host/conversation/contextPreviewKind";
import { useOpenConversationDocuments } from "@/features/canvas/host/conversation/documentsKind";
import { useOpenScratchpadPanel } from "@/features/quick-actions/canvas/scratchpadKind";
import "@/providers/chatUiRegistrationProfile";
// The app data around a rendered message (P29a); the engine itself is @ai-matrx/rich-content.
import "@/providers/chatAppDataRegistration";
// Scopes (context sources) and compute targets (P21).
import "@/providers/chatContextSources";

const DEFAULT_SERVER_URL = "https://server.app.matrxserver.com";

/** The app shell, as the chat package's chrome port (P22). */
const appChrome: ChatChromePort = {
  HeaderCenter: PageHeaderPortal,
  HeaderRight: PageHeaderRightPortal,
  HeaderActionsSlot,
  RouteHeader,
  HeaderControlSet,
  CanvasChromeMode: ShellChromeMode,
  IconButton,
  NavTooltipProvider,
  NavItemTooltip,
  usePhonePageActions,
  useCanvasFullScreen: useShellCanvasFullScreen,
  openMobileMenu: openShellMobileMenu,
  closeMobileMenu: closeShellMobileMenu,
  pushFullScreenLayer,
  styles: {
    navItemSelected: NAV_ITEM_SELECTED,
    navItemUnselected: NAV_ITEM_UNSELECTED,
    routeMenuNavItem: ROUTE_MENU_NAV_ITEM_CLASS,
    routeMenuIconSize: ROUTE_MENU_ICON_SIZE,
    routeMenuIconStrokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
  },
};

function toastOptions(options?: ChatNotifyOptions) {
  if (!options) return undefined;
  const description = [options.description, options.remedy]
    .filter(Boolean)
    .join(" ");
  return {
    ...(description ? { description } : {}),
    ...(options.id != null ? { id: options.id } : {}),
    ...(options.durationMs != null ? { duration: options.durationMs } : {}),
    ...(options.action ? { action: options.action } : {}),
  };
}

function reduxIdentity(store: AppStore): ChatIdentityPort {
  let last: ChatIdentity | null = null;
  return {
    current() {
      const next = readAppChatIdentity(store.getState());
      if (last && sameChatIdentity(last, next)) return last;
      last = next;
      return next;
    },
    subscribe: (listener) => store.subscribe(listener),
    getAccessToken: async () => selectAccessToken(store.getState()),
  };
}

function reduxOrg(store: AppStore): ChatOrgPort {
  let last: ChatOrganization | null = null;
  return {
    active() {
      const next = readAppChatOrg(store.getState());
      if (sameChatOrg(last, next)) return last;
      return (last = next);
    },
    subscribe: (listener) => store.subscribe(listener),
    require: requireOrganizationForChat,
  };
}

/** The settings register (lib/scoped-config), as the chat package's knobs port (P8). */
const appKnobs: ChatKnobsPort = {
  useEffective: useEffectiveKnob,
  useSession: useSessionKnob,
  peekSession: getSessionKnob,
  ensure: ensureEffectiveKnob,
  setOverride: (input) =>
    setKnobOverride({
      ...input,
      scopeKind: input.scopeKind as Parameters<
        typeof setKnobOverride
      >[0]["scopeKind"],
    }),
};

/** The package's setting doors, as this app's settings controls. */
function AppSettingDoor({ setting, ...rest }: ChatSettingDoorProps) {
  switch (setting) {
    case "live-conversation-voice":
      return <SettingDoor target={VOICE_SETTING_DOORS.liveConversation} {...rest} />;
  }
}

/**
 * Strings: the package's own localStorage store (as before P8). Preferences:
 * this app's preference slices, read the way the root reducer reads them.
 * Writes are store actions the root reducer turns into this app's own
 * (lib/redux/chat-host-from-app `withAppChatHost`).
 */
const appStringPrefs = createWebPrefs();

function reduxPrefs(store: AppStore): ChatPrefsPort {
  let last: ChatPreferences | null = null;
  return {
    ...appStringPrefs,
    preferences() {
      const next = readAppChatPreferences(store.getState());
      if (last && sameChatPreferences(last, next)) return last;
      return (last = next);
    },
    subscribePreferences: (listener) => store.subscribe(listener),
    knobs: appKnobs,
    SettingDoor: AppSettingDoor,
  };
}

/**
 * Package windows this app shows as canvas tabs, not overlays. Each maps to
 * its canvas kind and the open request built from the window's payload.
 */
const CANVAS_HOSTED_WINDOWS = {
  quickChat: {
    kind: QUICK_CHAT_KIND,
    input: (data: unknown) => quickChatOpenInput(data as OpenQuickChatOptions | undefined),
  },
  contextPreviewPanel: {
    kind: CONTEXT_PREVIEW_KIND,
    input: (data: unknown) => contextPreviewOpenInput(data as OpenContextPreviewOptions | undefined),
  },
} as const satisfies Partial<Record<ChatWindowId, { kind: string; input: (data: unknown) => ToolOpenInput }>>;

type CanvasHostedWindow = keyof typeof CANVAS_HOSTED_WINDOWS;

function isCanvasHosted(id: ChatWindowId): id is CanvasHostedWindow {
  return Object.prototype.hasOwnProperty.call(CANVAS_HOSTED_WINDOWS, id);
}

/** Every other package window id is this app's overlay id — checked at compile time. */
function chatWindowOverlay(id: Exclude<ChatWindowId, CanvasHostedWindow>): OverlayId {
  return id;
}

function reduxWindows(store: AppStore, canvas: CanvasController | null): ChatWindowsPort {
  return {
    open(id, data, instanceId) {
      if (isCanvasHosted(id)) {
        openToolInCanvas(canvas, CANVAS_HOSTED_WINDOWS[id].input(data));
        return;
      }
      store.dispatch(
        openOverlay({ overlayId: chatWindowOverlay(id), instanceId, data }),
      );
    },
    close(id, instanceId) {
      if (isCanvasHosted(id)) {
        if (!canvas) return;
        const kind = CANVAS_HOSTED_WINDOWS[id].kind;
        for (const item of Object.values(canvas.getState().items)) {
          if (item.kind === kind && (!instanceId || item.id === canvasItemId(kind, instanceId))) canvas.close(item.id);
        }
        return;
      }
      store.dispatch(
        closeOverlay({ overlayId: chatWindowOverlay(id), instanceId }),
      );
    },
    // Canvas state lives in this same store, so `subscribe` below covers both.
    isOpen: (id, instanceId) =>
      isCanvasHosted(id)
        ? canvasHoldsKind(canvas, CANVAS_HOSTED_WINDOWS[id].kind)
        : selectIsOverlayOpen(store.getState(), chatWindowOverlay(id), instanceId),
    managedWindowKeys: () =>
      selectAllWindows(store.getState()).map((entry) => entry.id),
    bringToFront(key) {
      store.dispatch(restoreWindow(key));
      store.dispatch(focusWindow(key));
    },
    subscribe: (listener) => store.subscribe(listener),
  };
}

const appNotify: ChatNotifyPort = {
  success: (message, options) =>
    void toast.success(message, toastOptions(options)),
  info: (message, options) => void toast.info(message, toastOptions(options)),
  warning: (message, options) =>
    void toast.warning(message, toastOptions(options)),
  error: (message, options) => void toast.error(message, toastOptions(options)),
  message: (message, options) =>
    void toast.message(message, toastOptions(options)),
  loading: (message, options) => toast.loading(message, toastOptions(options)),
  promise(work, labels) {
    toast.promise(work, labels);
    return work;
  },
  record: (level, ref, message, options) =>
    void recordToast[level](ref, message, toastOptions(options)),
};

/** The app's opener for every host window the package opens (P18). */
function useAppWindowOpeners(): ChatWindowOpeners {
  const dispatch = useAppDispatch();
  return {
    openGmailComposeWindow: useOpenGmailComposeWindow(),
    openLiveRunWindow: useOpenLiveRunWindow(),
    openFullScreenMarkdownEditor: useOpenFullScreenMarkdownEditorBridge(),
    openImageViewer: (opts) => openImageViewer(dispatch, opts),
    openShortcutEditorWindow: useOpenShortcutEditorWindow(),
    openAgentAdminFindUsagesWindow: useOpenAgentAdminFindUsagesWindow(),
    openAgentContentWindow: useOpenAgentContentWindow(),
    openAgentConvertSystemWindow: useOpenAgentConvertSystemWindow(),
    openAgentCreateAppWindow: useOpenAgentCreateAppWindow(),
    openAgentDataStorageWindow: useOpenAgentDataStorageWindow(),
    openAgentFindUsagesWindow: useOpenAgentFindUsagesWindow(),
    openAgentImportWindow: useOpenAgentImportWindow(),
    openAgentInterfaceVariationsWindow: useOpenAgentInterfaceVariationsWindow(),
    openAgentMemoryWindow: useOpenAgentMemoryWindow(),
    openAgentOptimizerWindow: useOpenAgentOptimizerWindow(),
    openAgentRunHistoryWindow: useOpenAgentRunHistoryWindow(),
    openAgentRunWindow: useOpenAgentRunWindow(),
    openAgentSettingsWindow: useOpenAgentSettingsWindow(),
    openAgentShortcutQuickCreateWindow: useOpenAgentShortcutQuickCreateWindow(),
    openAuthGateDialog: useOpenAuthGateDialog(),
    openChatDebugWindow: useOpenChatDebugWindow(),
    openContextPreviewPanel: useOpenContextPreview(),
    openDiffViewerWindow: useOpenDiffViewerWindow(),
    openLiveIntegrationsWindow: useOpenLiveIntegrationsWindow(),
    openMandateWindow: useOpenMandateWindow(),
    openNotesWindow: useOpenNotesWindow(),
    openPromptPreviewWindow: useOpenPromptPreviewWindow(),
    openQuickChatSheet: useOpenQuickChat(),
    openRunControlsWindow: useOpenRunControlsWindow(),
    openSaveTemplateDialog: useOpenSaveTemplateDialog(),
    openScraperWindow: useOpenScraperWindow(),
    openScratchpadPanel: useOpenScratchpadPanel(),
    openPickListManagerWindow: useOpenPickListManagerWindow(),
    openSurfaceContextInspector: useOpenSurfaceContextInspector(),
    openSurfaceContextWindow: useOpenSurfaceContextWindow(),
    openSystemInstructionWindow: useOpenSystemInstructionWindow(),
    openTaskEditorWindow: useOpenTaskEditorWindow(),
    openTopicalMapWindow: useOpenTopicalMapWindow(),
    openWorkingDocumentPanel: useOpenConversationDocuments(),
    openWorkingDocumentWindow: useOpenWorkingDocumentWindow(),
  };
}

export function ChatHostAdapter({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const navigation = useNextNavigation();
  const windowOpeners = useAppWindowOpeners();
  const canvas = useOptionalCanvas();

  const identity = reduxIdentity(store);
  const org = reduxOrg(store);
  const prefs = reduxPrefs(store);
  const host: ChatHost = {
    db: supabase,
    sourceApp: "matrx-frontend",
    // What this app is called on the conversations it starts (each screen keeps its own feature).
    app: { sourceApp: "matrx-frontend" },
    identity,
    org,
    server: {
      baseUrl: () =>
        selectResolvedBaseUrl(store.getState()) ?? DEFAULT_SERVER_URL,
      // THE ONE header builder (the chat package's): credential, organization, admin lane.
      async headers() {
        return chatRequestHeaders(
          {
            accessToken: await identity.getAccessToken(),
            fingerprintId: identity.current().fingerprintId,
          },
          org.active()?.id ?? null,
        );
      },
      // Every package server call runs this app's own lib/api (P9).
      api: appChatServerApi,
    },
    notify: appNotify,
    prefs,
    diagnostics: createAppChatDiagnostics(store.dispatch),
    navigation,
    windows: { ...reduxWindows(store, canvas), openers: windowOpeners },
    catalog: () => getAgentCatalog(),
    chrome: appChrome,
    feedback: { submit: (input) => submitFeedback(input) },
    routes: { workflowStudio: WORKFLOWS_APP_URL },
    canvas: appChatCanvasPort,
  };

  // The app's store IS the chat store (its root reducer spreads chatReducers):
  // package hooks read it through the package's own context (P3).
  return (
    <ChatProvider host={host} store={store}>
      {children}
    </ChatProvider>
  );
}
