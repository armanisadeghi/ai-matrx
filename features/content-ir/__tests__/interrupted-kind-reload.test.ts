import { normalizeJsonRegion } from "@ai-matrx/content-ir";
import { memoizedRegionEnvelope } from "../registry/region-envelope-memo";
import { kindRegistry } from "../registry/kind-registry";

const source =
  '{"__kind":"video_transcript_research","title":"AP Precalculus","segments":[{"__kind":"transcript_segment","id":"seg-0001","text":"Hey, welcome back to AP Precalc.","speaker":"Mr. Kelly","timecode":"00:00:07","seconds":7,"isHighlighted":false},{"__kind":"transcript_segment","id":"seg-0013","text":"We also have one down here. This';

it("rehydrates the interrupted parent with the same parser and error evidence", () => {
  const expected = normalizeJsonRegion(source, {
    schemas: kindRegistry.resolver(),
  });
  expect(expected.root.kind).toBe("video_transcript_research");
  expect(expected.root.status).toBe("error");
  expect(memoizedRegionEnvelope(source)).toBeNull();
  const actual = memoizedRegionEnvelope(source, { allowTerminalError: true });
  expect(actual).toEqual(expected);
  expect(actual?.root.value).toHaveProperty("segments");
  // A terminal cache entry must never relabel an in-flight splitter prefix.
  expect(memoizedRegionEnvelope(source)).toBeNull();
});
