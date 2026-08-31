/**
 * Save-from-chat NEVER persists a payload the kernel CHECKED AND FAILED.
 *
 * KIND PRESERVATION (2026-08-29) keeps the identified kind on a raw envelope,
 * so before the 2026-08-31 kindState-audit gate, `extractRegisteredKindBlocks`
 * declined the raw envelope on its `=== "resolved"` check and then FELL
 * THROUGH to the parse fallback — which re-read the same broken bytes with
 * zero validation and offered them to `saveKindInstance` as a typed instance
 * (the flashcards empty-title class, aimed at content_ir.kind_instance).
 * A raw envelope is now a hard refusal on BOTH routes.
 */

import { extractRegisteredKindBlocks } from "../studio/message-kind-instances";
import { kindRegistry } from "../registry/kind-registry";

beforeEach(() => {
  // No network in jest: membership answers from the compiled tier.
  jest.spyOn(kindRegistry, "ensureWarm").mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("extractRegisteredKindBlocks — the raw kindState gate", () => {
  it("a schema-failing payload of a known kind is refused on both routes", async () => {
    const broken = `{"__kind": "flashcard_set", "title": 123, "cards": "nope"}`;
    const blocks = await extractRegisteredKindBlocks(
      `Here you go:\n\n\`\`\`json\n${broken}\n\`\`\`\n`,
    );
    expect(blocks).toHaveLength(0);
  });

  it("a valid payload of a known kind still extracts", async () => {
    const good = JSON.stringify({
      __kind: "flashcard_set",
      title: "Cells",
      cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
    });
    const blocks = await extractRegisteredKindBlocks(
      `Here you go:\n\n\`\`\`json\n${good}\n\`\`\`\n`,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("flashcard_set");
  });
});
