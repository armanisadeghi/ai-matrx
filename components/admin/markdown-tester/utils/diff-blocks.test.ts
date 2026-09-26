/**
 * The drift report ignores blank lines at block edges (chair ruling 2026-09-26):
 * CommonMark/GFM render the same page whether the blank line between two blocks
 * sits at the end of one or the start of the next. Measured case: the studio's
 * 100 KB report fixture drifted 11 of 103 rows on that alone (V2 and the server
 * keep a blank line the stream accumulator drops, plus an empty trailing block).
 */
import { diffBlocks } from "./diff-blocks";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

const rb = (blockIndex: number, type: string, content: string) =>
  ({ blockId: `b${blockIndex}`, blockIndex, type, status: "complete", content }) as unknown as RenderBlockPayload;

it("blank lines at block edges and empty blocks are not drift, and are counted", () => {
  const v2 = [
    { type: "code", content: "x = 1" },
    { type: "text", content: "\n\n## Section 5\n\nBody." },
  ] as never;
  const redux = [rb(0, "code", "x = 1"), rb(1, "text", "\n## Section 5\n\nBody."), rb(2, "text", "")];
  const server = [rb(0, "code", "x = 1"), rb(1, "text", "\n\n## Section 5\n\nBody.")];
  const report = diffBlocks({ v2, redux, server });
  expect(report.driftCount).toBe(0);
  expect(report.edgeWhitespaceRows).toBe(1);
  expect(report.v2VsRedux).toBe(1);
});

it("a real content difference is still drift", () => {
  const v2 = [{ type: "text", content: "\n## Section 5\n\nBody." }] as never;
  const report = diffBlocks({ v2, redux: [rb(0, "text", "\n## Section 5\n\nBody!")], server: [rb(0, "text", "\n## Section 5\n\nBody.")] });
  expect(report.driftCount).toBe(1);
  expect(report.rows[0]?.redux.firstDiffAt).toBe("\n## Section 5\n\nBody".length);
});
