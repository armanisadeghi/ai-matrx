/**
 * The review walk's address: registry row + `?panels=review_walk:` hydrator +
 * the one open primitive, exercised against a REAL overlay reducer (not a
 * dispatch spy), so what is asserted is the store state a window renders from.
 */
import {
  configureStore,
  type Middleware,
  type UnknownAction,
} from "@reduxjs/toolkit";

import overlayReducer, {
  selectOpenInstances,
} from "@/lib/redux/slices/overlaySlice";
import { OVERLAY_CATALOGUE } from "@/features/overlays/catalogue";
import { getStaticEntryByOverlayId } from "@/features/window-panels/registry/windowRegistryMetadata";
import { initUrlHydration } from "@/features/window-panels/url-sync/initUrlHydration";
import { getHydrator } from "@/features/window-panels/url-sync/UrlPanelRegistry";
import { parseParams } from "@/features/window-panels/url-sync/UrlPanelManager";
import type { AppDispatch } from "@/lib/redux/store";

import {
  REVIEW_WALK_URL_KEY,
  WALK_UNIT_KINDS,
  parseReviewWalkUrlId,
  reviewWalkInstanceId,
  reviewWalkUrlId,
} from "../address";
import { openReviewWalk } from "../openReviewWalk";

const UNIT_ID = "3f9a1c2e-7b4d-4e8a-9c1f-0a2b3c4d5e6f";

function makeStore() {
  const seen: UnknownAction[] = [];
  const record: Middleware = () => (next) => (action) => {
    seen.push(action as UnknownAction);
    return next(action);
  };
  const store = configureStore({
    reducer: { overlays: overlayReducer },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(record),
  });
  return { store, seen };
}

describe("review walk address", () => {
  beforeAll(() => initUrlHydration());

  it("round-trips every unit kind through the ?panels= token grammar", () => {
    for (const unitKind of WALK_UNIT_KINDS) {
      const token = `${REVIEW_WALK_URL_KEY}:${reviewWalkUrlId({ unitKind, unitId: UNIT_ID })}`;
      const [parsed] = parseParams(token);
      expect(parsed.typeKey).toBe("review_walk");
      expect(parseReviewWalkUrlId(parsed.instanceId)).toEqual({ unitKind, unitId: UNIT_ID });
    }
    expect(WALK_UNIT_KINDS).toEqual(
      expect.arrayContaining(["assistant_message", "agent_request", "wf_node_outcome"]),
    );
  });

  it("refuses half an identity", () => {
    for (const bad of ["", "default", "reviewWalkWindow", "assistant_message.", `.${UNIT_ID}`, `bogus.${UNIT_ID}`]) {
      expect(parseReviewWalkUrlId(bad)).toBeNull();
    }
  });

  it("declares a registry row: multi, addressed, preserved on its identity", () => {
    expect(OVERLAY_CATALOGUE.reviewWalkWindow.instanceMode).toBe("multi");
    const row = getStaticEntryByOverlayId("reviewWalkWindow");
    expect(row).toMatchObject({
      kind: "window",
      instanceMode: "multi",
      urlSync: { key: REVIEW_WALK_URL_KEY },
      mobilePresentation: "fullscreen",
      preservation: { requiredDataKeys: ["unitKind", "unitId"] },
    });
    expect(row?.ephemeral).toBeFalsy();
    expect(row?.preservation?.dataKeys).toEqual(
      expect.arrayContaining(["unitKind", "unitId", "agentId", "agentName"]),
    );
  });

  it("opens the walk from a link under the opener's deterministic instance id", () => {
    const { store } = makeStore();
    const hydrator = getHydrator(REVIEW_WALK_URL_KEY);
    expect(hydrator).toBeDefined();
    hydrator!(store.dispatch as AppDispatch, `wf_node_outcome.${UNIT_ID}`, {});
    const open = selectOpenInstances(store.getState(), "reviewWalkWindow");
    expect(open).toEqual([
      {
        instanceId: reviewWalkInstanceId({ unitKind: "wf_node_outcome", unitId: UNIT_ID }),
        data: expect.objectContaining({ unitKind: "wf_node_outcome", unitId: UNIT_ID }),
      },
    ]);
  });

  it("a link for a bad token opens nothing and says why", () => {
    const { store } = makeStore();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      getHydrator(REVIEW_WALK_URL_KEY)!(store.dispatch as AppDispatch, "reviewWalkWindow", {});
      expect(selectOpenInstances(store.getState(), "reviewWalkWindow")).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("names no walkable unit"));
    } finally {
      warn.mockRestore();
    }
  });

  it("opening the same unit twice focuses the existing window and keeps its data", () => {
    const { store, seen } = makeStore();
    const ref = { unitKind: "assistant_message" as const, unitId: UNIT_ID };
    (store.dispatch as AppDispatch)(
      openReviewWalk({ ...ref, agentId: "agent-1", agentName: "Ada" }),
    );
    // A later link / reload for the same unit must not wipe the agent fields.
    getHydrator(REVIEW_WALK_URL_KEY)!(store.dispatch as AppDispatch, reviewWalkUrlId(ref), {});
    const open = selectOpenInstances(store.getState(), "reviewWalkWindow");
    expect(open).toHaveLength(1);
    expect(open[0].data).toMatchObject({ agentId: "agent-1", agentName: "Ada" });
    const id = reviewWalkInstanceId(ref);
    expect(seen.map((a) => a.type)).toEqual(
      expect.arrayContaining(["windowManager/restoreWindow", "windowManager/focusWindow"]),
    );
    expect(seen.filter((a) => a.type === "windowManager/focusWindow").map((a) => (a as { payload?: unknown }).payload)).toEqual([id]);
  });
});
