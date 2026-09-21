import { FIELD_FORMATS } from "../registry";

/** The Time format: a time of day with no date — shift starts, opening hours. */
const time = FIELD_FORMATS.time;

describe("time format", () => {
  it("parses what people type into the 24-hour form the input reads", () => {
    expect(time.parse("14:30", {})).toBe("14:30");
    expect(time.parse("2:30 pm", {})).toBe("14:30");
    expect(time.parse("2pm", {})).toBe("14:00");
    expect(time.parse("12:15am", {})).toBe("00:15");
    expect(time.parse("09:05:07", {})).toBe("09:05:07");
    expect(time.parse("", {})).toBeNull();
    expect(time.parse(null, {})).toBeNull();
  });

  it("hands back a non-time unchanged so validation can name it", () => {
    expect(time.parse("noon-ish", {})).toBe("noon-ish");
    expect(time.parse("25:00", {})).toBe("25:00");
  });

  it("formats in the locale and returns null for a non-time", () => {
    const shown = time.format("14:30", {});
    expect(shown).toMatch(/2:30|14:30/);
    expect(time.format("14:30:09", { timeSeconds: true })).toMatch(/09/);
    expect(time.format("banana", {})).toBeNull();
  });
});
