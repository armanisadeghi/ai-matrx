/**
 * THE REGRESSION ANCHOR.
 *
 * Appendix B of the source PRD is the only end-to-end worked example the
 * original spreadsheet left behind. If these numbers ever move, the engine has
 * silently stopped agreeing with fifteen years of the owner's judgement — which
 * is the one failure nobody would otherwise notice.
 */

import { evaluateLink } from "../engine";
import { applyCurve, interpolatePoints, roundHalfUp } from "../curves";
import { SHEET_2018_CONFIG } from "../configs/sheet-2018";
import { MATRX_V1_CONFIG } from "../configs/matrx-v1";
import type { EvaluationInput, SignalValue } from "../types";

const measured = (value: number | string): SignalValue => ({
  value,
  provenance: "api",
  confidence: 1,
});

/** Appendix B, verbatim. */
const APPENDIX_B: EvaluationInput = {
  domain: "example.com",
  target: { keyword: "", page: "", campaign: "" },
  values: {
    domain_authority: measured(36),
    url_rating: measured(40),
    domain_rating: measured(37),
    global_rank: measured(2_017_142),
    spam_score: measured(0),
    trust_links: measured(23),
    volume_links: measured(29),
    organic_traffic: measured(12_200),
    url_length: measured(9),
    spam_keywords: measured("No Spam"),
    is_us_site: measured("No"),
    tld: measured(".com"),
    topical_trust: measured(2),
    keyword_relevance: measured("No Relevance"),
    page_topic_relevance: measured("No Relevance"),
    promote_social: measured("No"),
    feature_placement: measured("Yes: Moderate Placement"),
    page_authority: measured(24),
  },
};

describe("2018 sheet parity — Appendix B", () => {
  const result = evaluateLink(SHEET_2018_CONFIG, APPENDIX_B);

  it("reproduces the Generic Quality Score", () => {
    expect(result.buckets.quality.score).toBeCloseTo(31.79, 2);
  });

  it("reproduces the Relevance Score", () => {
    expect(result.buckets.relevance.score).toBeCloseTo(3.73, 2);
  });

  it("reproduces the Total Score", () => {
    expect(result.totalScore).toBeCloseTo(35.52, 2);
  });

  it("reproduces the quality and relevance labels", () => {
    expect(result.labels.quality).toBe("Low Quality");
    expect(result.labels.relevance).toBe("Low Relevance");
  });

  it("reproduces the per-term contributions the sheet published", () => {
    const points = Object.fromEntries(
      result.terms.map((term) => [term.key, term.points]),
    );
    expect(points.q_domain_authority).toBeCloseTo(108, 6);
    expect(points.q_global_rank).toBeCloseTo(36.95, 2);
    expect(points.q_trust_shape).toBeCloseTo(162.17, 2);
    expect(points.q_traffic).toBeCloseTo(204.32, 2);
    expect(points.q_us_site).toBeCloseTo(-300, 6);
  });

  it("prices the link off the Max Link Value curve at the rounded score", () => {
    // round(35.52) = 36 -> $26 on the published curve.
    expect(result.money.maxValue).toBeCloseTo(26, 6);
    expect(result.money.roleCeilings.writer).toBeCloseTo(19.5, 2);
    expect(result.money.roleCeilings.guest_post_manager).toBeCloseTo(22.1, 2);
    expect(result.money.roleCeilings.seo_manager).toBeCloseTo(26, 6);
  });
});

describe("the 9-point money curve reproduces all 136 rows of Appendix A", () => {
  const checkpoints: readonly [number, number][] = [
    [24, 0],
    [25, 5],
    [30, 10],
    [34, 14],
    [35, 20],
    [36, 26],
    [37, 33],
    [40, 54],
    [41, 62],
    [45, 94],
    [46, 96],
    [50, 104],
    [60, 124],
    [70, 144],
    [85, 174],
    [100, 204],
    [135, 274],
  ];

  it.each(checkpoints)("score %i prices at $%i", (score, expected) => {
    expect(
      interpolatePoints(SHEET_2018_CONFIG.money.curve, score, true),
    ).toBeCloseTo(expected, 6);
  });
});

