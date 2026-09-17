import {
  chapterTimingAdjustmentNotice,
  durationSecondsForStorage,
  normalizeChapterTiming,
} from "@/features/podcasts/chapter-timing";

const chapters = (starts: string[]) =>
  starts.map((start_hint, index) => ({
    start_hint,
    title: `Chapter ${index + 1}`,
    summary: "",
  }));

describe("normalizeChapterTiming", () => {
  it("keeps exact metadata for chapter bounds but persists the int4-compatible duration", () => {
    expect(durationSecondsForStorage(10.410958)).toBe(10);
    expect(durationSecondsForStorage(9.570958)).toBe(10);
  });

  it("repairs the captured 10.410958s episode before persistence can save unreachable chapters", () => {
    expect(
      normalizeChapterTiming(chapters(["00:00", "00:25", "00:52"]), 10.410958),
    ).toEqual(chapters(["00:00", "00:05", "00:10"]));
  });

  it("preserves proportional playback order for a different audio duration", () => {
    expect(
      normalizeChapterTiming(
        chapters(["00:00", "00:30", "01:05", "02:10", "02:50", "03:40"]),
        9.570958,
      ).map((chapter) => chapter.start_hint),
    ).toEqual(["00:00", "00:01", "00:03", "00:05", "00:07", "00:09"]);
  });

  it("refuses a chapter list that cannot fit distinct playable timestamps", () => {
    expect(() => normalizeChapterTiming(chapters(["00:00", "00:25"]), 0.4)).toThrow(
      "cannot hold 2 distinct whole-second chapter markers",
    );
  });

  it("discloses every persisted seek change with the actual-duration remedy", () => {
    const requested = chapters(["00:00", "00:25", "00:52"]);
    const saved = normalizeChapterTiming(requested, 10.410958);
    expect(chapterTimingAdjustmentNotice(requested, saved, 10.410958)).toBe(
      "Adjusted 2 chapter timestamps to fit the actual 10.411-second audio. Review the chapter markers before publishing.",
    );
  });
});
