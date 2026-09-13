import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import apiConfigReducer, {
  setLoopbackAccess,
} from "@/lib/redux/slices/apiConfigSlice";
import adminPreferencesReducer from "@/lib/redux/preferences/adminPreferencesSlice";
import { RetiredApiSelectionNotice } from "./RetiredApiSelectionNotice";

jest.mock("@/lib/toast", () => ({
  toast: { warning: jest.fn() },
}));

import { toast } from "@/lib/toast";

const warning = jest.mocked(toast.warning);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeStore({
  apiNotice = false,
  staleAdminOverride = false,
}: {
  apiNotice?: boolean;
  staleAdminOverride?: boolean;
} = {}) {
  const apiConfig: ReturnType<typeof apiConfigReducer> = {
    ...apiConfigReducer(undefined, { type: "test/init" }),
    retiredEc2ApiSelectionNotice: apiNotice,
  };
  const adminPreferences: ReturnType<typeof adminPreferencesReducer> =
    adminPreferencesReducer(undefined, { type: "test/init" });
  const store = configureStore({
    reducer: {
      apiConfig: apiConfigReducer,
      adminPreferences: adminPreferencesReducer,
    },
    preloadedState: { apiConfig, adminPreferences },
  });
  if (staleAdminOverride) {
    // A legacy preloaded/cross-tab action can still carry the retired literal
    // at runtime even though the current action creator's public type excludes it.
    store.dispatch({
      type: "adminPreferences/setServerOverride",
      payload: "ec2",
    });
  }
  return store;
}

async function mount(
  store: ReturnType<typeof makeStore>,
  strict = false,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const notice = <RetiredApiSelectionNotice />;
  await act(async () => {
    root.render(
      <Provider store={store}>{strict ? <React.StrictMode>{notice}</React.StrictMode> : notice}</Provider>,
    );
  });
  return {
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe("RetiredApiSelectionNotice", () => {
  beforeEach(() => warning.mockReset());

  it("acknowledges an API-config migration once and does not repeat after remount", async () => {
    const store = makeStore({ apiNotice: true });
    const first = await mount(store);

    expect(warning).toHaveBeenCalledTimes(1);
    expect(store.getState().apiConfig.retiredEc2ApiSelectionNotice).toBe(false);
    await first.unmount();
    const second = await mount(store);
    expect(warning).toHaveBeenCalledTimes(1);
    await second.unmount();
  });

  it("migrates a stale admin override and acknowledges the same shared notice", async () => {
    const store = makeStore({ staleAdminOverride: true });
    const mounted = await mount(store);

    expect(warning).toHaveBeenCalledTimes(1);
    expect(store.getState().adminPreferences.serverOverride).toBe("production");
    expect(
      store.getState().adminPreferences.retiredEc2ApiSelectionNotice,
    ).toBe(false);
    await mounted.unmount();
  });

  it("coalesces API and admin migrations into one warning and acknowledges both", async () => {
    const store = makeStore({ apiNotice: true, staleAdminOverride: true });
    const mounted = await mount(store);

    expect(warning).toHaveBeenCalledTimes(1);
    expect(store.getState().apiConfig.retiredEc2ApiSelectionNotice).toBe(false);
    expect(
      store.getState().adminPreferences.retiredEc2ApiSelectionNotice,
    ).toBe(false);
    await mounted.unmount();
  });

  it("emits one warning under StrictMode replay", async () => {
    const store = makeStore({ apiNotice: true });
    const mounted = await mount(store, true);

    expect(warning).toHaveBeenCalledTimes(1);
    expect(store.getState().apiConfig.retiredEc2ApiSelectionNotice).toBe(false);
    await mounted.unmount();
  });

  it("allows a later real legacy reappearance to start a new notice episode", async () => {
    const store = makeStore({ apiNotice: true });
    const mounted = await mount(store);
    expect(warning).toHaveBeenCalledTimes(1);

    window.localStorage.setItem(
      "matrx.apiConfig.v1",
      JSON.stringify({
        activeServer: "ec2",
        customUrl: null,
        serviceOverrides: {},
        apiVersion: null,
        pathOverrides: {},
        aiApiVersionOverride: null,
      }),
    );
    await act(async () => {
      store.dispatch(setLoopbackAccess());
    });

    expect(warning).toHaveBeenCalledTimes(2);
    expect(store.getState().apiConfig.retiredEc2ApiSelectionNotice).toBe(false);
    window.localStorage.removeItem("matrx.apiConfig.v1");
    await mounted.unmount();
  });
});
