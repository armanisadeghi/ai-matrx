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
import type { ChatRootState } from "../../../../../store/root-state";
import reducer, {
  initInstanceOverrides,
  replaceOverrides,
  setOverrides,
  resetOverride,
  markRemoved,
  updateBaseSettings,
} from "../instance-model-overrides.slice";

function makeState(entry: {
  baseSettings?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
  removals?: string[];
}): ChatRootState {
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
  } as unknown as ChatRootState;
}

const api = (s: ChatRootState) => selectSettingsOverridesForApi("c1")(s);
const chatApi = (s: ChatRootState) => selectSettingsForChatApi("c1")(s);

describe("THE AUTO RULE — 'auto' effort is the absence of an override (Arman, 2026-09-28)", () => {
  it("never sends reasoning_effort 'auto', whichever panel wrote it", () => {
    expect(
      api(makeState({ baseSettings: { reasoning_effort: "high" }, overrides: { reasoning_effort: "auto" } })),
    ).toBeUndefined();
  });

  it("never sends visualization 'auto' either — its auto IS unset", () => {
    expect(
      api(makeState({ overrides: { visualization: "auto" } })),
    ).toBeUndefined();
  });

  it("keeps 'auto' where it is a real provider value (render_quality)", () => {
    expect(
      api(makeState({ overrides: { render_quality: "auto" } })),
    ).toEqual({ render_quality: "auto" });
  });

  it("sends any other effort exactly as chosen", () => {
    expect(
      api(makeState({ baseSettings: { reasoning_effort: "high" }, overrides: { reasoning_effort: "low" } })),
    ).toEqual({ reasoning_effort: "low" });
  });
});

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
      } as unknown as ChatRootState),
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
  it("keeps draft intent while the inherited baseline changes, exposing only current local deltas", () => {
    let state = reducer(
      undefined,
      initInstanceOverrides({
        conversationId: "c1",
        baseSettings: { model: "system-model", temperature: 0.3 },
      }),
    );
    state = reducer(
      state,
      setOverrides({
        conversationId: "c1",
        changes: { model: "personal-model", temperature: 0.8 },
      }),
    );
    const wire = () => api(makeState(state.byConversationId.c1));
    expect(Object.keys(wire() ?? {})).toHaveLength(2);
    state = reducer(
      state,
      updateBaseSettings({
        conversationId: "c1",
        baseSettings: { model: "personal-model", temperature: 0.8 },
      }),
    );
    expect(wire()).toBeUndefined();
    expect(state.byConversationId.c1.overrides).toEqual({
      model: "personal-model",
      temperature: 0.8,
    });
    state = reducer(
      state,
      updateBaseSettings({
        conversationId: "c1",
        baseSettings: { model: "system-model", temperature: 0.4 },
      }),
    );
    expect(wire()).toEqual({ model: "personal-model", temperature: 0.8 });
  });

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

describe("Clear to not set (F-a) — one key goes out as an explicit null", () => {
  it("clearing one stored key sends only that key, as null", () => {
    let state = reducer(
      undefined,
      initInstanceOverrides({
        conversationId: "c1",
        baseSettings: { model: "m", reasoning_effort: "high", temperature: 0.3 },
      }),
    );
    state = reducer(
      state,
      markRemoved({ conversationId: "c1", key: "reasoning_effort" }),
    );
    expect(api(makeState(state.byConversationId.c1))).toEqual({
      reasoning_effort: null,
    });
    // The instance's snapshot of the agent is untouched.
    expect(state.byConversationId.c1.baseSettings).toEqual({
      model: "m",
      reasoning_effort: "high",
      temperature: 0.3,
    });
    // Reset returns to inheriting: nothing goes out.
    state = reducer(
      state,
      resetOverride({ conversationId: "c1", key: "reasoning_effort" }),
    );
    expect(api(makeState(state.byConversationId.c1))).toBeUndefined();
  });
});
