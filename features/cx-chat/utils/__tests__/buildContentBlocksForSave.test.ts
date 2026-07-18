/**
 * Regression guard: inline-editing a citation-bearing message must NOT drop
 * citations. Provider cited turns store MANY text blocks each with its own
 * `citations` array; the edit path merges them into one text block and must
 * carry every citation onto the merged block (adversarial review 2026-07-17,
 * finding #1 — silent data loss on any inline edit).
 */
import { buildContentBlocksForSave } from "../buildContentBlocksForSave";

const cit = (title: string) => ({
  kind: "document_char",
  provider: "anthropic",
  cited_text: `quote from ${title}`,
  title,
  raw: {},
});

describe("buildContentBlocksForSave — citation preservation", () => {
  it("merges citations from all text blocks onto the single merged block (text-only message)", () => {
    const raw = [
      { type: "text", text: "prose ", citations: [] },
      { type: "text", text: "cited span.", citations: [cit("Doc A")] },
      { type: "text", text: " more prose ", citations: [] },
      { type: "text", text: "second cited span.", citations: [cit("Doc B")] },
    ];
    const result = buildContentBlocksForSave("edited full text", raw);
    expect(result).toHaveLength(1);
    const block = result[0] as { type: string; text: string; citations?: unknown[] };
    expect(block.type).toBe("text");
    expect(block.text).toBe("edited full text");
    expect(block.citations).toHaveLength(2);
    expect(block.citations).toEqual([cit("Doc A"), cit("Doc B")]);
  });

  it("preserves citations when non-text blocks are present", () => {
    const raw = [
      { type: "thinking", thinking: "…" },
      { type: "text", text: "cited.", citations: [cit("Doc A")] },
      { type: "tool_call", name: "search" },
      { type: "text", text: "also cited.", citations: [cit("Doc B")] },
    ];
    const result = buildContentBlocksForSave("edited", raw);
    const textBlocks = result.filter((b) => b.type === "text") as Array<{
      citations?: unknown[];
    }>;
    expect(textBlocks).toHaveLength(1);
    expect(textBlocks[0].citations).toHaveLength(2);
    expect(result.filter((b) => b.type !== "text")).toHaveLength(2);
  });

  it("omits the citations key entirely when no source block had citations", () => {
    const result = buildContentBlocksForSave("edited", [
      { type: "text", text: "plain", citations: [] },
    ]);
    expect(result).toHaveLength(1);
    expect("citations" in (result[0] as object)).toBe(false);
  });
});
