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
//   server      → apiConfig's resolved aidream URL; bearer + X-Organization-Id
//   notify      → lib/toast (`toast`, `recordToast`)
//   diagnostics → the Error Inspector capture store (which persists through
//                 `log_client_error`); sourceApp names this client for the
//                 package default as well
//   navigation  → next/navigation + next/link
//   windows     → the overlay system (`openOverlay` / `closeOverlay`) and
//                 the window manager; every CHAT_WINDOWS id must be an
//                 OverlayId (`chatWindowOverlay` fails to compile otherwise);
//                 openers → the app's overlay openers (`useAppWindowOpeners`)
//   catalog     → the app's one agent catalog (created by AgentCatalogHost,
//                 read lazily so its archive-knob seed is never pre-empted)
//   prefs       → package default until P8 maps the preference knobs
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChatProvider } from "@ai-matrx/chat/host/react";
import type {
  ChatChromePort,
  ChatHost,
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
import { useAppStore } from "@/lib/redux/hooks";
import type { AppStore } from "@/lib/redux/store";
import { selectAccessToken } from "@/lib/redux/selectors/userSelectors";
import {
  readAppChatIdentity,
  readAppChatOrg,
  sameChatIdentity,
  sameChatOrg,
} from "@/lib/redux/chat-host-from-app";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
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
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
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
import { useOpenContextPreviewPanel } from "@/features/overlays/openers/contextPreviewPanel";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { useOpenLiveIntegrationsWindow } from "@/features/overlays/openers/liveIntegrationsWindow";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";
import { useOpenPromptPreviewWindow } from "@/features/overlays/openers/promptPreviewWindow";
import { useOpenQuickChatSheet } from "@/features/overlays/openers/quickChat";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { useOpenSaveKitDialog } from "@/features/overlays/openers/saveKitDialog";
import { useOpenScraperWindow } from "@/features/overlays/openers/scraperWindow";
import { useOpenStructuredListManagerV2Window } from "@/features/overlays/openers/structuredListManagerV2Window";
import { useOpenSurfaceContextInspector } from "@/features/overlays/openers/surfaceContextInspector";
import { useOpenSurfaceContextWindow } from "@/features/overlays/openers/surfaceContextWindow";
import { useOpenSystemInstructionWindow } from "@/features/overlays/openers/systemInstructionWindow";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { useOpenTopicalMapWindow } from "@/features/overlays/openers/topicalMapWindow";
import { useOpenWorkingDocumentPanel } from "@/features/overlays/openers/workingDocumentPanel";
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

/** The package's window ids are this app's overlay ids — checked at compile time. */
function chatWindowOverlay(id: ChatWindowId): OverlayId {
  return id;
}

function reduxWindows(store: AppStore): ChatWindowsPort {
  return {
    open(id, data, instanceId) {
      store.dispatch(
        openOverlay({ overlayId: chatWindowOverlay(id), instanceId, data }),
      );
    },
    close(id, instanceId) {
      store.dispatch(
        closeOverlay({ overlayId: chatWindowOverlay(id), instanceId }),
      );
    },
    isOpen: (id, instanceId) =>
      selectIsOverlayOpen(store.getState(), id, instanceId),
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
  return {
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
    openContextPreviewPanel: useOpenContextPreviewPanel(),
    openDiffViewerWindow: useOpenDiffViewerWindow(),
    openLiveIntegrationsWindow: useOpenLiveIntegrationsWindow(),
    openMandateWindow: useOpenMandateWindow(),
    openNotesWindow: useOpenNotesWindow(),
    openPromptPreviewWindow: useOpenPromptPreviewWindow(),
    openQuickChatSheet: useOpenQuickChatSheet(),
    openRunControlsWindow: useOpenRunControlsWindow(),
    openSaveKitDialog: useOpenSaveKitDialog(),
    openScraperWindow: useOpenScraperWindow(),
    openStructuredListManagerV2Window: useOpenStructuredListManagerV2Window(),
    openSurfaceContextInspector: useOpenSurfaceContextInspector(),
    openSurfaceContextWindow: useOpenSurfaceContextWindow(),
    openSystemInstructionWindow: useOpenSystemInstructionWindow(),
    openTaskEditorWindow: useOpenTaskEditorWindow(),
    openTopicalMapWindow: useOpenTopicalMapWindow(),
    openWorkingDocumentPanel: useOpenWorkingDocumentPanel(),
    openWorkingDocumentWindow: useOpenWorkingDocumentWindow(),
  };
}

export function ChatHostAdapter({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const router = useRouter();
  const windowOpeners = useAppWindowOpeners();

  const identity = reduxIdentity(store);
  const org = reduxOrg(store);
  const host: ChatHost = {
    db: supabase,
    sourceApp: "matrx-frontend",
    identity,
    org,
    server: {
      baseUrl: () =>
        selectResolvedBaseUrl(store.getState()) ?? DEFAULT_SERVER_URL,
      async headers() {
        const headers: Record<string, string> = {};
        const token = await identity.getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const active = org.active();
        if (active) headers["X-Organization-Id"] = active.id;
        return headers;
      },
    },
    notify: appNotify,
    diagnostics: {
      capture(error, ctx) {
        // P5 adds a dedicated capture source for the package's own failures.
        captureError({
          source: "runtime-exception",
          name: `chat:${ctx.area}`,
          code: ctx.code,
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof Error && error.stack
            ? { stack: error.stack }
            : {}),
          ...(ctx.detail !== undefined ? { raw: ctx.detail } : {}),
        });
      },
    },
    navigation: {
      push: (href) => router.push(href),
      replace: (href) => router.replace(href),
      back: () => router.back(),
      Link,
    },
    windows: { ...reduxWindows(store), openers: windowOpeners },
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
