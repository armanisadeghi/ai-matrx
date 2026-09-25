/**
 * Live blocks carry the same render fields as reloaded blocks.
 *
 * The break this guards (verify-RC-B7, 2026-09-25): in live /chat a markdown
 * image arrived as `{type:"image"}` with no `src` — the stream accumulator
 * never set it — and the image renderer drew nothing until the page was
 * reloaded (the static splitter DOES set it). This is a census over every
 * block the accumulator builds from these answers: for each block, the
 * fields a renderer reads (`src`, `alt`, `language`) must equal what the
 * static splitter produces for the same text. A new block type the
 * accumulator builds without its fields fails here.
 */
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { expandTextBlocksInList } from "@/components/mardown-display/markdown-classification/processors/utils/expand-text-blocks";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

// A hauling company's assistant: a standalone photo line, a video line, an
// audio clip, a code fence and a table — every media/data block the
// accumulator splits out of prose.
const ROUTE_UPDATE = [
  "Here is the curbside pile the driver photographed this morning:",
  "",
  "![Curbside e-waste pile on Bay Street](https://images.greenroutehauling.com/pickup/curbside-pile.jpg)",
  "",
  "And the loading walkthrough:",
  "",
  "[Video URL: https://media.greenroutehauling.com/training/loading-walkthrough.mp4]",
  "",
  "Dispatch left a voice note:",
  "",
  "[Dispatch voice note](https://media.greenroutehauling.com/notes/route-14.mp3)",
  "",
  "```ts",
  "export const ROUTE_14_CAPACITY = 38;",
  "```",
  "",
  "| Stop | Items |",
  "| --- | --- |",
  "| 1 | 4 monitors |",
  "",
  "Thanks!",
].join("\n");

// A dental practice's assistant: the photo line carries a title.
const INTAKE_NOTE = [
  "Your parking entrance:",
  "",
  '![Parking entrance on Bay Street](https://harbordental.clinic/img/parking-entrance.png "Second door")',
  "",
  "See you Tuesday.",
].join("\n");

type Fields = { type: string; src?: string; alt?: string; language?: string };

function pick(b: { type: string; src?: string; alt?: string; language?: string }): Fields {
  return { type: b.type, src: b.src, alt: b.alt, language: b.language };
}

function liveBlocks(text: string, chunk: number): Fields[] {
  const latest = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator("live-field-parity", (payload) => {
    latest.set(payload.block.blockId, payload.block);
    return payload;
  });
  const dispatch = (action: unknown) => action;
  for (let i = 0; i < text.length; i += chunk) accumulator.ingest(text.slice(i, i + chunk), dispatch);
  accumulator.finalize(dispatch);
  const blocks = [...latest.values()]
    .filter((b) => b.content)
    .sort((a, b) => a.blockIndex - b.blockIndex)
    .map(renderBlockToContentBlock);
  return expandTextBlocksInList(blocks)
    .filter((b) => b.type !== "text")
    .map(pick);
}

function staticBlocks(text: string): Fields[] {
  return splitContentIntoBlocksV2(text)
    .filter((b) => b.type !== "text")
    .map(pick);
}

describe("live vs reloaded block fields", () => {
  it.each([
    ["route update", ROUTE_UPDATE],
    ["intake note", INTAKE_NOTE],
  ])("%s: every non-text block carries the reloaded fields", (_name, text) => {
    const expected = staticBlocks(text);
    expect(expected.length).toBeGreaterThan(0);
    for (const chunk of [7, 40, text.length]) {
      expect(liveBlocks(text, chunk)).toEqual(expected);
    }
  });

  it("the reloaded photo carries its URL (the fixture forces a real src)", () => {
    expect(staticBlocks(ROUTE_UPDATE).find((b) => b.type === "image")).toEqual({
      type: "image",
      src: "https://images.greenroutehauling.com/pickup/curbside-pile.jpg",
      alt: "Curbside e-waste pile on Bay Street",
      language: undefined,
    });
  });
});
