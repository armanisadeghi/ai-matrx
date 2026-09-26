/**
 * Syntheses are numbered by `capture_version` (migration 1299, per
 * topic/scope/keyword-or-tag); `version` is the platform's row-edit counter.
 * Every synthesis read orders by the capture number and every display names it.
 */
type Call = { method: string; args: unknown[] };
const calls: Call[] = [];
function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.${m}`, args });
      return builder;
    });
  }
  builder.then = (resolve: (r: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return builder;
}
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn(() => ({ from: jest.fn((t: string) => makeBuilder(t)) })),
    rpc: jest.fn(),
  },
}));
jest.mock("@/lib/python-client", () => ({ getJson: jest.fn(), postJson: jest.fn(), patchJson: jest.fn() }));

import { getSynthesis, getSynthesisVersions } from "../service";
import { synthesesListSummary, synthesisBrief, synthesisSummary } from "../copy";
import type { ResearchSynthesis } from "../types";

beforeEach(() => {
  calls.length = 0;
});

it.each([
  ["getSynthesis", () => getSynthesis("t1", { scope: "keyword", keyword_id: "k1" })],
  ["getSynthesisVersions", () => getSynthesisVersions("t1", { scope: "keyword", keyword_id: "k1" })],
])("%s orders by capture_version first", async (_n, read) => {
  await read();
  const orders = calls.filter((c) => c.method === "rs_synthesis.order");
  expect(orders[0]?.args[0]).toBe("capture_version");
});

const synth = {
  id: "y1",
  topic_id: "t1",
  scope: "keyword",
  status: "success",
  agent_type: "keyword_synthesis",
  model_id: "m",
  capture_version: 3,
  version: 9,
  is_current: true,
  keyword_id: "k1",
  tag_id: null,
  created_at: "2026-09-26",
  error: null,
  result: "text",
} as unknown as ResearchSynthesis;

it("names the capture number, never the row-edit counter", () => {
  expect(synthesisSummary(synth)).toContain("Version: 3");
  expect(synthesisSummary(synth)).not.toContain("Version: 9");
  expect(synthesisBrief(synth).version).toBe(3);
  expect(synthesesListSummary([synth])).toContain("keyword v3");
});
