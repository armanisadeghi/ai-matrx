/**
 * R2 — THE COSTLIEST REQUESTS AT A GLANCE (lane DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL R2). A built-in view's
 * `attributes` become text columns: the explorer asks the same door once per attribute, grouped by the
 * outer Dimension and the attribute, narrowed to the groups shown, and reads each value as the door's label
 * or the host's name resolver; a group holding two values says "Several". Red on HEAD: no useDrillAttributes.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { MatrxDrillAttribute, MatrxDrillDimension } from "@ai-matrx/design-system/data-table";
import { drillRequestKey } from "@ai-matrx/design-system/data-table";

import { useDrillAttributes } from "../useDrillAttributes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const R1 = "1f0c2b8e-55aa-4d2e-9b1e-0c7a3e9d1f41";
const R2 = "1f0c2b8e-55aa-4d2e-9b1e-0c7a3e9d1f42";
const P1 = "87a6e699-3622-4869-8843-d0867456c0dd";
const asked: Array<Record<string, unknown>> = [];
const client = {
  drillAsk: async ({ question }: { question: { by: string[]; where: Record<string, unknown> } }) => {
    asked.push(question);
    // ONE ask for every glance column (lane DRILL-LIVE-FIX-2 #3): grouped by request, person and model
    const rows = [
      { kind: "group", groups: { request: R1, person: P1, model: "claude-sonnet-4-5" } },
      { kind: "group", groups: { request: R2, person: P1, model: "claude-sonnet-4-5" } },
      { kind: "group", groups: { request: R2, person: P1, model: "gpt-5" } },
    ];
    return { ok: true, data: { rows, says: [], total: null, as_of: null } };
  },
};
const dims: MatrxDrillDimension[] = [
  { key: "request", label: "Request", kind: "relation" },
  { key: "person", label: "Person", kind: "relation", description: "Who asked" },
  { key: "model", label: "Request's top model", kind: "text" },
];

let got: MatrxDrillAttribute[] | undefined;
function Probe() {
  got = useDrillAttributes({
    client: client as never,
    source: { kind: "entity", token: "ai_usage_executions" },
    lane: "platform",
    question: { by: ["request"], show: ["cost"], where: [], window: "30d" },
    dimensions: dims,
    answers: { [drillRequestKey(["request"])]: [{ groups: { request: R1 }, measures: { cost: 2 }, row_count: 1 }, { groups: { request: R2 }, measures: { cost: 1 }, row_count: 1 }] },
    attributes: ["person", "model"],
    carried: null,
    resolvers: { person: { resolve: async (ids: string[]) => ({ ok: true as const, names: Object.fromEntries(ids.map((id) => [id, "admin@admin.com"])) }) } },
  });
  return null;
}

it("reads each request's person and model through the same door, narrowed to the requests shown", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => new Promise((r) => setTimeout(r, 20)));
  expect(asked.map((q) => q.by)).toEqual([["request", "person", "model"]]);
  expect((asked[0]!.where as Record<string, unknown>).request).toEqual([R1, R2]);
  const person = got!.find((a) => a.key === "person")!;
  const model = got!.find((a) => a.key === "model")!;
  expect(person.description).toBe("Who asked");
  expect(person.read({ request: R1 })).toBe("admin@admin.com");
  expect(model.read({ request: R1 })).toBe("claude-sonnet-4-5");
  expect(model.read({ request: R2 })).toBe("Several");
  act(() => root.unmount());
});
