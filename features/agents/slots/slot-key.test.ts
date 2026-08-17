import { splitSlotKey } from "./slot-key";

describe("splitSlotKey", () => {
  it("separates the feature from the slot", () => {
    expect(splitSlotKey("podcast.image_v2")).toEqual({
      feature: "podcast",
      slot: "image_v2",
    });
  });

  it("preserves later dots as part of the slot", () => {
    expect(splitSlotKey("research.report.finalize")).toEqual({
      feature: "research",
      slot: "report.finalize",
    });
  });

  it("keeps a legacy dotless key intact", () => {
    expect(splitSlotKey("legacy_slot")).toEqual({
      feature: "(unscoped)",
      slot: "legacy_slot",
    });
  });
});
