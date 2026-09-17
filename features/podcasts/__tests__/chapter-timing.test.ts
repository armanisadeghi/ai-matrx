import { normalizeChapterTiming } from "@/features/podcasts/chapter-timing";

const chapters = (starts: string[]) =>
  starts.map((start_hint, index) => ({
    start_hint,
    title: `Chapter ${index + 1}`,
    summary: "",
  }));

describe("normalizeChapterTiming", () => {
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
});
