/**
 * The chat package reads who is signed in and the active organization from its own `chatHost`
 * slice (PACKAGE-INDEPENDENCE.md P7). In this app's store that slice must equal the app's own
 * auth and app-context state IN THE SAME REDUCTION — with or without a <ChatProvider> mounted —
 * or a package selector lags the app by a dispatch (a send stamped with the previous
 * organization, an admin control shown to a signed-out person).
 *
 * Break it: remove `withAppChatHost` from `createSlimRootReducer` — every expectation below that
 * reads a person or an organization fails.
 */

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import {
  clearUserAuth,
  setAdminLaneOpen,
  setUserAuth,
} from "@/lib/redux/slices/userAuthSlice";
import { setOrganization } from "@/lib/redux/slices/appContextSlice";
import {
  selectIsAdmin,
  selectIsAuthenticated,
  selectIsSuperAdmin,
  selectUserId,
} from "@ai-matrx/chat/host/identity";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@ai-matrx/chat/host/org";

const PRIYA_ID = "5f0c1e7a-3b52-4b8e-9a41-2d6f8c0e9b13";
const HARBOR_LIGHT = { id: "8b2d4f60-71c9-4e3a-b5d8-0a9e6c4f2b17", name: "Harbor Light Dental" };
const LAKESIDE = { id: "2c9e7b14-5a3f-4d68-8e01-b7f4c2a9d356", name: "Lakeside Orthodontics" };

function makeAppStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

describe("chatHost follows this app's auth and organization in the same reduction", () => {
  it("a sign-in, an org switch and a sign-out reach the package's readers at once", () => {
    const store = makeAppStore();
    expect(selectUserId(store.getState())).toBeNull();
    expect(selectOrganizationId(store.getState())).toBeNull();

    store.dispatch(setUserAuth({ id: PRIYA_ID, email: "priya.raman@harborlightdental.com" }));
    expect(selectUserId(store.getState())).toBe(PRIYA_ID);
    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(store.getState().chatHost.identity.email).toBe("priya.raman@harborlightdental.com");

    store.dispatch(setOrganization(HARBOR_LIGHT));
    expect(selectOrganizationId(store.getState())).toBe(HARBOR_LIGHT.id);
    expect(selectOrganizationName(store.getState())).toBe(HARBOR_LIGHT.name);

    store.dispatch(setOrganization(LAKESIDE));
    expect(selectOrganizationId(store.getState())).toBe(LAKESIDE.id);

    store.dispatch(clearUserAuth());
    store.dispatch(setOrganization({ id: null }));
    expect(selectUserId(store.getState())).toBeNull();
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(selectOrganizationId(store.getState())).toBeNull();
  });

  it("admin power reaches the package only inside the admin section", () => {
    const store = makeAppStore();
    store.dispatch(setUserAuth({ id: PRIYA_ID, isAdmin: true, adminLevel: "super_admin" }));
    expect(selectIsAdmin(store.getState())).toBe(false);
    expect(selectIsSuperAdmin(store.getState())).toBe(false);

    store.dispatch(setAdminLaneOpen(true));
    expect(selectIsAdmin(store.getState())).toBe(true);
    expect(selectIsSuperAdmin(store.getState())).toBe(true);

    store.dispatch(setAdminLaneOpen(false));
    expect(selectIsSuperAdmin(store.getState())).toBe(false);
  });

  it("an action that changes neither leaves chatHost as it was", () => {
    const store = makeAppStore();
    store.dispatch(setUserAuth({ id: PRIYA_ID }));
    store.dispatch(setOrganization(HARBOR_LIGHT));
    const before = store.getState().chatHost;
    store.dispatch({ type: "test/unrelated" });
    expect(store.getState().chatHost).toBe(before);
  });
});
