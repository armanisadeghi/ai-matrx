import {
  backlinkAnalysisActionState,
  backlinkCaptureForUi,
  backlinkScreenshotFileId,
  hasBacklinkAssessment,
  parseBacklinkAssessment,
  providerExtras,
} from "./enrichment";

describe("backlink enrichment narrowers", () => {
  it("projects the resolved assessment without trusting arbitrary JSON", () => {
    const value = parseBacklinkAssessment({
      overall_score: 88,
      page_type: "resource",
      page_summary: "A useful industry resource.",
      topics: ["ITAD", 42, "data destruction"],
      source_target_relevance: { score: 93, verdict: "strong" },
      context_quality: { verdict: "adequate" },
      anchor_quality: { verdict: "good" },
      editorial_nature: { kind: "editorial" },
      controllability: { level: "possible", reasoning: "Publisher outreach" },
      risk: { verdict: "safe" },
      recommended_action: "request_edit",
      action_reason: "Ask for a more descriptive anchor.",
      priority: "medium",
      confidence: 82,
    });

    expect(value).toMatchObject({
      overallScore: 88,
      pageType: "resource",
      relevanceScore: 93,
      relevanceVerdict: "strong",
      controlLevel: "possible",
      action: "request_edit",
      riskVerdict: "safe",
      topics: ["ITAD", "data destruction"],
    });
  });

  it("keeps provider extras behind the evidence envelope", () => {
    expect(
      providerExtras({
        provider: "dataforseo",
        extras: { semantic_location: "article", is_broken: false },
      }),
    ).toEqual({ semantic_location: "article", is_broken: false });
    expect(providerExtras({ extras: "not-an-object" })).toBe("not-an-object");
  });

  it("distinguishes an absent assessment from persisted evidence", () => {
    expect(hasBacklinkAssessment({})).toBe(false);
    expect(hasBacklinkAssessment(null)).toBe(false);
    expect(hasBacklinkAssessment({ overall_score: 72 })).toBe(true);
  });

  it("removes internal cache identifiers from user-facing capture evidence", () => {
    expect(
      backlinkCaptureForUi({
        success: true,
        cache_key: "source-page:internal-key",
        cacheKey: "legacy-internal-key",
        title: "Useful resource",
      }),
    ).toEqual({ success: true, title: "Useful resource" });
  });

  it("resolves the canonical screenshot file identity", () => {
    expect(
      backlinkScreenshotFileId({ screenshot_file_id: "file-1" }),
    ).toBe("file-1");
    expect(backlinkScreenshotFileId({ screenshot_file_id: 42 })).toBeNull();
  });

  it("uses one controlled single-link action contract everywhere", () => {
    expect(backlinkAnalysisActionState("pending", false, false)).toMatchObject({
      disabled: false,
      label: "Analyze",
    });
    expect(
      backlinkAnalysisActionState("completed", false, false),
    ).toMatchObject({ disabled: false, label: "Re-analyze" });
    expect(backlinkAnalysisActionState("capturing", true, false)).toMatchObject(
      { disabled: true, inProgress: true, label: "Analyzing" },
    );
    expect(backlinkAnalysisActionState("pending", true, false)).toMatchObject({
      disabled: true,
      label: "Analyzing",
    });
  });
});
