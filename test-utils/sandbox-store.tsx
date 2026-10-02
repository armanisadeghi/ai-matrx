/**
 * test-utils/sandbox-store.tsx
 *
 * The REAL store the sandbox surfaces run on, for jest suites.
 *
 * Both sandbox page suites used to replace `@/lib/redux/hooks` with a
 * hand-written object exposing only `useAppSelector` — and, in the detail
 * suite, a `useAppSelector` that dispatched on `selector.name`, so a selector
 * rename or an import through the `userSlice` shim silently answered the wrong
 * field. On 2026-09-18 both suites died at `useAppDispatch is not a function`
 * the moment the pages adopted `useSandboxLifecycleSubmission` (86892c31a9):
 * the double had frozen the hooks module at the shape of an older page.
 *
 * A store is not an external dependency — selectors, reducers and the
 * dispatch path are the app's own logic (forcing-function-tests §4). So the
 * suites run the real `userAuth`, `appContext` and `sandboxLifecycle` reducers
 * with the real `react-redux` Provider, and a test changes identity by
 * dispatching a real action. Nothing about which selector reads which field is
 * arranged by the harness any more.
 *
 * The three reducers are exactly what the sandbox surfaces read
 * (`selectIsSuperAdmin`/`selectAuthReady`/`selectUserId` → `userAuth`,
 * `selectOrganizationId` → `appContext`, the lifecycle submission and terminal
 * invalidation hooks → `sandboxLifecycle`). The full `makeStore` boots sagas,
 * sync, realtime and a dozen middlewares for every route in the app; mounting
 * it here would test those, not these pages.
 */

import type { ReactNode } from "react";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { chatHostReducer } from "@ai-matrx/chat/store/chat-host.slice";
import { withAppChatHost } from "@/lib/redux/chat-host-from-app";
import userProfileReducer from "@/lib/redux/slices/userProfileSlice";
import { Provider } from "react-redux";
import userAuthReducer, {
  setAdminLaneOpen,
  setUserAuth,
} from "@/lib/redux/slices/userAuthSlice";
import appContextReducer, {
  setOrganization,
} from "@/lib/redux/slices/appContextSlice";
import sandboxLifecycleReducer from "@/lib/redux/slices/sandboxLifecycleSlice";
import type { AdminLevel } from "@/utils/supabase/userSessionData";

export interface SandboxTestIdentity {
  userId: string | null;
  organizationId: string | null;
  /** `"super_admin"` is what `selectIsSuperAdmin` demands — inside the admin section. */
  adminLevel?: AdminLevel | null;
  /**
   * Is the page under test in the admin section? Admin POWER exists only
   * there (utils/supabase/adminLane.ts); default: a user page.
   */
  adminLaneOpen?: boolean;
}

export function createSandboxTestStore(identity: SandboxTestIdentity) {
  // `chatHost` is the chat package's view of who this is, kept equal to userAuth / appContext by
  // the app's own root-reducer wrapper (lib/redux/chat-host-from-app) — the same in the app.
  const store = configureStore({
    reducer: withAppChatHost(
      combineReducers({
        userAuth: userAuthReducer,
        userProfile: userProfileReducer,
        appContext: appContextReducer,
        sandboxLifecycle: sandboxLifecycleReducer,
        chatHost: chatHostReducer,
      }),
    ),
  });
  setSandboxTestIdentity(store, identity);
  return store;
}

export type SandboxTestStore = ReturnType<typeof createSandboxTestStore>;

/** Sign a different person in, exactly as the app's own auth boot would. */
export function setSandboxTestIdentity(
  store: SandboxTestStore,
  { userId, organizationId, adminLevel = null, adminLaneOpen = false }: SandboxTestIdentity,
): void {
  store.dispatch(setAdminLaneOpen(adminLaneOpen));
  store.dispatch(
    setUserAuth({
      id: userId,
      isAdmin: adminLevel !== null,
      adminLevel,
    }),
  );
  store.dispatch(setOrganization({ id: organizationId }));
}

export function SandboxStoreProvider({
  store,
  children,
}: {
  store: SandboxTestStore;
  children: ReactNode;
}) {
  return <Provider store={store}>{children}</Provider>;
}
