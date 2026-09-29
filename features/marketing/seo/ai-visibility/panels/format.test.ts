import {
  aidedStatusName,
  artifactName,
  bandName,
  engineName,
  formatComparison,
  formatMetricValue,
  groupMetrics,
  ladderRung,
  laneName,
  methodText,
  panelStatusInfo,
  partitionName,
  pivotByAidedStatus,
  sampleSizeText,
  stratumLabel,
} from "./format";
import type { MetricEstimate, MetricStratum } from "./types";

const stratum = (over: Partial<MetricStratum> = {}): MetricStratum => ({
  partition: "core",
  lane: "retrieval",
  aided_status: "unaided",
  engine: "chat_gpt",
  locale: null,
  market_side: null,
  wave_id: null,
  ...over,
});

const estimate = (over: Partial<MetricEstimate> = {}): MetricEstimate => ({
  metric: "unaided_brand_presence",
  display_name: "Named, unprompted",
  does_not_prove: "market share, awareness, audience reach, or revenue attribution",
  stratum: stratum(),
  numerator: 9,
  denominator: 40,
  distinct_slots: 24,
  valid_observations: 40,
  invalid_observations: 0,
  rate: 0.225,
  interval: { low: 0.12, high: 0.38, method: "wilson", level: 0.95 },
  shown_as: "rate",
  effective_sample_size: null,
  ...over,
});

describe("formatMetricValue", () => {
  it("shows a rate with its interval when the server says rate", () => {
    expect(formatMetricValue(estimate())).toEqual({
      kind: "rate",
      value: "23%",
      detail: "12% to 38%",
    });
  });

  it("shows counts, never a percentage, when there are too few slots", () => {
    const text = formatMetricValue(
      estimate({ shown_as: "counts", numerator: 3, denominator: 11, distinct_slots: 7, rate: null }),
      20,
    );
    expect(text.kind).toBe("counts");
    expect(text.value).toBe("3 of 11 answers");
    expect(text.detail).toBe(
      "7 question slots — too few for a percentage (needs 20 question slots)",
    );
    expect(`${text.value} ${text.detail}`).not.toMatch(/%/);
  });

  it("reads 'Not set up' for campaign response, never zero", () => {
    const text = formatMetricValue(
      estimate({ metric: "campaign_response", shown_as: "not_set_up", rate: null, numerator: null, denominator: null }),
    );
    expect(text.value).toBe("Not set up");
    expect(text.value).not.toMatch(/0/);
  });

  it("reads 'Not measured yet' for unmeasured, never 0%", () => {
    expect(
      formatMetricValue(estimate({ shown_as: "unmeasured", rate: null, numerator: null, denominator: null })).value,
    ).toBe("Not measured yet");
  });

  it("refuses to invent a number the server left null", () => {
    expect(formatMetricValue(estimate({ shown_as: "rate", rate: null })).value).toBe(
      "Not measured yet",
    );
    expect(
      formatMetricValue(estimate({ shown_as: "counts", numerator: null, denominator: null })).value,
    ).toBe("Not measured yet");
  });

  it("keeps a real zero rate as 0% — zero is a measurement, null is not", () => {
    expect(formatMetricValue(estimate({ rate: 0, interval: null })).value).toBe("0%");
  });
});

describe("sample size and method", () => {
  it("names valid answers, slots, invalid ones and effective size", () => {
    expect(
      sampleSizeText(
        estimate({ valid_observations: 40, distinct_slots: 24, invalid_observations: 2, effective_sample_size: 31.44 }),
      ),
    ).toBe("40 valid answers · 24 question slots · 2 invalid left out · effective size 31.4");
  });

  it("says how each kind of value was made", () => {
    expect(methodText(estimate())).toBe("95% interval, wilson");
    expect(methodText(estimate({ shown_as: "counts" }), 20)).toBe(
      "Counts only — under 20 distinct question slots",
    );
    expect(methodText(estimate({ shown_as: "not_set_up" }))).toMatch(/campaign test/);
  });
});

