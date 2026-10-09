/**
 * The news engine's six reader-facing kinds (NEWS-ENGINE-SPEC §6, items 11–16):
 * compiled in, routed to ONE block, bridged verbatim (markers kept), and the
 * digest/triage views render a real run's shape — every watch reason named,
 * never a bare count.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { envelopeFromCompleteValue, KIND_KEY } from "@ai-matrx/content-ir";

import {
  resolveBlockDispatch,
} from "@ai-matrx/rich-content/display/chat-markdown/block-registry/block-dispatch";
import { APP_BLOCK_DISPATCH_CLASSIFICATION } from "@/features/rich-content-host/domain-block-dispatch";
import { NewsDigestView } from "@/features/marketing/news-monitor/kinds/NewsDigestView";
import { NewsTriageView } from "@/features/marketing/news-monitor/kinds/NewsTriageView";
import { readSetAside } from "@/features/marketing/news-monitor/run-document";

import {
  NEWS_MONITOR_BLOCK_TYPE,
  NEWS_MONITOR_KIND_DEFINITIONS,
  NEWS_MONITOR_KINDS,
} from "../kinds/news-monitor";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";

jest.mock("@/components/cost/useCostDisplay", () => ({
  useCostDisplay: () => ({ format: (usd: number) => jest.requireActual("@ai-matrx/kit/format").formatUsd(usd) }),
}));

/** Trimmed from a live run (workflow run 225b81d6, All Green Recycling test monitor). */
const DIGEST = {
  [KIND_KEY]: "news_digest",
  run_id: "225b81d6-f5f8-4d64-b078-9ad9a7251b11",
  brand_id: "c2db36a1-15b5-4717-b8d6-161600aa5db7",
  run_generated_at: "2026-09-28T23:12:06Z",
  window: { [KIND_KEY]: "news_digest_window", hours: 24, cutoff: "2026-09-27T23:12:06Z" },
  mode: "digest_every_run",
  headline: { [KIND_KEY]: "news_digest_headline", surfaced: 2, stale: 10, unverified_by_status: { unverified_no_corroboration: 6 } },
  surfaced: [{ [KIND_KEY]: "news_digest_surfaced", story_key: "03c4d44f6e9fa7e2", title: "Why Is Geospatial Data Analysis Crucial for Disaster Management?", outlet_count: 1 }],
  watch: [
    {
      [KIND_KEY]: "news_digest_watch",
      story_key: "487f02fb3ebce0c4",
      title: "State Rep. Sheehan sponsors free shred event and food drive in Mokena",
      outlet_count: 1,
      top_outlets: ["shawlocal.com"],
      story_size_band: "moderate",
      reason: "unverified_no_corroboration",
      label: "freshness unverified — not independently corroborated",
      detail: "1 independent corroborating domain(s) of the 2 required",
    },
  ],
  source_health: [{ [KIND_KEY]: "news_digest_source_health", source_kind: "google_news", status: "ok", items: 58 }],
  cost: { [KIND_KEY]: "news_digest_cost", run_usd: 0.056, month_to_date_usd: 6.25, ceiling_usd: 25 },
};

describe("news monitor kinds — registration", () => {
  it("compiles in all six with the one news block, which the dispatch table routes as a shape", () => {
    for (const kind of Object.values(NEWS_MONITOR_KINDS)) {
      const def = SYSTEM_KIND_DEFINITIONS.find((d) => d.kind === kind);
      expect(def?.legacyBlockType).toBe(NEWS_MONITOR_BLOCK_TYPE);
    }
    expect(resolveBlockDispatch(NEWS_MONITOR_BLOCK_TYPE)).not.toBeNull();
    expect(APP_BLOCK_DISPATCH_CLASSIFICATION.shape).toContain(NEWS_MONITOR_BLOCK_TYPE);
  });

  it("bridges the value verbatim, marker included, and only for its own kind", () => {
    const def = NEWS_MONITOR_KIND_DEFINITIONS.find((d) => d.kind === "news_digest");
    const envelope = envelopeFromCompleteValue(DIGEST, "news_digest");
    const data = def?.toLegacyServerData?.(envelope) as { value: Record<string, unknown> } | undefined;
    expect(data?.value[KIND_KEY]).toBe("news_digest");
    expect(data?.value.run_id).toBe(DIGEST.run_id);
    const triage = NEWS_MONITOR_KIND_DEFINITIONS.find((d) => d.kind === "news_triage");
    expect(triage?.toLegacyServerData?.(envelope)).toBeUndefined();
  });
});

describe("news monitor kinds — views", () => {
  it("the digest lists each watch story with its reason and detail, and names live sources", () => {
    const html = renderToStaticMarkup(<NewsDigestView value={DIGEST} />);
    expect(html).toContain("State Rep. Sheehan sponsors free shred event");
    expect(html).toContain("freshness unverified — not independently corroborated");
    expect(html).toContain("1 independent corroborating domain(s) of the 2 required");
    expect(html).toContain("Google News");
    expect(html).toContain("58 items");
  });

  it("triage groups by tier and shows the standing rationale", () => {
    const html = renderToStaticMarkup(
      <NewsTriageView
        value={{
          [KIND_KEY]: "news_triage",
          summary: { [KIND_KEY]: "news_triage_summary", input_count: 1, watch_count: 1 },
          triaged: [
            {
              [KIND_KEY]: "news_triaged_signal",
              signal_id: "c5cf6fcd19aa6aaa",
              signal_title: "AI benchmark leaderboard update",
              tier: "watch",
              standing: "none",
              watch_reason: "no_client_standing",
              standing_rationale: "No bridge to e-waste recycling.",
            },
          ],
        }}
      />,
    );
    // c993b0ce0f renamed the tier heading so it never reads as the watch list.
    expect(html).toContain("Context (not the watch list) · 1");
    expect(html).toContain("No bridge to e-waste recycling.");
    expect(html).toContain("No Client Standing");
  });

  it("set-aside lists carry counts AND lists, and say when the run kept counts only", () => {
    const lists = readSetAside({
      runId: "r",
      nodeId: "deliver",
      summary: { counts: { coarse_rejected: 1, s2_dropped: { older_than_max_age: 12 } } },
      digest: null,
      report: null,
      triage: null,
      angleSets: [],
      verdicts: {},
      clientContext: null,
      withheld: [],
      diagnostics: { below_floor_by_lane: { major_news_unmatched: 41 }, below_floor: ["a1"], seen_skipped: [] },
      rejected: [{ signal_id: "x", signal_title: "Off-beat story", reason: "off_beat", evidence_urls: ["https://example.org/a"] }],
      preGated: [],
      notices: [],
      stages: [],
    });
    const byId = Object.fromEntries(lists.map((l) => [l.id, l]));
    expect(byId.rejected.items[0].title).toBe("Off-beat story");
    expect(byId.below_floor.count).toBe(41);
    expect(byId.below_floor.ids).toEqual(["a1"]);
    expect(byId.s2_dropped.count).toBe(12);
    expect(byId.s2_dropped.listed).toBe(false);
  });
});
