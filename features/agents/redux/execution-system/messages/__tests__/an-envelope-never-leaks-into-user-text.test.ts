/**
 * An envelope never leaks into visible user text.
 *
 * Live incident 2026-10-01 (PB-01 run 2, S14; conversation
 * d5fceb51-9486-485a-bb8a-975ee345ee98): a context value attached to a turn
 * is persisted as its OWN text part — a ```matrx reference fence. On reload,
 * `extractFlatText` glued consecutive text parts with no separator (the
 * citation-segment contract), so the fence opener landed mid-line:
 * `"…routing-line format.```matrx\n{…}\n```"`. A fence opener that is not at
 * the start of a line is not a fence, and the bubble printed a literal
 * "```matrx" after the person's words.
 *
 * The fixture below is that row's `content`, byte-for-byte in shape. The
 * assertions run the same path the bubble uses: flat text → the one content
 * splitter the markdown pipeline renders from.
 */

import { extractFlatText } from "../messages.selectors";
import type { MessageRecord } from "../messages.slice";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

const FENCE =
  '```matrx\n{"__kind":"directive_v1_reference_context_value","items":[{"scope_id":"3df7a3a6-4d1c-4e17-9fc2-27eb9855dcd0","context_item_id":"94d8e596-e15c-4b4e-bc5d-22bb57ef5f2b","label":"Port of Oakland lane · Gate code"}]}\n```';

const TYPED =
  "Fill in the routing line on this note for move 4471. Use the lane planner for the hub and follow our routing-line format.";

function persistedUserRow(): MessageRecord {
  return {
    role: "user",
    content: [
      { id: "", text: TYPED, type: "text", metadata: {}, citations: [] },
      { id: "", text: FENCE, type: "text", metadata: {}, citations: [] },
      { type: "input_notes", note_ids: ["2d8d232d-c54b-4cb1-89f9-32dc22a99164"] },
    ],
  } as unknown as MessageRecord;
}

describe("an envelope never leaks into visible user text", () => {
  it("puts a fence part on its own line, so the opener is a real fence", () => {
    const flat = extractFlatText(persistedUserRow());
    expect(flat).not.toContain("format.```");
    expect(flat.startsWith(`${TYPED}\n\`\`\`matrx`)).toBe(true);
  });

  it("no rendered text block carries the fence's raw markers", () => {
    const blocks = splitContentIntoBlocksV2(
      extractFlatText(persistedUserRow()),
    );
    const visibleText = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.content)
      .join("\n");
    expect(visibleText).toContain(TYPED);
    expect(visibleText).not.toContain("```");
    expect(visibleText).not.toContain("__kind");
  });

  it("keeps the citation contract: plain segments still join directly", () => {
    const rec = {
      content: [
        { type: "text", text: "Factors were established" },
        { type: "text", text: ", and done." },
      ],
    } as unknown as MessageRecord;
    expect(extractFlatText(rec)).toBe("Factors were established, and done.");
  });

  it("a part that follows a closing fence starts on its own line", () => {
    const rec = {
      content: [
        { type: "text", text: FENCE },
        { type: "text", text: "Then the rest." },
      ],
    } as unknown as MessageRecord;
    expect(extractFlatText(rec)).toBe(`${FENCE}\nThen the rest.`);
  });
});
