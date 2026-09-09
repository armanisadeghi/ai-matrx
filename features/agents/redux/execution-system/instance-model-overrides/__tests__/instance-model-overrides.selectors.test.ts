/**
 * Guard test for the config_overrides delta contract.
 *
 * The backend rejects a default value supplied as an "override". The API
 * selector must therefore send ONLY genuine deltas — values that differ from
 * the instance's snapshotted baseSettings (the agent's defaults). This holds
 * for `model` too, which is folded into baseSettings at instance creation.
 */

import {
  selectSettingsForChatApi,
  selectSettingsOverridesForApi,
} from "../instance-model-overrides.selectors";
import type { RootState } from "@/lib/redux/store";
import reducer, {
  initInstanceOverrides,
  replaceOverrides,
  setOverrides,
  resetOverride,
} from "../instance-model-overrides.slice";

function makeState(entry: {
  baseSettings?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
  removals?: string[];
}): RootState {
  return {
    instanceModelOverrides: {
      byConversationId: {
        c1: {
          conversationId: "c1",
          baseSettings: entry.baseSettings ?? {},
          overrides: entry.overrides ?? {},
          removals: entry.removals ?? [],
        },
      },
    },
  } as unknown as RootState;
}

const api = (s: RootState) => selectSettingsOverridesForApi("c1")(s);
const chatApi = (s: RootState) => selectSettingsForChatApi("c1")(s);

describe("selectSettingsOverridesForApi — genuine-delta guard", () => {
  it("drops an override whose value equals the base (no defaults-as-override)", () => {
    expect(
      api(
        makeState({
          baseSettings: { temperature: 1 },
          overrides: { temperature: 1 },
        }),
      ),
    ).toBeUndefined();
  });

  it("sends an override that genuinely differs", () => {
    expect(
      api(
        makeState({
          baseSettings: { temperature: 1 },
          overrides: { temperature: 0.2 },
        }),
      ),
    ).toEqual({ temperature: 0.2 });
  });

  it("model: same as agent default → dropped; different → sent", () => {
    expect(
      api(
        makeState({
          baseSettings: { model: "m-1" },
          overrides: { model: "m-1" },
        }),
      ),
    ).toBeUndefined();
    expect(
      api(
        makeState({
          baseSettings: { model: "m-1" },
          overrides: { model: "m-2" },
        }),
      ),
    ).toEqual({ model: "m-2" });
  });

  it("deep-equal objects (e.g. response_format) are dropped", () => {
    expect(
      api(
        makeState({
          baseSettings: { response_format: { type: "json_schema" } },
          overrides: { response_format: { type: "json_schema" } },
        }),
      ),
    ).toBeUndefined();
  });

  it("removals are sent as null", () => {
    expect(
      api(
        makeState({
          baseSettings: { temperature: 1 },
          removals: ["temperature"],
        }),
      ),
    ).toEqual({ temperature: null });
  });

  it("returns undefined when there is nothing to send", () => {
    expect(api(makeState({}))).toBeUndefined();
    expect(
      api({
        instanceModelOverrides: { byConversationId: {} },
      } as unknown as RootState),
    ).toBeUndefined();
  });
});

describe("selectSettingsForChatApi", () => {
  it("merges model settings without a UI-gate filtering shim", () => {
    const result = chatApi(
      makeState({
        baseSettings: {
          model: "m-1",
          temperature: 0.4,
        },
        overrides: {
          temperature: 0.7,
        },
      }),
    );

    expect(result).toEqual({ model: "m-1", temperature: 0.7 });
  });
});

describe("Controls and Advanced share the override document", () => {
  it("round trips control edits, JSON replacement, null removal and reset through the API selector", () => {
    let state = reducer(
      undefined,
      initInstanceOverrides({
        conversationId: "c1",
        baseSettings: { model: "base-model", temperature: 1, top_p: 0.8 },
      }),
    );
    const wire = () => api(makeState(state.byConversationId.c1));
    state = reducer(
      state,
      setOverrides({ conversationId: "c1", changes: { temperature: 0.25 } }),
    );
    expect(wire()).toEqual({ temperature: 0.25 });

    // The Advanced document replaces the same entry, removing omitted keys.
    state = reducer(
      state,
      replaceOverrides({
        conversationId: "c1",
        changes: { model: "new-model", top_p: null },
      }),
    );
    expect(wire()).toEqual({ model: "new-model", top_p: null });
    expect(state.byConversationId.c1.baseSettings).toEqual({
      model: "base-model",
      temperature: 1,
      top_p: 0.8,
    });
    expect(state.byConversationId.c1.overrides).not.toHaveProperty(
      "temperature",
    );

    // Controls can restore a JSON removal and reset a model set in JSON.
    state = reducer(
      state,
      setOverrides({ conversationId: "c1", changes: { top_p: 0.6 } }),
    );
    state = reducer(
      state,
      resetOverride({ conversationId: "c1", key: "model" }),
    );
    expect(wire()).toEqual({ top_p: 0.6 });

    state = reducer(
      state,
      replaceOverrides({ conversationId: "c1", changes: { top_p: 0.8 } }),
    );
    expect(wire()).toBeUndefined();
    state = reducer(
      state,
      replaceOverrides({ conversationId: "c1", changes: {} }),
    );
    expect(state.byConversationId.c1.overrides).toEqual({});
    expect(state.byConversationId.c1.removals).toEqual([]);
  });
});
