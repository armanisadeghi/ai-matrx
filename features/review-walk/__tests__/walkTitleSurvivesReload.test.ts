/**
 * FX-D2 — walk windows opened from Mandate Candidate pairs:
 *  (a) two "Live" walks from DIFFERENT pairs get different titles (same role,
 *      same live agent — only the pair tells them apart);
 *  (b) a reload keeps the title. The `?panels=review_walk:` hydrator runs
 *      before the local window workspace is read and an open walk is never
 *      overwritten by that later read, so the labels must ride the address.
 * A bare link (no labels) still opens, titled by the agent-name / unit-kind
 * fallback.
 */
import { configureStore } from "@reduxjs/toolkit";

import overlayReducer, { selectOpenInstances } from "@/lib/redux/slices/overlaySlice";
import { initUrlHydration } from "@/features/window-panels/url-sync/initUrlHydration";
import { getHydrator } from "@/features/window-panels/url-sync/UrlPanelRegistry";
import { parseParams, serializeParams } from "@/features/window-panels/url-sync/UrlPanelManager";
import type { AppDispatch } from "@/lib/redux/store";
import * as address from "@/features/review-walk/address";
import { walkTitle } from "@/features/review-walk/walkTitle";

const UNIT_A = "11111111-1111-4111-8111-111111111111";
const UNIT_B = "22222222-2222-4222-8222-222222222222";
const AGENT = "Page Summary Analyst";

function makeStore() {
  return configureStore({
    reducer: { overlays: overlayReducer },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
}

/** What a reload does: read `?panels=` back the way the browser hands it over. */
function reload(panelsValue: string) {
  const qs = new URLSearchParams();
  qs.set("panels", panelsValue);
  const readBack = new URLSearchParams(qs.toString()).get("panels")!;
  const store = makeStore();
  for (const panel of parseParams(readBack)) {
    getHydrator(panel.typeKey)!(store.dispatch as AppDispatch, panel.instanceId, panel.args ?? {});
  }
  return selectOpenInstances(store.getState(), "reviewWalkWindow").map((inst) => {
    const d = inst.data as Record<string, string | null>;
    return walkTitle({
      unitKind: d.unitKind as string,
      agentName: d.agentName,
      roleLabel: d.roleLabel,
      detailLabel: d.detailLabel,
    });
  });
}

describe("FX-D2 — walk titles tell pairs apart and survive a reload", () => {
  beforeAll(() => initUrlHydration());

  it("two Live walks from different pairs get different titles, inside the budget", () => {
    const one = walkTitle({ unitKind: "agent_request", agentName: AGENT, roleLabel: "Live", detailLabel: "Pair 1" });
    const two = walkTitle({ unitKind: "agent_request", agentName: AGENT, roleLabel: "Live", detailLabel: "Pair 2" });
    expect(one).not.toBe(two);
    expect(one).toMatch(/^Live · Pair 1 · Page Summary/);
    for (const t of [one, two]) expect(t.length).toBeLessThanOrEqual(40);
  });

  it("a reloaded address restores both titles", () => {
    const token = (unitId: string, pair: string) =>
      `review_walk:agent_request.${unitId}:r-Live_d-${encodeURIComponent(pair)}_n-${encodeURIComponent(AGENT)}`;
    const titles = reload(`${token(UNIT_A, "Pair 1")},${token(UNIT_B, "Pair 2")}`);
    expect(titles).toEqual([
      walkTitle({ unitKind: "agent_request", agentName: AGENT, roleLabel: "Live", detailLabel: "Pair 1" }),
      walkTitle({ unitKind: "agent_request", agentName: AGENT, roleLabel: "Live", detailLabel: "Pair 2" }),
    ]);
    expect(titles[0]).not.toBe(titles[1]);
    expect(titles[0]).not.toMatch(/Diagnose/);
  });

  it("the window writes labels the address can carry, even with separators in them", () => {
    const tricky = "Ops_bot-v2: a,b · ünï";
    const args = address.reviewWalkUrlArgs({ agentName: tricky, roleLabel: "Live", detailLabel: "Pair 7" });
    const value = serializeParams({
      k: {
        typeKey: "review_walk",
        instanceId: address.reviewWalkUrlId({ unitKind: "assistant_message", unitId: UNIT_A }),
        args,
      },
    } as never);
    expect(reload(value)).toEqual([
      walkTitle({ unitKind: "assistant_message", agentName: tricky, roleLabel: "Live", detailLabel: "Pair 7" }),
    ]);
  });

  it("a bare link still opens, titled by the fallback", () => {
    expect(reload(`review_walk:agent_request.${UNIT_A}`)).toEqual(["Diagnose — agent request"]);
  });
});
