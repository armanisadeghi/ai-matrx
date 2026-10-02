import { lastSeenIso, osLine } from "./platform";

describe("one 'last seen' for every screen", () => {
  const row = { last_seen: "2026-10-01T10:00:00.000Z" };

  it("the relay's offline moment wins when it has one", () => {
    expect(lastSeenIso(row, { online: false, since_ms: Date.parse("2026-10-02T08:00:00.000Z") })).toBe("2026-10-02T08:00:00.000Z");
  });

  it("falls back to the row when the relay never saw it (since 0), is unknown, or says online", () => {
    expect(lastSeenIso(row, { online: false, since_ms: 0 })).toBe(row.last_seen);
    expect(lastSeenIso(row, null)).toBe(row.last_seen);
    expect(lastSeenIso(row, { online: true, since_ms: 5 })).toBe(row.last_seen);
    expect(lastSeenIso({ last_seen: null }, null)).toBeNull();
  });
});

describe("the OS line", () => {
  it("lifts the version out of a legacy platform string and never prints a kernel banner", () => {
    expect(osLine("darwin", "macOS-27.0-arm64-arm-64bit")).toBe("macOS 27.0");
    expect(osLine("darwin", "Darwin Kernel Version 25.0.0: Mon Sep 1")).toBe("macOS");
    expect(osLine("darwin", "15.6")).toBe("macOS 15.6");
    expect(osLine("win32", null)).toBe("Windows");
  });
});
