/**
 * REGRESSION GUARD: extractFlatText over multi-text-block messages.
 *
 * Provider contract (Anthropic citations, OpenAI output items): consecutive
 * `text` blocks in one message are SEGMENTS of one continuous string. A
 * citation-bearing response arrives split MID-SENTENCE (`"…ratios"`, `", and "`,
 * `"AMA whole person…"`). Joining segments with "\n" broke words and
 * punctuation onto their own lines (live incident 2026-07-16, conversation
 * 883f68c6-55b2-485d-9ae6-124716a495a6). Text segments must concatenate
 * directly; only non-text blocks keep the newline separator.
 */

import { extractFlatText } from "../messages.selectors";
import type { MessageRecord } from "../messages.slice";

function record(content: unknown[]): MessageRecord {
  return { content } as unknown as MessageRecord;
}

describe("extractFlatText", () => {
  it("concatenates consecutive text blocks directly (citation-split segments)", () => {
    const rec = record([
      { type: "text", text: "Factors were established", citations: [] },
      { type: "text", text: ", and ", citations: [] },
      { type: "text", text: "ratings receive a higher FEC adjustment", citations: [] },
      { type: "text", text: ".", citations: [] },
    ]);
    expect(extractFlatText(rec)).toBe(
      "Factors were established, and ratings receive a higher FEC adjustment.",
    );
  });

  it("still excludes thinking blocks and keeps single-block behavior", () => {
    const rec = record([
      { type: "thinking", text: "internal reasoning" },
      { type: "text", text: "The answer." },
    ]);
    expect(extractFlatText(rec)).toBe("The answer.");
  });
});
