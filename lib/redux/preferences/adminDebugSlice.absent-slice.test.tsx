/**
 * @jest-environment jsdom
 */
// Guard: a store that does not mount `adminDebug` (test harnesses, embedded
// surfaces) must still render any component that publishes debug context.
// Regression: the Share dialog gained usePageCapture -> useDebugContext ->
// selectIsDebugMode, and every notes test that opens it crashed with
// "Cannot read properties of undefined (reading 'isDebugMode')".
import React, { act } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { createRoot } from "react-dom/client";
import adminDebugReducer, {
  selectAdminDebug,
  selectDebugData,
  selectDebugIndicators,
  selectDebugKey,
  selectExecutionStateDebug,
  selectIsDebugMode,
  selectPromptDebugIndicator,
  selectResourceDebugIndicator,
  selectRouteContext,
} from "./adminDebugSlice";
import { useDebugContext } from "@/hooks/useDebugContext";

const declaredDefault = adminDebugReducer(undefined, { type: "@@init" });

describe("admin debug selectors on a store without the adminDebug slice", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("every selector reads the slice's declared initial state", () => {
    const state = {};
    expect(selectIsDebugMode(state)).toBe(declaredDefault.isDebugMode);
    expect(selectRouteContext(state)).toBe(declaredDefault.routeContext);
    expect(selectDebugData(state)).toEqual(declaredDefault.debugData);
    expect(selectDebugKey("anything")(state)).toBeUndefined();
    expect(selectAdminDebug(state)).toEqual(declaredDefault);
    expect(selectDebugIndicators(state)).toEqual(declaredDefault.indicators);
    expect(selectPromptDebugIndicator(state)).toBeUndefined();
    expect(selectResourceDebugIndicator(state)).toBeUndefined();
    expect(selectExecutionStateDebug(state)).toBeUndefined();
    // Nothing fails silently: the stand-in announces itself once, with a remedy.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/mount adminDebugReducer/);
  });

  it("useDebugContext renders inactive instead of crashing the host component", () => {
    const store = configureStore({
      reducer: {
        userAuth: (s = { adminLevel: null, adminLaneOpen: false }) => s,
      },
    });
    function Host() {
      const { isActive } = useDebugContext("Share");
      return <span>{isActive ? "active" : "inactive"}</span>;
    }
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <Provider store={store}>
          <Host />
        </Provider>,
      );
    });
    expect(container.textContent).toBe("inactive");
    act(() => root.unmount());
  });

  it("a mounted slice is still read as-is", () => {
    const store = configureStore({ reducer: { adminDebug: adminDebugReducer } });
    expect(selectIsDebugMode(store.getState())).toBe(false);
    store.dispatch({ type: "adminDebug/setDebugMode", payload: true });
    expect(selectIsDebugMode(store.getState())).toBe(true);
  });
});
