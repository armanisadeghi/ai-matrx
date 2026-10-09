jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/sources/api/sourcesApi", () => ({ landSource: jest.fn() }));

import {
  buildSocialSampleLanding,
  pickSampleText,
  sampleKindForPlatform,
  type SocialSampleOption,
} from "../socialSamples";

const long = "one two three four five six seven eight nine";

describe("pickSampleText", () => {
  it("prefers a transcript over a caption", () => {
    expect(pickSampleText("short", long)).toEqual({ text: long, kind: "transcript" });
    expect(pickSampleText(long, long)?.kind).toBe("transcript");
  });
  it("falls back to the caption", () => {
    expect(pickSampleText(long, "too short")).toEqual({ text: long, kind: "caption" });
  });
  it("returns null when both are too short", () => {
    expect(pickSampleText("hi", null)).toBeNull();
  });
});

describe("sampleKindForPlatform", () => {
  it("maps x and linkedin, the rest is other", () => {
    expect(sampleKindForPlatform("x")).toBe("tweet");
    expect(sampleKindForPlatform("linkedin")).toBe("linkedin");
    expect(sampleKindForPlatform("instagram")).toBe("other");
  });
});

describe("buildSocialSampleLanding", () => {
  const option: SocialSampleOption = {
    postId: "p1", platform: "instagram", handle: "harborlight", url: "u",
    postedAt: "2026-09-01T10:00:00Z", preview: "", textKind: "caption", caption: long,
  };
  it("has a stable identity per post and kind, and keeps the Source", () => {
    const body = buildSocialSampleLanding({ option, text: long, organizationId: "o", userId: "u" });
    expect(body.canonical_identity).toBe("social-post:p1:caption");
    expect(body.keep).toBe(true);
    expect(body.name).toContain("@harborlight");
  });
});