describe("unmeasured is never zero", () => {
  it("excludes a missing term instead of scoring it as worthless", () => {
    const withAuthority = evaluateLink(SHEET_2018_CONFIG, APPENDIX_B);
    const withoutAuthority = evaluateLink(SHEET_2018_CONFIG, {
      ...APPENDIX_B,
      values: {
        ...APPENDIX_B.values,
        domain_authority: { value: null, provenance: "default", confidence: 0 },
      },
    });
    const term = withoutAuthority.terms.find(
      (entry) => entry.key === "q_domain_authority",
    );

    expect(term?.status).toBe("missing");
    expect(term?.points).toBe(0);
    // ...and the engine says so out loud rather than pretending it knows.
    expect(withoutAuthority.confidence).toBeLessThan(withAuthority.confidence);
    expect(withoutAuthority.warnings.join(" ")).toContain("not supplied");
  });

  it("returns null rather than -Infinity for a log of zero", () => {
    expect(
      applyCurve({ kind: "logGain", base: 10, mult: 50, floorInput: 0 }, 0),
    ).toBeNull();
    expect(
      applyCurve(
        { kind: "logDrop", base: 10, ceiling: 10, mult: 10, floorInput: 0 },
        0,
      ),
    ).toBeNull();
  });

  it("never divides by zero on the trust/volume ratio", () => {
    const result = evaluateLink(SHEET_2018_CONFIG, {
      ...APPENDIX_B,
      values: { ...APPENDIX_B.values, trust_links: measured(0) },
    });
    const term = result.terms.find((entry) => entry.key === "q_trust_shape");
    expect(term?.status).toBe("missing");
    expect(Number.isFinite(result.totalScore)).toBe(true);
  });
});

describe("the discontinuity knob", () => {
  const trustCurve = SHEET_2018_CONFIG.terms.find(
    (term) => term.key === "q_trust_shape",
  )?.curve;

  const cliffAt = (ratio: number, smooth: boolean) => {
    if (!trustCurve || trustCurve.kind !== "segments")
      throw new Error("trust-shape curve missing");
    return applyCurve({ ...trustCurve, smooth }, ratio);
  };

  it("reproduces the original 100-point cliff when smoothing is off", () => {
    const below = cliffAt(1.099, false) ?? 0;
    const above = cliffAt(1.1, false) ?? 0;
    expect(below - above).toBeGreaterThan(90);
  });

  it("removes the cliff when smoothing is on", () => {
    const below = cliffAt(1.099, true) ?? 0;
    const above = cliffAt(1.1, true) ?? 0;
    expect(Math.abs(below - above)).toBeLessThan(5);
  });
});

describe("spreadsheet-compatible rounding", () => {
  it("rounds halves away from zero, not to even", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(3.5)).toBe(4);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(19.505, 2)).toBe(19.51);
  });
});

describe("matrx-v1 — the redesigned model", () => {
  it("collapses correlated authority inputs so a duplicate source cannot inflate the score", () => {
    const one = evaluateLink(MATRX_V1_CONFIG, {
      domain: "example.com",
      target: { keyword: "x", page: "y", campaign: "z" },
      values: { domain_authority: measured(60) },
    });
    const many = evaluateLink(MATRX_V1_CONFIG, {
      domain: "example.com",
      target: { keyword: "x", page: "y", campaign: "z" },
      values: {
        domain_authority: measured(60),
        domain_rating: measured(60),
        // 25 * log10(251) ≈ 60 — the same fact, stated in this signal's own units.
        referring_domains: measured(251),
        global_rank_percentile: measured(60),
      },
    });
    const group = (r: typeof one) =>
      r.groups.find((g) => g.key === "domain_authority");

    // Same underlying fact, four ways: the SCORE holds, CONFIDENCE rises.
    // Under the original sum-the-metrics model this would have quadrupled.
    expect(group(many)?.value).toBeCloseTo(group(one)?.value ?? 0, 0);
    expect(group(many)?.value ?? 0).toBeLessThan(100);
    expect(group(many)?.confidence).toBeGreaterThan(
      group(one)?.confidence ?? 0,
    );
  });

  it("rejects a candidate outright when a hard gate fires", () => {
    const result = evaluateLink(MATRX_V1_CONFIG, {
      domain: "spam.example",
      target: { keyword: "x", page: "y", campaign: "z" },
      values: { domain_authority: measured(80), spam_score: measured(95) },
    });
    expect(result.rejected).toBe(true);
    expect(result.money.maxValue).toBe(0);
  });

  it("scores placement promises outside relevance", () => {
    const relevanceTerms = MATRX_V1_CONFIG.terms.filter(
      (t) => t.bucket === "relevance",
    );
    expect(relevanceTerms.map((t) => t.key)).not.toContain(
      "p_feature_placement",
    );
    expect(relevanceTerms.map((t) => t.key)).not.toContain("r_page_authority");
  });
});
