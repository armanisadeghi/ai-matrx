import { describe, expect, it } from "@jest/globals";

import {
  canRerunPodcastSource,
  getPodcastSourceReadiness,
} from "../sourceReadiness";

describe("getPodcastSourceReadiness", () => {
  it("refuses the captured 457-character full-content request", () => {
    const readiness = getPodcastSourceReadiness("full_content", "x".repeat(457));

    expect(readiness.ready).toBe(false);
    expect(readiness.message).toContain("543 more characters");
  });

  it("accepts pass-through content at the server minimum", () => {
    expect(getPodcastSourceReadiness("partial_content", "x".repeat(1000))).toEqual({
      ready: true,
      message: null,
    });
  });

  it("counts Unicode code points like Python instead of UTF-16 code units", () => {
    const readiness = getPodcastSourceReadiness(
      "full_content",
      "😀".repeat(500),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.message).toContain("500 more characters");
  });

  it("accepts a short complete dialogue script", () => {
    expect(
      getPodcastSourceReadiness(
        "full_content",
        "<podcast_dialogue>Host: A short finished script.</podcast_dialogue>",
      ),
    ).toEqual({ ready: true, message: null });
  });

  it("leaves topic and file requests for their external preparation paths", () => {
    expect(getPodcastSourceReadiness("topic", "one word")).toEqual({
      ready: true,
      message: null,
    });
    expect(getPodcastSourceReadiness("file_url", "https://example.com/brief.pdf")).toEqual({
      ready: true,
      message: null,
    });
  });

  it("refuses a row-only rerun of the captured thin saved request", () => {
    expect(
      canRerunPodcastSource({
        input_data_type: "full_content",
        input_data: "x".repeat(457),
      }),
    ).toBe(false);
    expect(canRerunPodcastSource(null)).toBe(false);
  });
});
