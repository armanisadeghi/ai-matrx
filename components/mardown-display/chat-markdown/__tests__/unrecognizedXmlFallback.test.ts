import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { expandTextBlocksInList } from "@/components/mardown-display/markdown-classification/processors/utils/expand-text-blocks";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { buildCanonicalBlocks } from "@/lib/chat-protocol/from-stream";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import type { TypedStreamEvent } from "@/components/mardown-display/chat-markdown/types";

describe("unrecognized XML fallback", () => {
  it("routes complete bare XML through the existing XML code renderer contract", () => {
    const source = [
      "Before",
      '<custom_response status="ok">',
      "  <value>42</value>",
      "</custom_response>",
      "After",
    ].join("\n");

    expect(splitContentIntoBlocksV2(source)).toEqual([
      { type: "text", content: "Before" },
      {
        type: "code",
        content:
          '<custom_response status="ok">\n  <value>42</value>\n</custom_response>',
        language: "xml",
        metadata: { isComplete: true },
      },
      { type: "text", content: "After" },
    ]);
  });

  it("preserves recognized simple and attribute-bearing XML behavior", () => {
    const [timeline] = splitContentIntoBlocksV2(
      "<timeline>\n# Launch\n</timeline>",
    );
    const [decision] = splitContentIntoBlocksV2(
      '<decision prompt="Choose"><option label="A">Alpha</option></decision>',
    );

    expect(timeline).toMatchObject({
      type: "timeline",
      content: "# Launch",
      metadata: { isComplete: true },
    });
    expect(decision).toMatchObject({
      type: "decision",
      content: '<option label="A">Alpha</option>',
      metadata: {
        isComplete: true,
        decision: {
          prompt: "Choose",
          options: [{ label: "A", text: "Alpha" }],
        },
      },
    });
  });

  it("does not reclassify inline prose, incomplete XML, or non-XML fences", () => {
    expect(splitContentIntoBlocksV2("Use <Widget> in this sentence.")).toEqual([
      { type: "text", content: "Use <Widget> in this sentence." },
    ]);
    expect(splitContentIntoBlocksV2("<custom_response>\nstill streaming")).toEqual(
      [
        {
          type: "text",
          content: "<custom_response>\nstill streaming",
        },
      ],
    );
    expect(
      splitContentIntoBlocksV2(
        "```typescript\nconst value = '<custom>xml</custom>';\n```",
      ),
    ).toEqual([
      {
        type: "code",
        content: "const value = '<custom>xml</custom>';",
        language: "typescript",
      },
    ]);
  });

  it("leaves curated raw HTML on the sanitized markdown renderer path", () => {
    const rawTable = "<table><tr><td>value</td></tr></table>";

    expect(splitContentIntoBlocksV2(rawTable)).toEqual([
      { type: "text", content: rawTable },
    ]);
  });

  it("handles nested same-name elements and same-line trailing prose", () => {
    const source = "<node><node>child</node></node> trailing";

    expect(splitContentIntoBlocksV2(source)).toEqual([
      {
        type: "code",
        content: "<node><node>child</node></node>",
        language: "xml",
        metadata: { isComplete: true },
      },
      { type: "text", content: "trailing" },
    ]);
  });

  it("promotes XML only after a direct-content live stream becomes complete", () => {
    const partial = "<custom_response>\nstill streaming";
    const complete = `${partial}\n</custom_response>`;

    expect(splitContentIntoBlocksV2(partial)).toEqual([
      { type: "text", content: partial },
    ]);
    expect(splitContentIntoBlocksV2(complete)).toEqual([
      {
        type: "code",
        content: complete,
        language: "xml",
        metadata: { isComplete: true },
      },
    ]);
  });

  it("promotes XML after event-mode chunks are accumulated", () => {
    const events = [
      { event: "chunk", data: { text: "<custom_response>\n" } },
      { event: "chunk", data: { text: "<value>42</value>\n" } },
      { event: "chunk", data: { text: "</custom_response>" } },
    ] as TypedStreamEvent[];
    const [textBlock] = buildCanonicalBlocks(events);

    expect(textBlock).toMatchObject({ type: "text" });
    if (textBlock.type !== "text") {
      throw new Error("Expected accumulated event-mode text");
    }
    expect(splitContentIntoBlocksV2(textBlock.content)).toEqual([
      {
        type: "code",
        content:
          "<custom_response>\n<value>42</value>\n</custom_response>",
        language: "xml",
        metadata: { isComplete: true },
      },
    ]);
  });

  it("promotes XML on the Redux StreamBlockAccumulator fast path", () => {
    const latestById = new Map<string, RenderBlockPayload>();
    const accumulator = new StreamBlockAccumulator(
      "xml-path-test",
      (payload) => {
        latestById.set(payload.block.blockId, payload.block);
        return payload;
      },
    );
    const dispatch = (action: unknown) => action;

    for (const chunk of [
      "<custom_response>\n",
      "<value>42</value>\n",
      "</custom_response>",
    ]) {
      accumulator.ingest(chunk, dispatch);
    }
    accumulator.finalize(dispatch);

    const renderBlocks = [...latestById.values()]
      .sort((a, b) => a.blockIndex - b.blockIndex)
      .map(renderBlockToContentBlock);
    expect(expandTextBlocksInList(renderBlocks)).toEqual([
      expect.objectContaining({
        type: "code",
        content:
          "<custom_response>\n<value>42</value>\n</custom_response>",
        language: "xml",
      }),
    ]);
  });

  it("promotes XML in preprocessed/server text blocks without changing typed blocks", () => {
    const xml =
      "<custom_response>\n<value>42</value>\n</custom_response>";
    const alreadyTyped = {
      type: "timeline",
      content: "# Launch",
      metadata: { isComplete: true },
    } as const;

    expect(
      expandTextBlocksInList([
        { type: "text", content: xml },
        alreadyTyped,
      ]),
    ).toEqual([
      {
        type: "code",
        content: xml,
        language: "xml",
        metadata: { isComplete: true },
        isStreamingBlock: undefined,
      },
      alreadyTyped,
    ]);
  });
});
