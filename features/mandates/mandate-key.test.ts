import { splitMandateKey } from "./mandate-key";

describe("splitMandateKey", () => {
  it("separates the feature from the mandate", () => {
    expect(splitMandateKey("podcast.image_v2")).toEqual({
      feature: "podcast",
      mandate: "image_v2",
    });
  });

  it("preserves later dots as part of the mandate", () => {
    expect(splitMandateKey("research.report.finalize")).toEqual({
      feature: "research",
      mandate: "report.finalize",
    });
  });

  it("keeps a legacy dotless key intact", () => {
    expect(splitMandateKey("legacy_slot")).toEqual({
      feature: "(unscoped)",
      mandate: "legacy_slot",
    });
  });
});
