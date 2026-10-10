import { currentInsightDays, summarizeInsights, insightText, INSIGHT_METRICS } from "../insights";
import { judgeConnection } from "../connection-state";

const base = {
  provider: "pinterest_v5",
  followers: null, follower_delta: null, views: null, impressions: null, reach: null, profile_visits: null,
  engagements: null, likes: null, comments: null, shares: null, saves: null, watch_time_minutes: null, link_clicks: null,
  extras: {},
};

describe("account insights", () => {
  it("keeps the newest observation per account and day", () => {
    const days = currentInsightDays([
      { ...base, tracked_account_id: "a", date: "2026-10-01", observed_at: "2026-10-02T00:00:00Z", impressions: 5 },
      { ...base, tracked_account_id: "a", date: "2026-10-01", observed_at: "2026-10-03T00:00:00Z", impressions: 9 },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].values.impressions).toBe(9);
  });

  it("never turns a missing figure into zero", () => {
    const days = currentInsightDays([
      { ...base, tracked_account_id: "a", date: "2026-10-01", observed_at: "2026-10-02T00:00:00Z", impressions: 5, extras: { pin_clicks: 2 } },
      { ...base, tracked_account_id: "a", date: "2026-10-02", observed_at: "2026-10-03T00:00:00Z", impressions: 7 },
    ]);
    const s = summarizeInsights("a", days);
    expect(s.values.impressions).toBe(12);
    expect(s.values.pin_clicks).toBe(2);
    expect(s.values.reach).toBeNull();
    expect(s.values.followers).toBeNull();
    expect(insightText(s.values.reach, String)).toBe("Not available");
  });

  it("takes the newest standing count and a zero is a real zero", () => {
    const days = currentInsightDays([
      { ...base, tracked_account_id: "a", date: "2026-10-01", observed_at: "x1", followers: 10, saves: 0 },
      { ...base, tracked_account_id: "a", date: "2026-10-02", observed_at: "x2", followers: 12, saves: 0 },
    ]);
    const s = summarizeInsights("a", days);
    expect(s.values.followers).toBe(12);
    expect(s.values.saves).toBe(0);
  });

  it("an account with no rows has every figure unavailable", () => {
    const s = summarizeInsights("none", []);
    expect(INSIGHT_METRICS.every((m) => s.values[m.id] === null)).toBe(true);
  });
});

describe("connection state", () => {
  const cfg = (provider: "pinterest", accessMode?: "internal_test" | "approved" | "unavailable", status: "available" | "unavailable" = "available") =>
    [{ provider, status, scopes: [], accessMode }];
  it("connected wins, reconnect next", () => {
    expect(judgeConnection("pinterest", [{ id: "1", provider: "pinterest", status: "connected", resourceTypes: [] }], []).state).toBe("connected");
    const r = judgeConnection("pinterest", [{ id: "1", provider: "pinterest", status: "needs_attention", resourceTypes: [] }], []);
    expect(r.state).toBe("reconnect");
    expect(r.connectionId).toBe("1");
  });
  it("offers, tester-only and not-offered are told apart", () => {
    expect(judgeConnection("pinterest", [], cfg("pinterest", "approved")).state).toBe("not_connected");
    // Test-mode app: a customer sees "Coming soon"; only our own team can connect.
    expect(judgeConnection("pinterest", [], cfg("pinterest", "internal_test")).state).toBe("not_offered");
    expect(judgeConnection("pinterest", [], cfg("pinterest", "internal_test")).canConnect).toBe(false);
    expect(judgeConnection("pinterest", [], cfg("pinterest", "internal_test"), null, true).state).toBe("testers_only");
    expect(judgeConnection("pinterest", [], cfg("pinterest", undefined, "unavailable")).state).toBe("not_offered");
    expect(judgeConnection("pinterest", [], cfg("pinterest", undefined, "unavailable")).canConnect).toBe(false);
  });
  it("YouTube needs a Google connection that carries a channel", () => {
    expect(judgeConnection("youtube", [{ id: "g", provider: "google", status: "connected", resourceTypes: ["analytics_property"] }], []).state).toBe("not_connected");
    expect(judgeConnection("youtube", [{ id: "g", provider: "google", status: "connected", resourceTypes: ["youtube_channel"] }], []).state).toBe("connected");
  });
});

import { availablePostMetrics, currentOwnPostFigures, topOwnPosts } from "../insights";

const pm = {
  tracked_account_id: "a", provider: "pinterest_v5", post_id: null, observed_at: "2026-10-09T00:00:00Z",
  impressions: null, reach: null, saves: null, link_clicks: null, engagements: null, video_views: null, extras: {},
};

describe("per-post private figures", () => {
  it("keeps the newest day per post", () => {
    const f = currentOwnPostFigures([
      { ...pm, provider_post_id: "p1", observed_on: "2026-10-01", impressions: 5 },
      { ...pm, provider_post_id: "p1", observed_on: "2026-10-09", impressions: 9 },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].values.impressions).toBe(9);
  });

  it("ranks by the metric and never ranks a post without it as zero", () => {
    const f = currentOwnPostFigures([
      { ...pm, provider_post_id: "p1", observed_on: "2026-10-09", saves: 3, extras: { pin_clicks: 8 } },
      { ...pm, provider_post_id: "p2", observed_on: "2026-10-09", saves: 10 },
      { ...pm, provider_post_id: "p3", observed_on: "2026-10-09", impressions: 99 },
      { ...pm, provider_post_id: "p4", observed_on: "2026-10-09", saves: 0 },
    ]);
    expect(topOwnPosts(f, "saves", 5).map((x) => x.providerPostId)).toEqual(["p2", "p1", "p4"]);
    expect(topOwnPosts(f, "saves", 1)).toHaveLength(1);
    expect(topOwnPosts(f, "pin_clicks").map((x) => x.providerPostId)).toEqual(["p1"]);
    expect(topOwnPosts(f, "reach")).toEqual([]);
    expect(availablePostMetrics(f).map((m) => m.id)).toEqual(["impressions", "saves", "pin_clicks"]);
  });
});
