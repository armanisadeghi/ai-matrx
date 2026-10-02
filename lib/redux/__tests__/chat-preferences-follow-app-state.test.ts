/**
 * The chat package reads the person's preferences and the debug flags from its own
 * `chatHost.preferences` (PACKAGE-INDEPENDENCE.md P8). In this app's store they must equal the
 * app's preference slices IN THE SAME REDUCTION, and a write through the prefs port must land in
 * the app's own slice — or an unsent draft is restored against the person's choice, a debug
 * control shows for someone who switched it off, a run goes to the wrong desktop engine.
 *
 * Break it: drop `readAppChatPreferences` from `withAppChatHost` (lib/redux/chat-host-from-app.ts)
 * — every read below stays at the platform default and the first expectation after a dispatch fails.
 */

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { setShowCreatorPanel } from "@/lib/redux/preferences/creatorDebugSlice";
import { setDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import { setDesktopTargetInstanceId } from "@/lib/redux/preferences/adminPreferencesSlice";
import { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import {
  selectDesktopTargetInstanceId,
  selectDirectiveApplyPolicy,
  selectIsDebugMode,
  selectIsSuperAdminDebugger,
  selectRestoreUnsentDrafts,
  selectSandboxBySurface,
  selectShowCreatorPanel,
} from "@ai-matrx/chat/host/prefs";
import {
  createWebPrefs,
  DEFAULT_CHAT_PREFERENCES,
} from "@ai-matrx/chat/host/defaults/prefs";

const PRIYA_ID = "5f0c1e7a-3b52-4b8e-9a41-2d6f8c0e9b13";
const DESK_ENGINE = "mbp-priya-harbor-light";

function makeAppStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

describe("chatHost.preferences follows this app's preference slices in the same reduction", () => {
  it("each preference and debug flag reaches the package's readers at once", () => {
    const store = makeAppStore();
    const state = () => store.getState();
    expect(selectRestoreUnsentDrafts(state())).toBe(true);
    expect(selectIsDebugMode(state())).toBe(false);

    store.dispatch(
      setPreference({ module: "prompts", preference: "restoreUnsentDrafts", value: false }),
    );
    expect(selectRestoreUnsentDrafts(state())).toBe(false);

    store.dispatch(
      setPreference({ module: "assistant", preference: "directiveApplyPolicy", value: "ask" }),
    );
    expect(selectDirectiveApplyPolicy(state())).toBe("ask");

    const binding = { rowId: "sbx-7f21", proxyUrl: "https://sbx-7f21.sandbox.aimatrx.com" };
    store.dispatch(
      setPreference({
        module: "coding",
        preference: "activeAgentSandboxBySurface",
        value: { "chat-route": binding },
      }),
    );
    expect(selectSandboxBySurface(state())["chat-route"]).toEqual(binding);

    store.dispatch(setShowCreatorPanel(true));
    expect(selectShowCreatorPanel(state())).toBe(true);

    store.dispatch(setDebugMode(true));
    expect(selectIsDebugMode(state())).toBe(true);

    store.dispatch(setDesktopTargetInstanceId(DESK_ENGINE));
    expect(selectDesktopTargetInstanceId(state())).toBe(DESK_ENGINE);

    store.dispatch(setUserAuth({ id: PRIYA_ID, adminLevel: "super_admin" }));
    expect(selectIsSuperAdminDebugger(state())).toBe(true);
  });

  it("an action that changes no preference leaves chatHost as it was", () => {
    const store = makeAppStore();
    store.dispatch(setDebugMode(true));
    const before = store.getState().chatHost;
    store.dispatch({ type: "test/unrelated" });
    expect(store.getState().chatHost).toBe(before);
  });
});

describe("a bare host keeps the person's preferences itself", () => {
  it("a write through the default port changes its preferences and survives a fresh port", () => {
    window.localStorage.clear();
    const prefs = createWebPrefs();
    expect(prefs.preferences!()).toEqual(DEFAULT_CHAT_PREFERENCES);
    let notified = 0;
    prefs.subscribePreferences!(() => notified++);
    prefs.write!({
      kind: "preference",
      module: "prompts",
      preference: "restoreUnsentDrafts",
      value: false,
    });
    expect(prefs.preferences!().restoreUnsentDrafts).toBe(false);
    expect(notified).toBe(1);
    expect(createWebPrefs().preferences!().restoreUnsentDrafts).toBe(false);
  });
});
