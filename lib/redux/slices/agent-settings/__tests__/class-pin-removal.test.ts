/**
 * A class pin (`offering_id`) that lives in a chat/test entry's DEFAULTS must be
 * removable: choosing "no class" in the picker has to reach the wire as an
 * explicit `offering_id: null` and disappear from the effective settings.
 * Before the fix `computeOverrideDiff` only walked the proposed keys, so a
 * dropped default key produced no override and the agent's pin silently ran.
 */

import { configureStore } from "@reduxjs/toolkit";
import agentSettingsReducer, {
  applySettingsFromDialog,
  initializeAgent,
} from "../agentSettingsSlice";
import {
  selectApiPayload,
  selectEffectiveSettings,
} from "../selectors";
import {
  computeOverrideDiff,
  effectiveOfferingPinOf,
  mergeEffectiveSettings,
} from "../internal-utils";
import { withOfferingPin } from "@/features/ai-models/utils/offering-pin";
import type { RootState } from "@/lib/redux/store";

const AGENT = "ce77c9f5-5ca3-4a11-a70b-03bdfc21eff3";
const QWEN = "0b6f1c2e-4d7a-4e8b-9c1d-2a3b4c5d6e7f";
const LIGHTNING = "29874e67-5683-40c2-9adb-fb797ea9a176";
const FAST = "7c1e9a2b-3d4f-4a5b-8c6d-9e0f1a2b3c4d";

function makeStore(context: "chat" | "test") {
  const store = configureStore({
    reducer: { agentSettings: agentSettingsReducer },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    initializeAgent({
      agentId: AGENT,
      source: "prompt",
      context,
      settings: { model: QWEN, offering_id: LIGHTNING, temperature: 0.4 },
    }),
  );
  return store;
}

const asRoot = (s: unknown) => s as RootState;

describe.each(["chat", "test"] as const)(
  "removing a default class pin (%s context)",
  (context) => {
    it("reaches the API as offering_id: null and leaves the effective settings", () => {
      const store = makeStore(context);
      const effective = selectEffectiveSettings(asRoot(store.getState()), AGENT);
      store.dispatch(
        applySettingsFromDialog({
          agentId: AGENT,
          newSettings: withOfferingPin(effective, undefined),
        }),
      );

      const state = asRoot(store.getState());
      expect(selectEffectiveSettings(state, AGENT)).not.toHaveProperty("offering_id");
      expect(selectApiPayload(state, AGENT)).toMatchObject({ offering_id: null });
      expect(
        effectiveOfferingPinOf(state.agentSettings?.entries[AGENT]),
      ).toBeUndefined();
    });

    it("re-pinning another class is a plain override; re-pinning the default clears it", () => {
      const store = makeStore(context);
      const effective = selectEffectiveSettings(asRoot(store.getState()), AGENT);
      store.dispatch(
        applySettingsFromDialog({
          agentId: AGENT,
          newSettings: withOfferingPin(effective, FAST),
        }),
      );
      expect(selectApiPayload(asRoot(store.getState()), AGENT)).toMatchObject({
        offering_id: FAST,
      });

      const again = selectEffectiveSettings(asRoot(store.getState()), AGENT);
      store.dispatch(
        applySettingsFromDialog({
          agentId: AGENT,
          newSettings: withOfferingPin(again, LIGHTNING),
        }),
      );
      const entry = asRoot(store.getState()).agentSettings?.entries[AGENT];
      expect(entry?.overrides).toEqual({});
    });
  },
);

describe("computeOverrideDiff / mergeEffectiveSettings", () => {
  it("a dropped default key is a null override, and merge removes it", () => {
    const defaults = { model: QWEN, offering_id: LIGHTNING };
    const diff = computeOverrideDiff(defaults, { model: QWEN });
    expect(diff).toEqual({ offering_id: null });
    expect(mergeEffectiveSettings(defaults, diff)).toEqual({ model: QWEN });
  });

  it("a key absent from both sides produces no override", () => {
    expect(computeOverrideDiff({ model: QWEN }, { model: QWEN })).toEqual({});
  });
});
