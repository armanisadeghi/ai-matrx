/**
 * A KIND IS NEVER DRAWN AS RAW JSON — shared public conversation tool steps
 * (T5 of features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman
 * 2026-09-30).
 *
 * A tool output over the share size limit arrives as `output_preview` — for a
 * kind, the first slice of its JSON. The shared page handed that slice to the
 * tool card as text: `{"__kind":"flashcard_set","ti…` on a public page. It
 * reads as the kind's honest "not saved" state, like a reloaded chat (T2).
 *
 * RED BEFORE GREEN: before the fix `output` was the raw preview string.
 */
import { readSharedConversation } from "../conversation-transcript";

function toolOutput(block: Record<string, unknown>): unknown {
  const transcript = readSharedConversation({
    children: {
      kind: "conversation_messages",
      total: 1,
      truncated: false,
      messages: [
        {
          id: "a1",
          role: "assistant",
          blocks: [{ type: "tool", call_id: "c1", name: "study_tools", status: "completed", ...block }],
        },
      ],
    },
  });
  const first = transcript?.turns[0]?.blocks[0];
  return first?.type === "tools" ? first.tools[0].output : undefined;
}

describe("a shared tool step whose output was too large", () => {
  it("never shows truncated kind JSON", () => {
    const output = toolOutput({
      output_truncated: true,
      output_preview: '{"__kind":"flashcard_set","title":"Cell biology","cards":[{"fr',
    });
    expect(output).toBe("Flashcard set · full output not saved");
  });

  it("keeps a prose preview as its text", () => {
    expect(
      toolOutput({ output_truncated: true, output_preview: "Found 12 matching rooms" }),
    ).toBe("Found 12 matching rooms");
  });

  it("still parses a whole output", () => {
    expect(toolOutput({ output: '{"rows":[{"name":"Sauna"}]}' })).toEqual({
      rows: [{ name: "Sauna" }],
    });
  });
});
