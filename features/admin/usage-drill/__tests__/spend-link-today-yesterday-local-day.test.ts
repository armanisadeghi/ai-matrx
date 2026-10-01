/**
 * AN OLD SPEND LINK THAT NAMES win=today OR win=yesterday OPENS THE VIEWER'S LOCAL DAY (lane
 * DRILL-CLOSE-2). Both were mapped to the explorer's UTC `today`/`yesterday` tokens; the Spend Explorer
 * cut them at the viewer's local midnight. Rolling windows and custom from/to keep their mapping.
 * Red on HEAD: `w` was the bare token and the address did not ask for the viewer's zone.
 */
import { spendAddressNeedsZone, spendAddressToUsage } from "../usageLinks";

const P = "87a6e699-3622-4869-8843-d0867456c0dd";
const w = (q: string, zone: string) => new URL(spendAddressToUsage(new URLSearchParams(q), zone, NOW).href, "http://x").searchParams.get("w");
// 2026-10-01 06:51Z is still Sep 30 in Los Angeles (PDT, UTC-7).
const NOW = new Date("2026-10-01T06:51:00Z");

describe("win=today / win=yesterday", () => {
  it("today is the viewer's local day", () => {
    expect(w(`win=today&f.user=${P}`, "America/Los_Angeles")).toBe("2026-09-30T07:00Z..2026-10-01T07:00Z");
  });
  it("yesterday is the viewer's local day before", () => {
    expect(w(`win=yesterday&f.user=${P}`, "America/Los_Angeles")).toBe("2026-09-29T07:00Z..2026-09-30T07:00Z");
  });
  it("both need the viewer's zone, so the server hands them to the browser", () => {
    expect(spendAddressNeedsZone(new URLSearchParams(`win=today&f.user=${P}`))).toBe(true);
    expect(spendAddressNeedsZone(new URLSearchParams(`win=yesterday&f.user=${P}`))).toBe(true);
  });
  it("rolling windows and custom from/to keep their mapping", () => {
    expect(w(`win=last24h&f.user=${P}`, "America/Los_Angeles")).toBe("24h");
    expect(w(`win=last30d&f.user=${P}`, "America/Los_Angeles")).toBe("30d");
    expect(w(`win=custom&from=2026-09-01&to=2026-09-10&f.user=${P}`, "America/Los_Angeles")).toBe("2026-09-01..2026-09-11");
    expect(spendAddressNeedsZone(new URLSearchParams(`win=last7d&f.user=${P}`))).toBe(false);
  });
});
