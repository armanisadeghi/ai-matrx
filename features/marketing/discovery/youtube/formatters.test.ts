import {
  formatYouTubeDuration,
  formatYouTubeCount,
} from "./formatters";

describe("YouTube discovery formatters", () => {
  it("formats video length for card and preview metrics", () => {
    expect(formatYouTubeDuration("PT38S")).toBe("0:38");
    expect(formatYouTubeDuration("PT15M32S")).toBe("15:32");
    expect(formatYouTubeDuration("PT1H2M3S")).toBe("1:02:03");
  });

  it("keeps unavailable metrics explicit", () => {
    expect(formatYouTubeDuration(null)).toBe("—");
    expect(formatYouTubeCount(undefined)).toBe("—");
  });
});
