import {
  formatYouTubeCount,
  formatYouTubeDuration,
  youTubeEngagementRate,
} from "../formatters";

describe("YouTube discovery formatters", () => {
  it("formats API durations for cards", () => {
    expect(formatYouTubeDuration("PT8M5S")).toBe("8:05");
    expect(formatYouTubeDuration("PT1H2M9S")).toBe("1:02:09");
    expect(formatYouTubeDuration("P1DT3M")).toBe("24:03:00");
  });

  it("preserves unknown duration formats and missing counts", () => {
    expect(formatYouTubeDuration("LIVE")).toBe("LIVE");
    expect(formatYouTubeCount(undefined)).toBe("—");
  });

  it("calculates visible engagement from likes and comments", () => {
    expect(youTubeEngagementRate(80, 20, 2_000)).toBe(5);
    expect(youTubeEngagementRate(null, null, 0)).toBeNull();
  });
});
