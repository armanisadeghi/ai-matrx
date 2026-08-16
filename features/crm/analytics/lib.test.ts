// features/crm/analytics/lib.test.ts
//
// The reporting core, pinned to the one rule it exists to keep: a rate with no
// denominator is NOT ZERO. A "0% reply rate" shown on a campaign that has never
// sent a message reads as failure and gets a working campaign cancelled — by
// exactly the non-technical expert this platform is built for.

import { describe, expect, it } from "vitest";

import {
  buildCampaignRollup,
  buildExits,
  buildFunnel,
  buildOrgTotals,
  buildOutcomeTrend,
  buildResponseRates,
  formatRate,
  rate,
  weekBucket,
  type StatusCounts,
} from "./lib";

describe("unmeasured is never zero", () => {
  it("returns null for an empty denominator", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
  });

  it("still reports a real, measured zero", () => {
    expect(rate(0, 10)).toBe(0);
  });

  it("renders an unmeasured rate as a dash, never 0%", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(null, "Not measured")).toBe("Not measured");
    expect(formatRate(0)).toBe("0%");
  });

  it("a campaign that has sent nothing has no reply rate", () => {
    const rates = buildResponseRates({ sent: 0, replied: 0 });
    expect(rates.replyRate).toBeNull();
    expect(rates.verdict).toContain("no reply rate");
  });

  it("a campaign that has sent and heard nothing back has a real 0%", () => {
    const rates = buildResponseRates({ sent: 40, replied: 0 });
    expect(rates.replyRate).toBe(0);
    expect(rates.verdict).toContain("0 of 40");
  });
});

describe("the funnel", () => {
  const counts = (extra: Partial<StatusCounts> = {}): StatusCounts => ({
    total: 100,
    ...extra,
  });

  it("credits wins from the outcome ledger, not from member status", () => {
    const funnel = buildFunnel(counts({ sent: 60, replied: 10 }), 4);
    expect(funnel.find((s) => s.key === "won")?.count).toBe(4);
  });

  it("counts every contacted status, including the ones that ended badly", () => {
    const funnel = buildFunnel(
      counts({ sent: 30, bounced: 5, not_interested: 5, replied: 10 }),
      0,
    );
    expect(funnel.find((s) => s.key === "contacted")?.count).toBe(50);
  });

  it("treats a connected call and an email reply as the same stage", () => {
    const funnel = buildFunnel(
      counts({ replied: 3, connected: 2, meeting_booked: 1 }),
      0,
    );
    expect(funnel.find((s) => s.key === "engaged")?.count).toBe(6);
  });

  it("says 'nothing to measure' rather than 0% when the stage above is empty", () => {
    // 25 enrolled, nobody contacted: 'contacted' is a MEASURED zero (0 of 25),
    // but 'engaged' has no denominator at all and must not claim one.
    const funnel = buildFunnel({ total: 25 }, 0);
    const contacted = funnel.find((s) => s.key === "contacted");
    expect(contacted?.conversionPct).toBe(0);
    expect(contacted?.verdict).toContain("Nobody has reached this stage");

    const engaged = funnel.find((s) => s.key === "engaged");
    expect(engaged?.conversionPct).toBeNull();
    expect(engaged?.verdict).toContain("nothing to measure");
    expect(engaged?.verdict).not.toContain("0%");
  });

  it("reports conversion against the stage directly above", () => {
    const funnel = buildFunnel(counts({ sent: 40, replied: 10 }), 0);
    // contacted = 50 of 100 enrolled; engaged = 10 of 50 contacted.
    expect(funnel.find((s) => s.key === "contacted")?.conversionPct).toBe(50);
    expect(funnel.find((s) => s.key === "engaged")?.conversionPct).toBe(20);
  });

  it("an empty campaign never claims a rate", () => {
    const funnel = buildFunnel({ total: 0 }, 0);
    expect(funnel.every((stage) => stage.ofEnrolledPct === null)).toBe(true);
    expect(funnel[0].verdict).toContain("Nobody is enrolled");
  });
});

describe("exits", () => {
  it("states the denominator it used", () => {
    const exits = buildExits({ total: 100, sent: 40, bounced: 10 });
    const bounced = exits.find((exit) => exit.status === "bounced");
    expect(bounced?.count).toBe(10);
    expect(bounced?.ofContactedPct).toBe(20); // 10 of 50 contacted
    expect(bounced?.verdict).toContain("of 50 contacted");
  });

  it("refuses to compute a share when nobody was contacted", () => {
    const exits = buildExits({ total: 30 });
    expect(exits.every((exit) => exit.ofContactedPct === null)).toBe(true);
  });
});

describe("the win trend", () => {
  it("buckets by the Monday of the week", () => {
    // 2026-08-12 is a Wednesday; its Monday is 2026-08-10.
    expect(weekBucket("2026-08-12T09:00:00Z")).toBe("2026-08-10");
    expect(weekBucket("2026-08-10T00:00:00Z")).toBe("2026-08-10");
  });

  it("keeps confirmed and proposed apart", () => {
    const points = buildOutcomeTrend([
      { matched_at: "2026-08-12T09:00:00Z", status: "confirmed" },
      { matched_at: "2026-08-13T09:00:00Z", status: "proposed" },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ confirmed: 1, proposed: 1 });
  });

  it("never re-counts a rejected credit", () => {
    const points = buildOutcomeTrend([
      { matched_at: "2026-08-12T09:00:00Z", status: "rejected" },
    ]);
    expect(points).toHaveLength(0);
  });

  it("ignores a row with no timestamp rather than inventing one", () => {
    expect(buildOutcomeTrend([{ matched_at: null, status: "confirmed" }])).toHaveLength(0);
  });

  it("returns buckets in time order", () => {
    const points = buildOutcomeTrend([
      { matched_at: "2026-08-19T09:00:00Z", status: "confirmed" },
      { matched_at: "2026-08-05T09:00:00Z", status: "confirmed" },
    ]);
    expect(points.map((p) => p.bucket)).toEqual(["2026-08-03", "2026-08-17"]);
  });
});

describe("the org rollup", () => {
  const campaign = (name: string, counts: StatusCounts, wins: number) =>
    buildCampaignRollup({
      campaignId: name,
      name,
      status: "active",
      counts,
      wins,
    });

  it("totals agree with the rows beneath them", () => {
    const rows = [
      campaign("a", { total: 100, sent: 50, replied: 10 }, 2),
      campaign("b", { total: 50, sent: 20, replied: 5 }, 1),
    ];
    const totals = buildOrgTotals(rows);
    expect(totals.enrolled).toBe(150);
    expect(totals.contacted).toBe(rows[0].contacted + rows[1].contacted);
    expect(totals.wins).toBe(3);
  });

  it("an org that has sent nothing has no engagement rate", () => {
    const totals = buildOrgTotals([campaign("a", { total: 10 }, 0)]);
    expect(totals.engagementPct).toBeNull();
    expect(totals.headline).toContain("have not started");
  });

  it("no campaigns at all says so plainly", () => {
    expect(buildOrgTotals([]).headline).toBe("No campaigns yet.");
  });
});
