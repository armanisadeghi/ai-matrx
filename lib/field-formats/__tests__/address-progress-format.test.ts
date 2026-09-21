import { FIELD_FORMATS } from "../registry";

describe("address format", () => {
  it("keeps any non-empty text and refuses blank", () => {
    expect(FIELD_FORMATS.address.format("  1600 Amphitheatre Pkwy, Mountain View  ", {})).toBe(
      "1600 Amphitheatre Pkwy, Mountain View",
    );
    expect(FIELD_FORMATS.address.format("   ", {})).toBeNull();
    expect(FIELD_FORMATS.address.parse("", {})).toBeNull();
  });
});

describe("progress format", () => {
  it("reads whole and fraction scales and refuses a non-number", () => {
    expect(FIELD_FORMATS.progress.format(45, {})).toBe("45%");
    expect(FIELD_FORMATS.progress.format(0.45, { percentScale: "fraction" })).toBe("45%");
    expect(FIELD_FORMATS.progress.format("n/a", {})).toBeNull();
    expect(FIELD_FORMATS.progress.parse("72", {})).toBe(72);
  });
});
