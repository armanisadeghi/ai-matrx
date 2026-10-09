import {
  dayKeyInZone,
  resolvePersonTimeZone,
  zoneToCapture,
} from "../personTimeZone";

describe("person time zone rules", () => {
  // 2026-10-08 00:49 UTC is still Oct 7 in Los Angeles.
  const instant = new Date("2026-10-08T00:49:00Z");

  it("today for a Pacific person is the Pacific day, not the UTC day", () => {
    expect(dayKeyInZone("UTC", instant)).toBe("2026-10-08");
    expect(dayKeyInZone("America/Los_Angeles", instant)).toBe("2026-10-07");
  });

  it("an unknown zone falls back to UTC", () => {
    expect(dayKeyInZone("Not/AZone", instant)).toBe("2026-10-08");
  });

  it("following the device, the device wins; pinned, the saved zone wins", () => {
    const device = "America/Los_Angeles";
    expect(resolvePersonTimeZone({ saved: "Asia/Tokyo", followsDevice: true, device })).toBe(device);
    expect(resolvePersonTimeZone({ saved: "Asia/Tokyo", followsDevice: false, device })).toBe("Asia/Tokyo");
    expect(resolvePersonTimeZone({ saved: "", followsDevice: undefined, device: null })).toBe("UTC");
  });

  it("captures the device zone only when it differs and nothing is pinned", () => {
    const device = "America/Los_Angeles";
    expect(zoneToCapture({ saved: "", followsDevice: true, device })).toBe(device);
    expect(zoneToCapture({ saved: "Asia/Tokyo", followsDevice: undefined, device })).toBe(device);
    expect(zoneToCapture({ saved: device, followsDevice: true, device })).toBeNull();
    expect(zoneToCapture({ saved: "Asia/Tokyo", followsDevice: false, device })).toBeNull();
    expect(zoneToCapture({ saved: "", followsDevice: true, device: "junk" })).toBeNull();
  });
});
