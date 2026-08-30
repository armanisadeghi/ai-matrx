import type { CompetitorOpportunityRow } from "./data";
import {
  competitorOpportunityCopyRow,
  competitorOpportunityHuman,
} from "./copy";

const opportunity = {
  id: "opp-1",
  title: "Publish a comparison page",
  status: "open",
  priority: 91,
  opportunity_type: "content_gap",
  competitor_id: "competitor-1",
  competitor_domain: "rival.example",
  competitor_url: "https://rival.example",
  target_page_id: null,
  target_page_url: null,
  primary_keyword: "enterprise automation",
  impact: "high",
  effort: "medium",
  confidence: 0.87,
  recommended_action: "Publish a direct comparison.",
  verdict: "The rival owns this decision-stage query.",
  why_competitor_wins: "Its page answers the comparison explicitly.",
  current_advantage: "Our product has stronger workflow depth.",
  evidence: ["Rival ranks #2", "Our site has no matching page"],
} as CompetitorOpportunityRow;

describe("competitor opportunity copy", () => {
  it("projects the table row and record-window evidence without raw metadata", () => {
    expect(competitorOpportunityCopyRow(opportunity)).toEqual({
      id: "opp-1",
      title: "Publish a comparison page",
      status: "open",
      priority: 91,
      opportunity_type: "content_gap",
      competitor: {
        id: "competitor-1",
        domain: "rival.example",
        url: "https://rival.example",
      },
      target_page: { id: null, url: null },
      primary_keyword: "enterprise automation",
      impact: "high",
      effort: "medium",
      confidence: 0.87,
      recommended_action: "Publish a direct comparison.",
      verdict: "The rival owns this decision-stage query.",
      why_competitor_wins: "Its page answers the comparison explicitly.",
      current_advantage: "Our product has stronger workflow depth.",
      evidence: ["Rival ranks #2", "Our site has no matching page"],
    });
  });

  it("uses the same rendered labels and New asset fallback as the workspace", () => {
    const human = competitorOpportunityHuman(opportunity);

    expect(human).toContain("Opportunity: Publish a comparison page");
    expect(human).toContain("Your page: New asset");
    expect(human).toContain(
      "Evidence: Rival ranks #2; Our site has no matching page",
    );
  });
});
