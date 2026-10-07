/**
 * COPY CENSUS — a structured answer copies what is on screen (2026-10-07 final
 * pass: /chat/880b70e1-… drew prose plus Space / Table chips, and every copy
 * flavour gave `{"summary": …}`). Every registry row in the "copy" category —
 * the split's one click, Copy markdown, Copy plain text, and any row added
 * later — must hand the clipboard the rendered text, never the payload.
 */
jest.mock("@ai-matrx/rich-content/copy/copy-commands", () => ({
  copyRichContent: jest.fn(async () => true),
  copyContent: jest.fn(async () => true),
}));

import "../handlers";
import { copyRichContent } from "@ai-matrx/rich-content/copy/copy-commands";
import { getAction, getAllActions } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { chatContext } from "../../test-utils/chatContext";
import { structuredAnswerMarkdown } from "@/components/mardown-display/blocks/json/structured-answer-text";

// The persisted answer of that conversation, verbatim shape.
const ANSWER = {
  summary:
    "I built a new Houseplant Care Log page backed by a live table with plant name, location, watering frequency, last watered date, and health.",
  space_ids: ["8b8b0b02-390b-4e88-8242-86058c49748a"],
  table_ids: ["48b591ee-7496-47e5-b807-372e32a3520e"],
  root_space_id: "8b8b0b02-390b-4e88-8242-86058c49748a",
};
const PAYLOAD = JSON.stringify(ANSWER);

const copied = () => (copyRichContent as jest.Mock).mock.calls.map(([text]) => String(text));

describe("a structured answer copies its rendered text in every flavour", () => {
  beforeEach(() => (copyRichContent as jest.Mock).mockClear());

  const COPY_ROWS = ["copy", "copy-markdown", "copy-plain-text"];

  it.each(COPY_ROWS)("%s copies the prose and the chips, never the JSON", async (id) => {
    const action = getAction(id);
    expect(action).toBeDefined();
    await action!.run({ ...chatContext("assistant"), content: PAYLOAD } as never);
    const [text] = copied();
    expect(text).toContain("I built a new Houseplant Care Log page");
    expect(text).toContain("**Space IDs**");
    expect(text).toContain("- 48b591ee-7496-47e5-b807-372e32a3520e");
    expect(text).not.toMatch(/"summary"\s*:/);
    expect(text).not.toContain("{");
  });

  /** Copy rows that copy a different document on purpose — id → why. */
  const OTHER_SOURCE: Record<string, string> = {
    "copy-with-thinking": "the stored record WITH its reasoning, by design",
    "conversation-copy-for-ai": "the whole conversation, not this answer",
    "conversation-copy-formatted": "the whole conversation, not this answer",
    "conversation-copy-markdown": "the whole conversation, not this answer",
    "conversation-copy-plain": "the whole conversation, not this answer",
    "copy-html-source": "HTML of contentForDestination — the same projection, as markup",
    "copy-table-csv": "only the answer's first markdown table, as CSV",
    "copy-table-tsv": "only the answer's first markdown table, as TSV",
  };

  it("every copy-category row is covered or names why it copies another document", () => {
    const rows = getAllActions()
      .filter((a) => a.category === "copy")
      .map((a) => a.id)
      .sort();
    expect(rows.filter((id) => !COPY_ROWS.includes(id) && !OTHER_SOURCE[id])).toEqual([]);
  });

  it("the projection draws what the block draws: prose, then each list under its label", () => {
    expect(structuredAnswerMarkdown(ANSWER)).toBe(
      [
        ANSWER.summary,
        "**Space IDs**\n\n- 8b8b0b02-390b-4e88-8242-86058c49748a",
        "**Table IDs**\n\n- 48b591ee-7496-47e5-b807-372e32a3520e",
      ].join("\n\n"),
    );
  });
});
