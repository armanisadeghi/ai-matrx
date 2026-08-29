import {
  SAMPLE_INPUT_CONTENT_KEY,
  sampleAttachmentParts,
  sampleInputContent,
} from "@/features/agents/samples/service";

describe("agent sample complete input", () => {
  it("keeps every structured user-message part", () => {
    const inputContent = [
      { type: "text", text: "Describe everything attached." },
      {
        type: "media",
        kind: "image",
        file_id: "11111111-1111-1111-1111-111111111111",
      },
      {
        type: "input_notes",
        note_ids: ["22222222-2222-2222-2222-222222222222"],
      },
    ];

    const sample = {
      user_input: "Describe everything attached.",
      metadata: { [SAMPLE_INPUT_CONTENT_KEY]: inputContent },
    };

    expect(sampleInputContent(sample)).toEqual(inputContent);
    expect(sampleAttachmentParts(sample)).toEqual(inputContent.slice(1));
  });

  it("keeps legacy text-only samples usable", () => {
    expect(
      sampleInputContent({
        user_input: "Legacy sample",
        metadata: {},
      }),
    ).toEqual([{ type: "text", text: "Legacy sample" }]);
  });
});
