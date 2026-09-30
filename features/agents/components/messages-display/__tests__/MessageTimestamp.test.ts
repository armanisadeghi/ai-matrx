import { formatTimestampDisplay } from "../MessageTimestamp";

describe("MessageTimestamp", () => {
  it("keeps seconds and the local time zone in the exact display value", () => {
    const timestamp = new Date(2026, 8, 14, 15, 42, 7);
    const display = formatTimestampDisplay(timestamp);

    expect(display).not.toBeNull();
    expect(display?.absolute).toContain("2026");
    expect(display?.absolute).toMatch(/42:07/);
    expect(display?.absolute).toMatch(/\b(?:AM|PM)\b/);
    expect(display?.relative).not.toBe(display?.absolute);
    expect(display?.short).toMatch(/Sep 14.*3:42 PM/);
    expect(display?.short).not.toContain("2026");
    expect(display?.compact).toBe("3:42 PM");
  });

  it("renders nothing for an invalid timestamp", () => {
    expect(formatTimestampDisplay("not-a-date")).toBeNull();
  });
});
