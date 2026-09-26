/**
 * Chat draws a GFM table written WITHOUT edge pipes, like Studio and every
 * other preset (verify-RC-B4 R5-3). Before: the chat block splitter (V2) and
 * the live stream accumulator only opened a table on a line starting with `|`,
 * so `Step | Task | Who` over `--- | --- | ---` showed as plain text — and the
 * chat table editor could never reach it.
 *
 * Both paths share one rule (gfm-table-lines.ts): header with an unescaped pipe
 * + a delimiter row of the same width; rows run to a blank line or another block.
 *
 * Use case: a warehouse shift handover an assistant writes as a table.
 */
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

const INTRO = "Here is tonight's handover for the Harbor warehouse.";
const OUTRO = "Omar signs off once bay B3 is re-scanned.";
const THREE = "Step | Task | Who\n--- | --- | ---\n1 | Drain the print queue | Tom\n2 | Swap the label printer | Ines";
const TWO = "Bay | Status\n:--- | ---:\nB3 | re-scan\nB4 | clear";
const ESCAPED = "Rule | Pattern\n--- | ---\nalerts | `err\\|warn`";

function split(text: string) {
  return splitContentIntoBlocksV2(text).filter((b) => b.content.trim());
}

function streamed(source: string, chunk: number) {
  const latest = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator("pipeless", (payload) => {
    latest.set(payload.block.blockId, payload.block);
    return payload;
  });
  const dispatch = (action: unknown) => action;
  for (let i = 0; i < source.length; i += chunk) accumulator.ingest(source.slice(i, i + chunk), dispatch);
  accumulator.finalize(dispatch);
  return [...latest.values()]
    .sort((a, b) => a.blockIndex - b.blockIndex)
    .filter((b) => (b.content ?? "").trim());
}

const shapes = (blocks: Array<{ type: string; content?: string | null }>) =>
  blocks.map((b) => [b.type, (b.content ?? "").trim()]);

describe.each([
  ["three columns", THREE],
  ["two columns, aligned", TWO],
  ["escaped pipe in a cell", ESCAPED],
])("a pipe-less table (%s)", (_label, table) => {
  const text = `${INTRO}\n\n${table}\n\n${OUTRO}`;
  const expected = [
    ["text", INTRO],
    ["table", table],
    ["text", OUTRO],
  ];

  it("is a table block in the chat splitter", () => {
    expect(shapes(split(text))).toEqual(expected);
  });

  it.each([1, 3, 7, 64, 4096])("is a table block in the live stream (chunk %i)", (chunk) => {
    expect(shapes(streamed(text, chunk))).toEqual(expected);
  });

  it("right after a prose line (no blank line between) still opens at the header", () => {
    const tight = `${INTRO}\n${table}\n\n${OUTRO}`;
    expect(shapes(split(tight))).toEqual(expected);
    expect(shapes(streamed(tight, 5))).toEqual(expected);
  });
});

describe("what is NOT a pipe-less table", () => {
  it.each([
    ["a prose line with a pipe and no delimiter row", `${INTRO}\nUse a | b for either.\n\n${OUTRO}`],
    ["a header wider than its delimiter row", `${INTRO}\n\nBay | Status | Crew\n--- | ---\nB3 | re-scan | Omar\n\n${OUTRO}`],
    ["a list item with a pipe over a rule", `${INTRO}\n\n- keep a | b\n--- | ---\n\n${OUTRO}`],
  ])("%s", (_label, text) => {
    expect(split(text).some((b) => b.type === "table")).toBe(false);
  });
});
