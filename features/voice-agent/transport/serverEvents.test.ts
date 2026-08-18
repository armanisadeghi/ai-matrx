import { transcriptTextFromEvent } from "./serverEvents";

describe("transcriptTextFromEvent", () => {
  test.each([
    [{ delta: "delta text" }, "delta text"],
    [{ transcript: "completed text" }, "completed text"],
    [{ text: "alternate text" }, "alternate text"],
    [{ transcript: { text: "nested text" } }, "nested text"],
    [
      { item: { content: [{ type: "input_audio", transcript: "item text" }] } },
      "item text",
    ],
  ])("normalizes provider transcript variants", (event, expected) => {
    expect(
      transcriptTextFromEvent(event, ["delta", "transcript", "text"]),
    ).toBe(expected);
  });

  test("returns empty text instead of stringifying absent fields", () => {
    expect(
      transcriptTextFromEvent(
        { type: "conversation.item.input_audio_transcription.delta" },
        ["delta", "transcript", "text"],
      ),
    ).toBe("");
  });
});
