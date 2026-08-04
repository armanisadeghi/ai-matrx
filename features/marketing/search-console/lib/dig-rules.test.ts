/**
 * Dig rule vocabulary — the client mirror of the `seo.gsc_perf_dig` server
 * whitelist. Parsing must fail loudly (never silently drop a condition),
 * validation must mirror every server RAISE, and the content key must be
 * stable so react-query re-runs exactly when the draft changes.
 */
import {
  digRuleContentKey,
  digRuleSummary,
  metricRequiresCompare,
  parseDigConditions,
  ruleRequiresCompare,
  serializeDigConditions,
  validateDigRule,
  type GscDigRuleContent,
} from "./dig-rules";

const RULE: GscDigRuleContent = {
  dimension: "query",
  conditions: [
    { metric: "position", op: "gte", value: 8 },
    { metric: "position", op: "lte", value: 20 },
    { metric: "impressions", op: "gt", value: 500 },
  ],
  sortMetric: "impressions",
  sortDir: "desc",
  rowLimit: 100,
  baseFilters: {},
};

describe("parseDigConditions", () => {
  it("round-trips the serialized shape", () => {
    const parsed = parseDigConditions(
      serializeDigConditions(RULE.conditions),
    );
    expect(parsed).toEqual({ ok: true, conditions: RULE.conditions });
  });

  it("fails the WHOLE parse on one bad entry (no silent drops)", () => {
    expect(
      parseDigConditions([
        { metric: "position", op: "gte", value: 8 },
        { metric: "clicks; DROP TABLE x", op: "gt", value: 1 },
      ]).ok,
    ).toBe(false);
    expect(
      parseDigConditions([{ metric: "clicks", op: "gt", value: "5" }]).ok,
    ).toBe(false);
    expect(parseDigConditions({ metric: "clicks" }).ok).toBe(false);
  });
});

describe("compare requirements", () => {
  it("flags cmp_/delta_ metrics only", () => {
    expect(metricRequiresCompare("clicks")).toBe(false);
    expect(metricRequiresCompare("cmp_clicks")).toBe(true);
    expect(metricRequiresCompare("delta_clicks_pct")).toBe(true);
  });

  it("a rule needs compare when any condition OR the sort does", () => {
    expect(ruleRequiresCompare(RULE)).toBe(false);
    expect(
      ruleRequiresCompare({ ...RULE, sortMetric: "delta_clicks" }),
    ).toBe(true);
    expect(
      ruleRequiresCompare({
        ...RULE,
        conditions: [{ metric: "delta_clicks_pct", op: "lt", value: -20 }],
      }),
    ).toBe(true);
  });
});

describe("validateDigRule", () => {
  it("accepts the reference rule", () => {
    expect(validateDigRule(RULE, false)).toEqual([]);
  });

  it("rejects a compare-requiring rule without a compare period", () => {
    const errors = validateDigRule(
      { ...RULE, sortMetric: "delta_clicks" },
      false,
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(validateDigRule({ ...RULE, sortMetric: "delta_clicks" }, true)).toEqual(
      [],
    );
  });

  it("rejects out-of-range limits and oversized condition lists", () => {
    expect(validateDigRule({ ...RULE, rowLimit: 0 }, true)).not.toEqual([]);
    expect(validateDigRule({ ...RULE, rowLimit: 1001 }, true)).not.toEqual([]);
    expect(
      validateDigRule(
        {
          ...RULE,
          conditions: Array.from({ length: 21 }, () => ({
            metric: "clicks" as const,
            op: "gt" as const,
            value: 1,
          })),
        },
        true,
      ),
    ).not.toEqual([]);
  });
});

describe("digRuleContentKey", () => {
  it("changes when any content field changes, ignores blank filters", () => {
    const key = digRuleContentKey(RULE);
    expect(digRuleContentKey({ ...RULE })).toBe(key);
    expect(digRuleContentKey({ ...RULE, rowLimit: 50 })).not.toBe(key);
    expect(
      digRuleContentKey({ ...RULE, baseFilters: { query_contains: "  " } }),
    ).toBe(key);
    expect(
      digRuleContentKey({ ...RULE, baseFilters: { query_contains: "solar" } }),
    ).not.toBe(key);
  });
});

describe("digRuleSummary", () => {
  it("renders a readable one-liner", () => {
    expect(digRuleSummary(RULE.conditions)).toBe(
      "Position ≥ 8.0 · Position ≤ 20.0 · Impressions > 500",
    );
    expect(digRuleSummary([])).toBe("No conditions — everything matches");
  });
});
