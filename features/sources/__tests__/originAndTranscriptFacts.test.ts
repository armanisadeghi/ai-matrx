/**
 * SOURCE-CONVERGENCE §8.1 — the Sources page filters by origin in a person's
 * words (every `origin_client` the door writes has one, no code ever shows),
 * and a transcript Source shows its length and segment count ONLY from facts
 * it holds — nothing invented when a fact is missing.
 */
import {
  ORIGIN_CLIENTS,
  captureClientLabel,
  transcriptLengthWords,
  transcriptSegmentCount,
  type SourceListRow,
} from "@/features/sources/sourceRows";

const EXPECTED: Record<string, string> = {
  web: "Web app",
  extension: "Extension",
  local: "Desktop",
  cloud_browser: "Cloud browser",
  agent: "Agent",
  research: "Research",
  crawl: "Crawl",
  upload: "Upload",
  transcription: "Transcript",
  youtube: "YouTube",
  backfill: "Backfilled",
};

describe("origin filter labels", () => {
  it("covers every origin_client the door writes, in a person's words", () => {
    expect([...ORIGIN_CLIENTS].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [code, words] of Object.entries(EXPECTED)) {
      expect(
        captureClientLabel({ origin_client: code, source_kind: "transcript" }),
      ).toBe(words);
    }
  });

  it("never shows a raw code, even for an origin this build has not heard of", () => {
    expect(
      captureClientLabel({ origin_client: "some_new_client", source_kind: "inline" }),
    ).toBe("Some new client");
  });
});

function transcript(over: Partial<SourceListRow> = {}): Pick<
  SourceListRow,
  "source_kind" | "total_pages"
> {
  return { source_kind: "transcript", total_pages: 51, ...over };
}

describe("transcript facts", () => {
  it("segment count comes from the portions the Source holds", () => {
    expect(transcriptSegmentCount(transcript())).toBe(51);
    expect(transcriptSegmentCount(transcript({ total_pages: null }))).toBeNull();
    expect(transcriptSegmentCount(transcript({ total_pages: 0 }))).toBeNull();
    // Not a transcript → no transcript facts at all.
    expect(
      transcriptSegmentCount({ source_kind: "cld_file", total_pages: 12 }),
    ).toBeNull();
  });

  it("reads '1:49 · 51 segments' when both facts exist", () => {
    expect(transcriptLengthWords(51, 109_160)).toBe("1:49 · 51 segments");
    expect(transcriptLengthWords(1, 4_000)).toBe("0:04 · 1 segment");
    expect(transcriptLengthWords(900, 3_725_000)).toBe("1:02:05 · 900 segments");
  });

  it("says only what it knows — no duration invented, nothing when neither is known", () => {
    expect(transcriptLengthWords(33, null)).toBe("33 segments");
    expect(transcriptLengthWords(null, 73_640)).toBe("1:13");
    expect(transcriptLengthWords(null, null)).toBeNull();
    expect(transcriptLengthWords(null, 0)).toBeNull();
  });
});

// ── Titles are text (Sonnet walk 2026-09-27: "Why <b>OpenAI</b> is betting…") ──
import { listedSource } from "@/features/sources/sourceRows";

describe("a Source's name reads as plain text", () => {
  it("strips markup a producer left in the stored name", () => {
    const row = listedSource({
      id: "x",
      name: "Why <b>OpenAI</b> is betting on custom chips",
    } as SourceListRow);
    expect(row.name).toBe("Why OpenAI is betting on custom chips");
  });

  it("leaves a clean name untouched (same object)", () => {
    const clean = { id: "y", name: "Mediterranean Diet - StatPearls" } as SourceListRow;
    expect(listedSource(clean)).toBe(clean);
  });
});
