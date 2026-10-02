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
//   windows     → the overlay system (`openOverlay` / `closeOverlay`)
//   catalog     → the app's one agent catalog (created by AgentCatalogHost,
//                 read lazily so its archive-knob seed is never pre-empted)
//   prefs       → package default until P8 maps the preference knobs
//
// Inside StoreProvider: every port reads the live store.

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChatProvider } from "@ai-matrx/chat/host/react";
import type {
  ChatHost,
  ChatIdentity,
  ChatIdentityPort,
  ChatNotifyOptions,
  ChatNotifyPort,
  ChatOrganization,
  ChatOrgPort,
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
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { isOverlayId } from "@/features/overlays/catalogue";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { toast, recordToast } from "@/lib/toast";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { getAgentCatalog } from "@/lib/agents/catalog";

const DEFAULT_SERVER_URL = "https://server.app.matrxserver.com";

function toastOptions(options?: ChatNotifyOptions) {
  if (!options) return undefined;
  const description = [options.description, options.remedy]
    .filter(Boolean)
    .join(" ");
  return {
    ...(description ? { description } : {}),
    ...(options.id != null ? { id: options.id } : {}),
    ...(options.durationMs != null ? { duration: options.durationMs } : {}),
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

const appNotify: ChatNotifyPort = {
  success: (message, options) =>
    void toast.success(message, toastOptions(options)),
  info: (message, options) => void toast.info(message, toastOptions(options)),
  warning: (message, options) =>
    void toast.warning(message, toastOptions(options)),
  error: (message, options) => void toast.error(message, toastOptions(options)),
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
    windows: {
      open(id, data, instanceId) {
        if (!isOverlayId(id)) {
          captureError({
            source: "runtime-exception",
            name: "chat:windows",
            code: "unknown-window-id",
            message: `Chat asked to open window "${id}", which is not in the overlay catalogue.`,
          });
          return;
        }
        store.dispatch(openOverlay({ overlayId: id, instanceId, data }));
      },
      close(id, instanceId) {
        if (isOverlayId(id))
          store.dispatch(closeOverlay({ overlayId: id, instanceId }));
      },
    },
    catalog: () => getAgentCatalog(),
  };

  return <ChatProvider host={host}>{children}</ChatProvider>;
}
