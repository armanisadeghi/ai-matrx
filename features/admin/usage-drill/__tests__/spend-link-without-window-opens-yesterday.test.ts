/**
 * AN OLD SPEND LINK WITHOUT A WINDOW OPENS THE SPEND EXPLORER'S DEFAULT (lane DRILL-CLOSE,
 * VERIFY-DRILL-FINAL L-a). The Spend Explorer read a missing `win` as Yesterday, cut at the viewer's
 * local midnight (features/admin/spend/windows.ts readExplorerUrlState / resolveWindow). The usage
 * link must open that same day, never All time.
 * Red on HEAD: `w` was absent (All time) and the address did not ask for the viewer's zone.
 */
import { spendAddressNeedsZone, spendAddressToUsage } from "../usageLinks";

const P = "87a6e699-3622-4869-8843-d0867456c0dd";
const at = (href: string) => new URL(href, "http://x");
// 2026-10-01 06:51Z is still Sep 30 in Los Angeles, so its Yesterday is Sep 29 (PDT, UTC−7).
const NOW = new Date("2026-10-01T06:51:00Z");

describe("a Spend link with filters and no window", () => {
  it("opens Yesterday in the viewer's own calendar", () => {
    const u = at(spendAddressToUsage(new URLSearchParams(`f.user=${P}`), "America/Los_Angeles", NOW).href);
    expect(u.searchParams.get("view")).toBe("builtin:spend_by_person");
    expect(u.searchParams.get("f.person")).toBe(P);
    expect(u.searchParams.get("w")).toBe("2026-09-29T07:00Z..2026-09-30T07:00Z");
  });
  it("an unknown win is the same default", () => {
    const u = at(spendAddressToUsage(new URLSearchParams(`win=lastweek&f.user=${P}`), "UTC", NOW).href);
    expect(u.searchParams.get("w")).toBe("2026-09-30T00:00Z..2026-10-01T00:00Z");
  });
  it("needs the viewer's zone, so the server hands it to the browser", () => {
    expect(spendAddressNeedsZone(new URLSearchParams(`f.user=${P}`))).toBe(true);
    expect(spendAddressNeedsZone(new URLSearchParams(`f.user=${P}&win=last7d`))).toBe(false);
  });
  it("a window the link names is kept as it was", () => {
    expect(at(spendAddressToUsage(new URLSearchParams(`f.user=${P}&win=last7d`), "America/Los_Angeles", NOW).href).searchParams.get("w")).toBe("7d");
  });
});
