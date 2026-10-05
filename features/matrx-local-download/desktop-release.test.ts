import {
  formatDownloadSize,
  parseMatrxDesktopMacFeed,
} from "./desktop-release";

const FEED = `version: 2026.1005.504
files:
  - url: Matrx2-2026.1005.504-arm64-mac.zip
    sha512: abc==
    size: 420107474
path: Matrx2-2026.1005.504-arm64-mac.zip
sha512: abc==
releaseDate: '2026-10-05T12:13:11.127Z'
`;

describe("parseMatrxDesktopMacFeed", () => {
  it("follows the feed's path to the zip beside it", () => {
    expect(parseMatrxDesktopMacFeed(FEED)).toEqual({
      version: "2026.1005.504",
      url: "https://cdn.matrxserver.com/releases/matrx-desktop/mac/Matrx2-2026.1005.504-arm64-mac.zip",
      sizeBytes: 420107474,
      releaseDate: "2026-10-05T12:13:11.127Z",
    });
  });

  it("refuses a path that is not a bare zip name", () => {
    for (const path of [
      "https://evil.example/a.zip",
      "../a.zip",
      "a.dmg",
      "a/b.zip",
    ]) {
      expect(
        parseMatrxDesktopMacFeed(`version: 1\npath: ${path}\n`),
      ).toBeNull();
    }
  });

  it("returns null for an unreadable feed", () => {
    expect(parseMatrxDesktopMacFeed("<html>oops</html>")).toBeNull();
  });

  it("formats the size in plain megabytes", () => {
    expect(formatDownloadSize(420107474)).toBe("420 MB");
    expect(formatDownloadSize(null)).toBeNull();
  });
});
