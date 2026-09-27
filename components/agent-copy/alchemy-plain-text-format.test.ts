/**
 * "PLAIN TEXT" IS REAL TEXT (ALC-15 round 5, A).
 *
 * THE USE CASE: in Copy conversation for AI she picks Plain text to paste the
 * conversation into a plain-text box. She gets each speaker and each message in
 * order as words — never the Markdown ("## You") and never JSON — and a table's
 * plain text is its tab-separated rows, unchanged.
 *
 * Break it names: the engine swapped for the kit serializer (echoes Markdown) →
 * red; JSON offered as "Plain text" (it would be the JSON again) → red.
 */
import { capture, createDraft, type Payload } from "@ai-matrx/kit/content-transfer";
import { alchemyPlainTextFormat } from "./alchemy-plain-text-format";
import { buildConversationMarkdown } from "@/features/agents/conversation-export/conversation-markdown";

const signal = new AbortController().signal;

async function plainOf(payload: Payload) {
  const { snapshot } = await capture(payload, signal);
  return alchemyPlainTextFormat.build(createDraft(snapshot), signal);
}

describe("Plain text from the one engine", () => {
  it("a conversation transcript becomes speakers and words in order, no Markdown", async () => {
    const markdown = buildConversationMarkdown({
      title: "Pool route",
      messages: [
        { role: "user", text: "Plan **Tuesday**.", createdAt: null, pinned: false },
        { role: "assistant", text: "Stop 1 is Oakwood.\n\n- chlorine 2.1", createdAt: null, pinned: false },
      ],
      exportedAt: new Date("2026-09-27T12:00:00Z"),
    });
    const artifact = await plainOf({ kind: "markdown", text: markdown });
    expect(artifact.plainText).not.toMatch(/^#+ /m);
    expect(artifact.plainText).not.toContain("**");
    const you = artifact.plainText.indexOf("Plan Tuesday.");
    const oak = artifact.plainText.indexOf("Stop 1 is Oakwood.");
    expect(you).toBeGreaterThan(-1);
    expect(oak).toBeGreaterThan(you);
    expect(artifact.plainText.trim().startsWith("{")).toBe(false);
  });

  it("is not offered for structured content (it would be the JSON)", () => {
    expect(alchemyPlainTextFormat.supports({ kind: "json", value: { a: 1 } })).toBe(false);
    expect(alchemyPlainTextFormat.supports({ kind: "markdown", text: "# x" })).toBe(true);
    expect(alchemyPlainTextFormat.supports({ kind: "rows", columns: [], rows: [] })).toBe(true);
  });
});