describe("display names", () => {
  it("maps every contract code to its display name", () => {
    expect(partitionName("core")).toBe("tracked set");
    expect(partitionName("rotating")).toBe("discovery set");
    expect(partitionName("sentinel")).toBe("tripwire");
    expect(partitionName("control")).toBe("false-positive check");
    expect(partitionName("aided")).toBe("prompted set");
    expect(laneName("closed_model")).toBe("no web access");
    expect(laneName("retrieval")).toBe("with web search");
    expect(laneName("consumer_surface")).toBe("the real app");
    expect(laneName("campaign_experiment")).toBe("campaign test");
    expect(aidedStatusName("unaided")).toBe("unprompted");
    expect(aidedStatusName("target_aided")).toBe("we're named");
    expect(aidedStatusName("category_aided")).toBe("category named");
    expect(aidedStatusName("competitor_aided")).toBe("competitors named");
    expect(["B0", "B1", "B2", "B3", "B4", "B5"].map(bandName)).toEqual([
      "Brand",
      "Shortlist",
      "Category",
      "Problem",
      "Goal",
      "Market",
    ]);
    expect(engineName("chat_gpt")).toBe("ChatGPT");
    expect(artifactName("icp_hypotheses")).toBe("Customer profiles");
  });

  it("never shows an unknown code raw with underscores", () => {
    expect(laneName("new_lane_kind")).toBe("new lane kind");
    expect(partitionName(null)).toBeNull();
  });

  it("builds a stratum label from display names only", () => {
    const label = stratumLabel(stratum({ wave_id: "2026-09-20" }));
    expect(label).toBe("tracked set · with web search · ChatGPT · wave 2026-09-20");
    expect(label).not.toMatch(/core|retrieval|chat_gpt|unaided/);
  });

  it("explains every panel status", () => {
    expect(panelStatusInfo("provisional_directional").label).toBe("Provisional");
    expect(panelStatusInfo("frozen").label).toBe("Frozen");
    expect(panelStatusInfo("draft").label).toBe("Draft");
    expect(panelStatusInfo(null).explanation).toMatch(/typed in by hand/);
  });
});

describe("grouping never pools", () => {
  it("keeps every metric, in order, even with no estimates", () => {
    const groups = groupMetrics([estimate()]);
    expect(groups.map((g) => g.metric)).toEqual([
      "unaided_brand_presence",
      "aided_brand_knowledge",
      "competitive_mention_share",
      "citation_presence",
      "answer_framing",
      "campaign_response",
    ]);
    expect(groups[0].estimates).toHaveLength(1);
    expect(groups[1].estimates).toHaveLength(0);
    expect(groups[1].displayName).toBe("Known when named");
  });

  it("puts unprompted and we're-named side by side in one row, as separate cells", () => {
    const unaided = estimate({ stratum: stratum({ aided_status: "unaided" }), rate: 0.2 });
    const aided = estimate({ stratum: stratum({ aided_status: "target_aided" }), rate: 0.9 });
    const pivot = pivotByAidedStatus([aided, unaided]);
    expect(pivot.columns).toEqual(["unaided", "target_aided"]);
    expect(pivot.rows).toHaveLength(1);
    expect(pivot.rows[0].cells).toEqual([unaided, aided]);
  });
});

describe("paired comparisons", () => {
  it("reads as change on unchanged slots with its interval", () => {
    expect(
      formatComparison({
        metric: "unaided_brand_presence",
        stratum: stratum(),
        from_wave: "w1",
        to_wave: "w2",
        overlap_slots: 14,
        change: 0.06,
        interval: { low: -0.02, high: 0.14, method: "bootstrap", level: 0.95 },
      }),
    ).toBe("change on 14 unchanged question slots: +6 points (−2 to +14)");
  });

  it("says not measured when the change is null", () => {
    expect(
      formatComparison({
        metric: "citation_presence",
        stratum: stratum(),
        from_wave: "w1",
        to_wave: "w2",
        overlap_slots: 0,
        change: null,
        interval: null,
      }),
    ).toBe("change on 0 unchanged question slots: not measured yet");
  });
});

describe("metric definitions and ladder", () => {
  it("an unmeasured metric still carries its does-not-prove line from the definitions", () => {
    const groups = groupMetrics([], [
      {
        metric: "citation_presence",
        display_name: "Cited as a source",
        numerator: "n",
        denominator: "d",
        does_not_prove: "traffic, clicks, or that the citation shaped the answer",
      },
    ]);
    const cited = groups.find((g) => g.metric === "citation_presence");
    expect(cited?.doesNotProve).toMatch(/traffic/);
    expect(cited?.estimates).toHaveLength(0);
  });
  it("strips the server's own rung numbers so the list is not numbered twice", () => {
    expect(ladderRung("1. A mention")).toBe("A mention");
  });
});
