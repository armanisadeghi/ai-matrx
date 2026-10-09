/** @jest-environment jsdom */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

jest.mock("@/lib/time/personTimeZone", () => ({
  ...jest.requireActual("@/lib/time/personTimeZone"),
  readDeviceTimeZone: () => "America/Los_Angeles",
}));

import PersonTimeZoneCapture from "./PersonTimeZoneCapture";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";

function makeStore(display: Record<string, unknown>, loadStatus = "loaded") {
  const calls: unknown[] = [];
  const store = configureStore({
    reducer: (state: any = { userPreferences: { display, _meta: { loadStatus } } }, action: any) => {
      if (action.type === setPreference.type) calls.push(action.payload);
      return state;
    },
  });
  return { store, calls };
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mount = (s: ReturnType<typeof makeStore>) => {
  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(<Provider store={s.store}><PersonTimeZoneCapture /></Provider>);
  });
};

describe("PersonTimeZoneCapture", () => {
  it("writes the device zone once preferences loaded and none is saved", () => {
    const s = makeStore({ timeZone: "", timeZoneFollowsDevice: true });
    mount(s);
    expect(s.calls).toEqual([{ module: "display", preference: "timeZone", value: "America/Los_Angeles" }]);
  });
  it("never writes over a pinned zone", () => {
    const s = makeStore({ timeZone: "Asia/Tokyo", timeZoneFollowsDevice: false });
    mount(s);
    expect(s.calls).toEqual([]);
  });
  it("waits for the saved preferences to load", () => {
    const s = makeStore({ timeZone: "", timeZoneFollowsDevice: true }, "loading");
    mount(s);
    expect(s.calls).toEqual([]);
  });
});
