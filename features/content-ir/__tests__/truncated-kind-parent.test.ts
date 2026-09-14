import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { findEmbeddedKindJsonRegions } from "../surfaces/embedded-kind-json";
import { readEnvelope } from "../redux/render-block-envelope";

// Minimized from saved chat 6340dae7-6a04-497c-b4fb-2f2d294c7778:
// the response ends inside segment 13, after twelve complete nested kinds.
const truncated =
  '{\n  "__kind": "video_transcript_research",\n  "title": "AP Precalculus – 1.4 Polynomial Functions and Rates of Change",\n  "segments": [\n    {"__kind":"transcript_segment","id":"seg-0001","text":"Hey, welcome back to AP Precalc.","speaker":"Mr. Kelly","timecode":"00:00:07","seconds":7,"isHighlighted":false},\n    {"__kind":"transcript_segment","id":"seg-0013","text":"We also have one down here. This';

describe("truncated parent kind ownership", () => {
  it("does not promote nested segments out of an unfinished parent", () => {
    expect(findEmbeddedKindJsonRegions(truncated)).toEqual([]);
  });

  it.each([
    [
      "root kind after a complete child",
      '{"segments":[{"__kind":"transcript_segment","id":"seg-0001"}],"__kind":"video_transcript_research","title":"cut off',
    ],
    [
      "balanced malformed root",
      '{"__kind":"video_transcript_research","segments":[{"__kind":"transcript_segment","id":"seg-0001"}],"title": nope}',
    ],
  ])("keeps children owned when %s", (_label, source) => {
    expect(findEmbeddedKindJsonRegions(source)).toEqual([]);
  });

  it("does not treat a kind-shaped JSON string as a region", () => {
    expect(
      findEmbeddedKindJsonRegions(
        '{"note":"{\\"__kind\\":\\"transcript_segment\\"}"}',
      ),
    ).toEqual([]);
  });

  it("still recovers a standalone kind from malformed brace prose", () => {
    const child = '{"__kind":"transcript_segment","id":"seg-0001"}';
    expect(
      findEmbeddedKindJsonRegions(`prefix { this is prose, ${child} }`),
    ).toEqual([expect.objectContaining({ content: child })]);
  });

  it.each([
    '{"__kind":"parent","x":1,} between {"__kind":"child","x":1}',
    '{"__kind":"parent","nested":{"x":,}} between {"__kind":"child","x":1}',
    '{"__kind":"parent","nested":[,]} between {"__kind":"child","x":1}',
  ])(
    "recovers an independent sibling after a balanced malformed parent",
    (source) => {
      expect(findEmbeddedKindJsonRegions(source)).toEqual([
        expect.objectContaining({
          content: '{"__kind":"child","x":1}',
          kind: "child",
        }),
      ]);
    },
  );

  it.each([truncated, "```json\n" + truncated])(
    "keeps one parent block on reload",
    (source) => {
      const blocks = splitContentIntoBlocksV2(source);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toContain(truncated);
      expect(readEnvelope(blocks[0].metadata)?.root.kind).not.toBe(
        "transcript_segment",
      );
    },
  );
});
