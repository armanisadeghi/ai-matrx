/**
 * A ZERO-BYTE FILE MUST SAY SO — a forcing function.
 *
 * `common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md` §12
 * (2026-09-18): an empty upload's Resources card renders identically to a
 * real one — no size, no "(empty)" — so nobody can tell, from the screen,
 * that their file landed with nothing in it. Drives the REAL
 * `fileSourceSizeLabel`.
 */

import { fileSourceSizeLabel } from "./fileSourceSizeLabel";

describe("fileSourceSizeLabel", () => {
  it("says a zero-byte file is empty, plainly — never a bare size or nothing at all", () => {
    // ← RED before the fix: this returned "0 B" (indistinguishable from a
    // real tiny file at a glance) or null (no signal at all).
    expect(fileSourceSizeLabel(0)).toBe("Empty — 0 B, nothing to read");
  });

  it("shows a real file's size using the app's own formatter", () => {
    expect(fileSourceSizeLabel(1536)).toBe("1.5 KB");
    expect(fileSourceSizeLabel(42)).toBe("42 B");
  });

  it("says nothing when the size hasn't loaded yet — never guesses", () => {
    expect(fileSourceSizeLabel(null)).toBeNull();
    expect(fileSourceSizeLabel(undefined)).toBeNull();
  });
});
