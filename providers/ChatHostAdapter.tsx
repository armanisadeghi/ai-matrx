"use client";

// providers/ChatHostAdapter.tsx
//
// THE ONE `@ai-matrx/chat` host mount (PACKAGE-INDEPENDENCE §2.1, slice P1).
// The package's ports are wired here to what this app already has — nothing
// in the package reads them yet (each port slice P4–P22 switches its call
// sites), so mounting this changes no behaviour.
//
//   identity    → Redux userAuth/userProfile selectors (lane-aware admin level)
//   org         → appContext active org; require = the canonical org gate
//   server      → apiConfig's resolved aidream URL; bearer + X-Organization-Id
//   notify      → lib/toast (`toast`, `recordToast`)
//   diagnostics → the Error Inspector capture store (which persists through
//                 `log_client_error`); sourceApp names this client for the
//                 package default as well
//   navigation  → next/navigation + next/link
//   windows     → the overlay system (`openOverlay` / `closeOverlay`) and
//                 the window manager; every CHAT_WINDOWS id must be an
//                 OverlayId (`chatWindowOverlay` fails to compile otherwise)
//   catalog     → the app's one agent catalog (created by AgentCatalogHost,
//                 read lazily so its archive-knob seed is never pre-empted)
//   prefs       → package default until P8 maps the preference knobs
//   chrome      → the app shell (features/shell): header slots, the phone ⋮
//                 sheet, the nav drawer, canvas chrome, full-screen layers
//   feedback    → the `submitFeedback` action (the in-app feedback window's path)
//   routes      → nav-data's Workflow Studio address
//
// Inside StoreProvider: every port reads the live store.

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
  ChatWindowsPort,
} from "@ai-matrx/chat/host";
import { supabase } from "@/utils/supabase/client";
import { useAppStore } from "@/lib/redux/hooks";
import type { AppStore } from "@/lib/redux/store";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  selectAccessToken,
  selectAdminLevel,
  selectIsAuthenticated,
  selectUserAvatarUrl,
  selectUserEmail,
  selectUserFullName,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@/lib/redux/slices/appContextSlice";
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
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { toast, recordToast } from "@/lib/toast";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { getAgentCatalog } from "@/lib/agents/catalog";
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
  const read = (state: RootState): ChatIdentity => ({
    userId: selectUserId(state),
    isAuthenticated: selectIsAuthenticated(state),
    adminLevel: selectAdminLevel(state),
    email: selectUserEmail(state),
    displayName: selectUserFullName(state) || null,
    avatarUrl: selectUserAvatarUrl(state) || null,
  });
  return {
    current() {
      const next = read(store.getState());
      if (
        last &&
        last.userId === next.userId &&
        last.isAuthenticated === next.isAuthenticated &&
        last.adminLevel === next.adminLevel &&
        last.email === next.email &&
        last.displayName === next.displayName &&
        last.avatarUrl === next.avatarUrl
      ) {
        return last;
      }
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
      const state = store.getState();
      const id = selectOrganizationId(state);
      if (!id) return (last = null);
      const name = selectOrganizationName(state);
      if (last && last.id === id && last.name === name) return last;
      return (last = { id, name });
    },
    subscribe: (listener) => store.subscribe(listener),
    require: () => ensureOrganizationContext(),
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

export function ChatHostAdapter({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const router = useRouter();

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
    windows: reduxWindows(store),
    catalog: () => getAgentCatalog(),
    chrome: appChrome,
    feedback: { submit: (input) => submitFeedback(input) },
    routes: { workflowStudio: WORKFLOWS_APP_URL },
  };

  return <ChatProvider host={host}>{children}</ChatProvider>;
}
