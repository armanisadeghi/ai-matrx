/**
 * Guard test for the config_overrides delta contract.
 *
 * The backend rejects a default value supplied as an "override". The API
 * selector must therefore send ONLY genuine deltas — values that differ from
 * the instance's snapshotted baseSettings (the agent's defaults). This holds
 * for `model` too, which is folded into baseSettings at instance creation.
 */

import { selectSettingsOverridesForApi } from "../instance-model-overrides.selectors";
import type { RootState } from "@/lib/redux/store";

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

describe("selectSettingsOverridesForApi — genuine-delta guard", () => {
  it("drops an override whose value equals the base (no defaults-as-override)", () => {
    expect(
      api(makeState({ baseSettings: { temperature: 1 }, overrides: { temperature: 1 } })),
    ).toBeUndefined();
  });

  it("sends an override that genuinely differs", () => {
    expect(
      api(makeState({ baseSettings: { temperature: 1 }, overrides: { temperature: 0.2 } })),
    ).toEqual({ temperature: 0.2 });
  });

  it("model: same as agent default → dropped; different → sent", () => {
    expect(
      api(makeState({ baseSettings: { model: "m-1" }, overrides: { model: "m-1" } })),
    ).toBeUndefined();
    expect(
      api(makeState({ baseSettings: { model: "m-1" }, overrides: { model: "m-2" } })),
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

  it("strips UI-capability flags but keeps real deltas", () => {
    expect(
      api(makeState({ baseSettings: {}, overrides: { tools: true, temperature: 0.5 } })),
    ).toEqual({ temperature: 0.5 });
  });

  it("removals are sent as null", () => {
    expect(
      api(makeState({ baseSettings: { temperature: 1 }, removals: ["temperature"] })),
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
