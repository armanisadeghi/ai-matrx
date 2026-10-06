/**
 * The domain page's two pure decisions:
 *  - what an action costs, read from the LIVE `seo_domain` definition's words
 *    (the parameters below are the live row's `$variants` descriptions,
 *    2026-10-05), and "unknown" — never a guess — when the words change;
 *  - which screen state one tool outcome is, including the reuse probe:
 *    `over_max_cost` on a probe means "nothing stored" (offer the paid run),
 *    the same refusal on a paid run is an error, and a reused envelope carries
 *    the evidence run's date.
 */
import { pricesFromParameters, priceFromDescription } from "../prices";
import { sectionFromOutcome } from "../section-state";
import type { ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";

const LIVE_PARAMETERS = {
  $variants: {
    overview: {
      description:
        "Paid — about $0.04 per call; reuses a result up to 7 days old for free (backlinks are free from our stored summary for a site you manage). Estimated organic traffic…",
    },
    keyword_gap: { description: "Paid — about $0.02 per call; reuses a result up to 7 days old for free. Keywords competitor ranks for…" },
    ranked_keywords: {
      description:
        "Paid — about $0.02 per call; reuses a result up to 30 days old for free (about $0.13 at limit=1000). Organic keywords…",
    },
    serp_competitors: { description: "Paid — about $0.02 per call; reuses a result up to 7 days old for free. Which domains…" },
  },
};

describe("prices from the live tool definition", () => {
  it("reads each action's dollar cost and reuse window", () => {
    expect(pricesFromParameters(LIVE_PARAMETERS)).toEqual({
      overview: { costUsd: 0.04, reuseDays: 7 },
      ranked_keywords: { costUsd: 0.02, reuseDays: 30 },
      serp_competitors: { costUsd: 0.02, reuseDays: 7 },
      keyword_gap: { costUsd: 0.02, reuseDays: 7 },
    });
  });

  it("says unknown when the definition stops stating a price", () => {
    expect(priceFromDescription("Research any domain.")).toEqual({ costUsd: null, reuseDays: null });
    expect(pricesFromParameters(null).overview).toEqual({ costUsd: null, reuseDays: null });
  });
});

const envelope = (over: Partial<ToolEnvelope<{ as_of: string; n: number }>>): ToolEnvelope<{ as_of: string; n: number }> => ({
  __kind: "seo.tool_envelope",
  status: "ok",
  data: { as_of: "2026-09-28", n: 1 },
  cost: { class: "paid", estimate_usd: 0, charged_usd: 0, reused: true, reused_run_ids: ["run-1"] },
  evidence: [{ run_id: "run-1", observed_at: "2026-09-28T23:18:48Z", operation: "labs.google.domain_rank_overview" }],
  notices: [],
  ...over,
});

describe("one tool outcome to one screen state", () => {
  const overMax = {
    status: "error" as const,
    error: { error_type: "over_max_cost", message: "estimated at $0.04, above your max_cost_usd", suggested_action: null },
  };

  it("a refused probe means nothing stored; the same refusal on a paid run is an error", () => {
    expect(sectionFromOutcome(overMax, { probe: true })).toEqual({ kind: "not_stored", note: null });
    expect(sectionFromOutcome(overMax, { probe: false })).toEqual({
      kind: "error",
      message: "estimated at $0.04, above your max_cost_usd",
    });
  });

  it("a reused result carries the reuse verdict and the evidence run's date", () => {
    const state = sectionFromOutcome({ status: "ok", output: envelope({}), callId: "c" }, { probe: true });
    expect(state).toMatchObject({ kind: "ready", reused: true, observedAt: "2026-09-28T23:18:48Z", chargedUsd: 0, partial: false });
  });

  it("a bought result is not reused and states its charge", () => {
    const state = sectionFromOutcome(
      { status: "ok", output: envelope({ cost: { class: "paid", charged_usd: 0.0121, reused: false } }), callId: "c" },
      { probe: false },
    );
    expect(state).toMatchObject({ kind: "ready", reused: false, chargedUsd: 0.0121 });
  });

  it("partial keeps the data and names what is missing", () => {
    const state = sectionFromOutcome(
      { status: "ok", output: envelope({ status: "partial", notices: ["Backlink counts are unknown"] }), callId: "c" },
      { probe: false },
    );
    expect(state).toMatchObject({ kind: "ready", partial: true, notice: "Backlink counts are unknown" });
  });

  it("an envelope with no data is an error in the tool's own words", () => {
    const state = sectionFromOutcome(
      { status: "ok", output: envelope({ status: "unavailable", data: null, notices: ["Provider is down"] }), callId: "c" },
      { probe: true },
    );
    expect(state).toEqual({ kind: "error", message: "Provider is down" });
  });

  it("declining or closing the approval spends nothing and offers the run again", () => {
    expect(sectionFromOutcome({ status: "declined" }, { probe: false })).toMatchObject({ kind: "not_stored" });
    expect(sectionFromOutcome({ status: "dismissed" }, { probe: false })).toMatchObject({ kind: "not_stored" });
  });
});
