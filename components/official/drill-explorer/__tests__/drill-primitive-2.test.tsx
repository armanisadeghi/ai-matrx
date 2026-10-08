/**
 * DRILL PRIMITIVE 2 (lane DRILL-PRIMITIVE-2) — the explorer's half. A failed attribute read is said
 * as state (the attribute carries `error`), never an empty "—"; a timed-out ask says so in words and
 * the database's own text never reaches the screen. Red on HEAD: the attribute had no error and the
 * failure words did not exist.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { MatrxDrillAttribute, MatrxDrillDimension } from "@ai-matrx/design-system/data-table";
import { drillRequestKey } from "@ai-matrx/design-system/data-table";

import { drillFailureWords } from "../explorerWords";
import { useDrillAttributes } from "../useDrillAttributes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const C1 = "0b6f3c1e-2a4d-4e8b-9f10-3c5a7d9e1b21";
const client = {
  drillAsk: async () => ({ ok: false, error: { message: "canceling statement due to statement timeout" } }),
};
const dims: MatrxDrillDimension[] = [
  { key: "conversation", label: "Conversation", kind: "relation" },
  { key: "agent", label: "Agent", kind: "relation" },
];

let got: MatrxDrillAttribute[] | undefined;
function Probe() {
  got = useDrillAttributes({
    client: client as never,
    source: { kind: "entity", token: "ai_usage_executions" },
    lane: "platform",
    question: { by: ["conversation"], show: ["cost"], where: [], window: "30d" },
    dimensions: dims,
    answers: { [drillRequestKey(["conversation"])]: [{ groups: { conversation: C1 }, measures: { cost: 2 }, row_count: 1 }] },
    attributes: ["agent"],
    carried: null,
    resolvers: undefined,
  });
  return null;
}

it("a timed-out attribute read is said as a failure, in words", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => new Promise((r) => setTimeout(r, 20)));
  const agent = got!.find((a) => a.key === "agent")!;
  expect(agent.error).toBe("Took too long to count. Narrow the window.");
  act(() => root.unmount());
});

it("database text never reaches the screen", () => {
  expect(drillFailureWords('relation "runtime._ai_usage_calls" does not exist', "The chart could not be counted.")).toBe("The chart could not be counted.");
  expect(drillFailureWords("ERROR: 57014", "x")).toBe("Took too long to count. Narrow the window.");
});
