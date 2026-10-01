/**
 * THE SPEND EXPLORER'S OLD LINKS LOSE NOTHING (lane DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL R4):
 *   - a conversation or a sign-in session opens the per-execution grain on that conversation / session,
 *     never "Spend by person" with the filter gone;
 *   - Spend's `f.day` / `f.hour` are the VIEWER's local day and hour, mapped to their real instants in
 *     the viewer's zone (never read as UTC, never through the server's own clock);
 *   - the slim spend page's organization filter (`org_filter`) narrows the usage link by organization.
 * Red on HEAD: the conversation was returned in `dropped`, the day became a UTC date window, and
 * `org_filter` was ignored.
 */
import { spendAddressNeedsZone, spendAddressToUsage, zonedMoment } from "../usageLinks";

const P = "87a6e699-3622-4869-8843-d0867456c0dd";
const C = "3f1c2b8e-55aa-4d2e-9b1e-0c7a3e9d1f42";
const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const at = (href: string) => new URL(href, "http://x");

describe("a conversation or a sign-in session opens the per-execution grain", () => {
  it("f.conversation → def=ai_usage_executions, Spend by conversation, filter kept (person too)", () => {
    const { href, dropped } = spendAddressToUsage(new URLSearchParams(`win=last7d&f.conversation=${C}&f.user=${P}`));
    const u = at(href);
    expect(u.searchParams.get("def")).toBe("ai_usage_executions");
    expect(u.searchParams.get("view")).toBe("builtin:by_conversation");
    expect(u.searchParams.get("f.conversation")).toBe(C);
    expect(u.searchParams.get("f.person")).toBe(P);
    expect(u.searchParams.get("w")).toBe("7d");
    expect(dropped).toEqual([]);
  });
  it("f.session → Spend by sign-in session", () => {
    const u = at(spendAddressToUsage(new URLSearchParams("f.session=S-1")).href);
    expect([u.searchParams.get("def"), u.searchParams.get("view"), u.searchParams.get("f.session")]).toEqual(["ai_usage_executions", "builtin:by_session", "S-1"]);
  });
});

describe("a Spend day or hour is the viewer's local calendar", () => {
  it("a Los Angeles day is 07:00Z to 07:00Z (PDT)", () => {
    const u = at(spendAddressToUsage(new URLSearchParams("f.day=2026-09-28"), "America/Los_Angeles").href);
    expect(u.searchParams.get("w")).toBe("2026-09-28T07:00Z..2026-09-29T07:00Z");
  });
  it("a Los Angeles hour (Spend's key 2026-09-28T14:00) is 21:00Z for one hour", () => {
    const u = at(spendAddressToUsage(new URLSearchParams("f.hour=2026-09-28T14:00"), "America/Los_Angeles").href);
    expect(u.searchParams.get("w")).toBe("2026-09-28T21:00Z..2026-09-28T22:00Z");
  });
  it("a day across the autumn clock change is 25 hours long", () => {
    expect(zonedMoment("2026-11-01", 0, "America/Los_Angeles")).toBe("2026-11-01T07:00Z");
    expect(zonedMoment("2026-11-02", 0, "America/Los_Angeles")).toBe("2026-11-02T08:00Z");
  });
  it("only a day or an hour needs the viewer's zone", () => {
    expect(spendAddressNeedsZone(new URLSearchParams("f.day=2026-09-28"))).toBe(true);
    expect(spendAddressNeedsZone(new URLSearchParams("f.agent=A1&win=last7d"))).toBe(false);
  });
});

describe("the slim spend page's organization filter carries into the usage link", () => {
  it("org_filter → f.organization (Spend by organization)", () => {
    const u = at(spendAddressToUsage(new URLSearchParams(`win=last30d&org_filter=${ORG}`)).href);
    expect(u.searchParams.get("f.organization")).toBe(ORG);
    expect(u.searchParams.get("view")).toBe("builtin:spend_by_organization");
  });
});
