/**
 * The chat launcher re-creates a conversation under the SAME id. An effort or
 * model the person picked before the first send must survive that re-create
 * and still reach the wire — and "auto" effort must never reach it at all.
 */

import type { ChatRootState } from "../../../../../store/root-state";
import reducer, {
  initInstanceOverrides,
  markRemoved,
  setOverrides,
} from "../instance-model-overrides.slice";
import { selectSettingsOverridesForApi } from "../instance-model-overrides.selectors";
import { createInstanceFull } from "../../create-instance-full";

const BASE = { model: "agent-model", reasoning_effort: "low", temperature: 1 };

function recreate(slice: ReturnType<typeof reducer>, baseSettings = BASE) {
  return reducer(
    slice,
    createInstanceFull({
      conversationId: "c1",
      agentId: "a1",
      agentType: "user",
      origin: "manual",
      overrides: { baseSettings },
    } as Parameters<typeof createInstanceFull>[0]),
  );
}

const wire = (slice: ReturnType<typeof reducer>) =>
  selectSettingsOverridesForApi("c1")({
    instanceModelOverrides: slice,
  } as unknown as ChatRootState);

describe("same-id createInstanceFull keeps the person's picks", () => {
  it("effort + model picked before the first send survive the re-create", () => {
    let slice = recreate(reducer(undefined, { type: "@@init" }));
    slice = reducer(
      slice,
      setOverrides({
        conversationId: "c1",
        changes: { reasoning_effort: "high", model: "other-model" },
      }),
    );
    slice = reducer(slice, markRemoved({ conversationId: "c1", key: "temperature" }));

    slice = recreate(slice);

    expect(slice.byConversationId.c1.overrides).toEqual({
      reasoning_effort: "high",
      model: "other-model",
    });
    expect(slice.byConversationId.c1.removals).toEqual(["temperature"]);
    expect(wire(slice)).toEqual({
      reasoning_effort: "high",
      model: "other-model",
      temperature: null,
    });
  });

  it("the re-create still takes the new baseSettings", () => {
    let slice = reducer(
      undefined,
      initInstanceOverrides({ conversationId: "c1", baseSettings: { model: "x" } }),
    );
    slice = recreate(slice);
    expect(slice.byConversationId.c1.baseSettings).toEqual(BASE);
  });

  it("a fresh id starts with no overrides", () => {
    const slice = recreate(reducer(undefined, { type: "@@init" }));
    expect(slice.byConversationId.c1.overrides).toEqual({});
    expect(wire(slice)).toBeUndefined();
  });

  it("auto effort is never sent, any other value is sent exactly", () => {
    let slice = recreate(reducer(undefined, { type: "@@init" }));
    slice = reducer(
      slice,
      setOverrides({ conversationId: "c1", changes: { reasoning_effort: "auto" } }),
    );
    expect(wire(slice)).toBeUndefined();
    slice = reducer(
      slice,
      setOverrides({ conversationId: "c1", changes: { reasoning_effort: "none" } }),
    );
    expect(wire(slice)).toEqual({ reasoning_effort: "none" });
  });
});
