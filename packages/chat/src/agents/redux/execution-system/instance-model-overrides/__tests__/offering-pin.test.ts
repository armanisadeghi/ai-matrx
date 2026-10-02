/**
 * The class (offering) a person picks must reach the wire as
 * `config_overrides.offering_id`, beside `model` — or the server runs the
 * preferred class and the choice is silently lost.
 */

import type { ChatRootState } from "../../../../../store/root-state";
import reducer, {
  initInstanceOverrides,
  setOverrides,
} from "../instance-model-overrides.slice";
import { selectSettingsOverridesForApi } from "../instance-model-overrides.selectors";
import {
  effectiveOfferingPin,
  resetModelChoice,
  setOfferingPin,
} from "../offering-pin";

const FAST = "2245f5ca-2dd2-4fed-b34f-7f30aa2c1c6d";
const LIGHTNING = "29874e67-5683-40c2-9adb-fb797ea9a176";

function harness(baseSettings: Record<string, unknown>) {
  let slice = reducer(
    undefined,
    initInstanceOverrides({ conversationId: "c1", baseSettings }),
  );
  const getState = () =>
    ({ instanceModelOverrides: slice }) as unknown as ChatRootState;
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") return action(dispatch, getState);
    slice = reducer(slice, action as Parameters<typeof reducer>[1]);
    return action;
  };
  const run = (thunk: unknown) =>
    (thunk as (d: typeof dispatch, g: typeof getState) => void)(
      dispatch,
      getState,
    );
  const wire = () => selectSettingsOverridesForApi("c1")(getState());
  const entry = () => slice.byConversationId.c1;
  return { dispatch, run, wire, entry };
}

describe("offering pin", () => {
  it("a picked class reaches config_overrides beside the model", () => {
    const h = harness({ model: "agent-model" });
    h.run(setOfferingPin({ conversationId: "c1", offeringId: LIGHTNING }));
    h.dispatch(setOverrides({ conversationId: "c1", changes: { model: "qwen" } }));
    expect(h.wire()).toEqual({ model: "qwen", offering_id: LIGHTNING });
    expect(effectiveOfferingPin(h.entry())).toBe(LIGHTNING);
  });

  it("undefined deletes the key when the agent has no pin (never null/'')", () => {
    const h = harness({ model: "agent-model" });
    h.run(setOfferingPin({ conversationId: "c1", offeringId: FAST }));
    h.run(setOfferingPin({ conversationId: "c1", offeringId: undefined }));
    expect("offering_id" in h.entry().overrides).toBe(false);
    expect(h.entry().removals).not.toContain("offering_id");
    expect(h.wire()).toBeUndefined();
  });

  it("the agent's own class is not an override", () => {
    const h = harness({ model: "qwen", offering_id: FAST });
    h.run(setOfferingPin({ conversationId: "c1", offeringId: LIGHTNING }));
    expect(h.wire()).toEqual({ offering_id: LIGHTNING });
    h.run(setOfferingPin({ conversationId: "c1", offeringId: FAST }));
    expect(h.wire()).toBeUndefined();
    expect(effectiveOfferingPin(h.entry())).toBe(FAST);
  });

  it("unpinning an agent's class is an explicit removal, not a stored value", () => {
    const h = harness({ model: "qwen", offering_id: FAST });
    h.run(setOfferingPin({ conversationId: "c1", offeringId: undefined }));
    expect("offering_id" in h.entry().overrides).toBe(false);
    expect(h.entry().removals).toContain("offering_id");
    expect(effectiveOfferingPin(h.entry())).toBeUndefined();
  });

  it("resetting the model choice clears the class too", () => {
    const h = harness({ model: "agent-model" });
    h.run(setOfferingPin({ conversationId: "c1", offeringId: LIGHTNING }));
    h.dispatch(setOverrides({ conversationId: "c1", changes: { model: "qwen" } }));
    h.run(resetModelChoice("c1"));
    expect(h.wire()).toBeUndefined();
  });

  it("a seeded class is recorded as a launch default", () => {
    const h = harness({ model: "agent-model" });
    h.run(
      setOfferingPin({ conversationId: "c1", offeringId: LIGHTNING, seeded: true }),
    );
    expect(h.entry().seededKeys).toContain("offering_id");
    expect(h.wire()).toEqual({ offering_id: LIGHTNING });
  });
});
