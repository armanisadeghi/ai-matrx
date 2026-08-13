import {
  formatVideoPublishDate,
  formatVideoPublishDateTitle,
  videoPublishDateFromMetadata,
} from "@/lib/media/video-date";

describe("video publish dates", () => {
  it("formats a stable compact UTC date", () => {
    expect(formatVideoPublishDate("2026-08-13T00:15:00Z")).toBe("08/13/26");
    expect(formatVideoPublishDateTitle("2026-08-13T00:15:00Z")).toBe(
      "Published August 13, 2026",
    );
  });

  it("uses the compact missing-date label for absent or invalid values", () => {
    expect(formatVideoPublishDate(null)).toBe("No Date");
    expect(formatVideoPublishDate("not-a-date")).toBe("No Date");
  });

  it("reads dates from provider and nested schema metadata", () => {
    expect(videoPublishDateFromMetadata({ published_at: "2025-02-03" })).toBe(
      "2025-02-03",
    );
    expect(
      videoPublishDateFromMetadata({
        video_metadata: { schema_org: { uploadDate: "2022-04-05" } },
      }),
    ).toBe("2022-04-05");
  });
});
