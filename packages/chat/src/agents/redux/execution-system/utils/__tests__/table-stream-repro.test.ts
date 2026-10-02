/**
 * Repro: stream a message with multiple large markdown tables through
 * StreamBlockAccumulator at many chunk sizes and assert every table
 * commits as a `table` block (never `code`/`text`).
 */
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

function makeTable(startCol: number): string {
  const cols = Array.from({ length: 18 }, (_, i) => startCol + i);
  const header = `| FEC Rank | ${cols.join(" | ")} |`;
  const sep = `|---|${cols.map(() => "---").join("|")}|`;
  const rows = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"].map(
    (name, r) => `| ${name} | ${cols.map((c) => c + r + 2).join(" | ")} |`,
  );
  return [header, sep, ...rows].join("\n");
}

const CONTENT = [
  'Locate the impairment standard in the top row (bolded numbers), and read down to the entry corresponding to the applicable future earning capacity rank."',
  "",
  "**AMA Whole Person Impairment Standard: 1–20**",
  "",
  makeTable(1),
  "",
  "**AMA Whole Person Impairment Standard: 21–40**",
  "",
  makeTable(21),
  "",
  "**AMA Whole Person Impairment Standard: 41–60**",
  "",
  makeTable(41),
  "",
  "Done.",
].join("\n");

function runStream(chunkSize: number): Map<string, RenderBlockPayload> {
  const blocks = new Map<string, RenderBlockPayload>();
  const upsert = (payload: { requestId: string; block: RenderBlockPayload }) => ({
    type: "test/upsert",
    payload,
  });
  const dispatch = (action: unknown) => {
    const a = action as { type: string; payload?: { block: RenderBlockPayload } };
    if (a?.payload?.block) blocks.set(a.payload.block.blockId, a.payload.block);
    return action;
  };
  const acc = new StreamBlockAccumulator("req-test", upsert as never);
  for (let i = 0; i < CONTENT.length; i += chunkSize) {
    acc.ingest(CONTENT.slice(i, i + chunkSize), dispatch);
  }
  acc.finalize(dispatch);
  return blocks;
}

describe("table streaming consistency", () => {
  const sizes = [1, 3, 7, 16, 50, 128, 512, 4096, CONTENT.length];
  for (const size of sizes) {
    it(`chunk size ${size}: all 3 tables end up as table blocks`, () => {
      const blocks = runStream(size);
      const finals = [...blocks.values()].filter(
        (b) => b.content && b.content.includes("FEC Rank"),
      );
      const types = finals.map((b) => `${b.blockId}:${b.type}`);
      const tableBlocks = finals.filter((b) => b.type === "table");
      expect({ size, types, tableCount: tableBlocks.length }).toEqual({
        size,
        types,
        tableCount: 3,
      });
      for (const b of finals) {
        expect(b.type).toBe("table");
      }
    });
  }
});
