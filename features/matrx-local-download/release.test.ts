import { detectDesktopPlatform } from "./release";

describe("detectDesktopPlatform", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "mac"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "mobile"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9)", "mobile"],
    ["A browser from the future", "unknown"],
  ])("classifies %s as %s", (userAgent, expected) => {
    expect(detectDesktopPlatform(userAgent)).toBe(expected);
  });
});
