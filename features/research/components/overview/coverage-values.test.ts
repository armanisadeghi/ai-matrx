/**
 * D6/D15 — the coverage-audit mirror: the persisted
 * `rs_topic.metadata.coverage_audit` JSON parsed defensively, and the pure
 * builder that rebuilds it as a canonical `research_coverage_audit` kind
 * value (wire keys + nested `__kind` tags) for `KindInstanceRender`.
 */
import { coverageAuditValue, parseCoverageAudit } from "./coverage-values";

const persisted = {
  coverage_audit: {
    coverage_verdict: "partial",
    summary: "Pricing evidence is thin.",
    gaps: [
      {
        missing: "Competitor pricing",
        why_it_matters: "Positioning claims rest on one blog post.",
        severity: "critical",
        suggested_queries: ["acme pricing 2026", "acme enterprise plan cost"],
      },
    ],
  },
};

describe("parseCoverageAudit", () => {
  it("reads the persisted audit off topic metadata", () => {
    expect(parseCoverageAudit(persisted)).toEqual({
      coverage_verdict: "partial",
      summary: "Pricing evidence is thin.",
      gaps: [
        {
          missing: "Competitor pricing",
          why_it_matters: "Positioning claims rest on one blog post.",
          severity: "critical",
          suggested_queries: [
            "acme pricing 2026",
            "acme enterprise plan cost",
          ],
        },
      ],
    });
  });

  it("returns null when no audit is stored — never a fabricated verdict", () => {
    expect(parseCoverageAudit(null)).toBeNull();
    expect(parseCoverageAudit({})).toBeNull();
    expect(parseCoverageAudit({ coverage_audit: "yes" })).toBeNull();
  });

  it("rejects an unknown verdict outright", () => {
    expect(
      parseCoverageAudit({ coverage_audit: { coverage_verdict: "great" } }),
    ).toBeNull();
  });

  it("sanitizes junk gaps instead of crashing", () => {
    const audit = parseCoverageAudit({
      coverage_audit: {
        coverage_verdict: "insufficient",
        summary: 42,
        gaps: [
          "not-an-object",
          {
            missing: "X",
            severity: "catastrophic",
            suggested_queries: ["q1", 7, "  ", "q2"],
          },
        ],
      },
    });
    expect(audit).toEqual({
      coverage_verdict: "insufficient",
      summary: "",
      gaps: [
        {
          missing: "X",
          why_it_matters: "",
          severity: "important",
          suggested_queries: ["q1", "q2"],
        },
      ],
    });
  });
});

describe("coverageAuditValue", () => {
  it("emits the kind's wire shape with nested __kind tags", () => {
    const audit = parseCoverageAudit(persisted);
    expect(audit).not.toBeNull();
    expect(coverageAuditValue(audit!)).toEqual({
      __kind: "research_coverage_audit",
      coverage_verdict: "partial",
      summary: "Pricing evidence is thin.",
      gaps: [
        {
          __kind: "coverage_gap",
          missing: "Competitor pricing",
          severity: "critical",
          why_it_matters: "Positioning claims rest on one blog post.",
          suggested_queries: [
            "acme pricing 2026",
            "acme enterprise plan cost",
          ],
        },
      ],
    });
  });
});
