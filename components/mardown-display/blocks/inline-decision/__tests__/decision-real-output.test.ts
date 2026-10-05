/**
 * Real assistant `<decision>` output (live walk 2026-10-04) must become
 * clickable options through EVERY client path: parseDecisionXml, the
 * splitter, and the streaming accumulator. Before the fix all three used
 * `<option label="..">` as the only accepted shape, so an `id` attribute or
 * indentation left the block as raw text.
 */
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { parseDecisionXml } from "../parseDecisionXml";
import { parseDecisionOptionsFromBody } from "../decision-options";
import {
  DECISION_INDENTED_WITH_ID,
  DECISION_LINE_START_WITH_ID,
} from "./real-model-output.fixtures";

const CASES: Array<[string, string, string, string[]]> = [
  [
    "indented, id + label",
    DECISION_INDENTED_WITH_ID,
    "Pick our first launch channel",
    [
      "Email List / Waitlist",
      "Niche Communities & Early Adopter Platforms",
      "Organic Social / Founder-Led Outreach",
    ],
  ],
  [
    "line-start, id + label",
    DECISION_LINE_START_WITH_ID,
    "Pick a pricing model",
    [
      "Subscription (Monthly / Annual)",
      "Freemium with Premium Tiers",
      "One-Time Early-Bird Access",
    ],
  ],
];

function accumulate(stream: string) {
  const upserts: Array<{ block: { type: string; metadata?: Record<string, unknown> | null } }> = [];
  const acc = new StreamBlockAccumulator("req-decision", (payload) => {
    upserts.push(payload as never);
    return { type: "t", payload };
  });
  const dispatch = (a: unknown) => a;
  for (let i = 0; i < stream.length; i += 7) acc.ingest(stream.slice(i, i + 7), dispatch);
  acc.finalize(dispatch);
  return upserts;
}

describe.each(CASES)("decision: %s", (_n, xml, prompt, labels) => {
  it("parseDecisionXml yields every option", () => {
    const d = parseDecisionXml(xml);
    expect(d?.prompt).toBe(prompt);
    expect(d?.options.map((o) => o.label)).toEqual(labels);
    expect(d?.options.every((o) => o.text.length > 20)).toBe(true);
  });

  it("splitter makes a decision block with options", () => {
    const block = splitContentIntoBlocksV2(`Here you go.\n\n${xml}\n`).find(
      (b) => b.type === "decision",
    );
    const dec = (block?.metadata as { decision?: { options: Array<{ label: string }> } })?.decision;
    expect(dec?.options.map((o) => o.label)).toEqual(labels);
  });

  it("accumulator (streamed) makes a complete decision with options", () => {
    const ups = accumulate(`Here you go.\n\n${xml}\n`);
    const done = [...ups].reverse().find((u) => u.block.type === "decision");
    const dec = (done?.block.metadata as { decision?: { options: Array<{ label: string }> } })
      ?.decision;
    expect(dec?.options.map((o) => o.label)).toEqual(labels);
  });
});

describe("parseDecisionOptionsFromBody tolerance", () => {
  it("accepts attribute order, single quotes, and self-describing options", () => {
    const opts = parseDecisionOptionsFromBody(
      `<option label='A' id="a">first</option>\n\n<option id="b">Plain label only</option>`,
    );
    expect(opts).toEqual([
      { label: "A", text: "first" },
      { label: "Plain label only", text: "Plain label only" },
    ]);
  });
  it("ignores an option whose closing tag has not streamed in", () => {
    expect(parseDecisionOptionsFromBody(`<option label="A">half`)).toEqual([]);
  });
});
