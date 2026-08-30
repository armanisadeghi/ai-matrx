import { humanLines } from "@/features/marketing/lib/copy-payloads";

import type { CompetitorOpportunityRow } from "./data";

function evidenceLines(row: CompetitorOpportunityRow): string[] {
  if (!Array.isArray(row.evidence)) return [];
  return row.evidence.map(String);
}

/**
 * The rendered opportunity table row plus its canonical record-window detail.
 * Keep this projection in step with `OpportunityDetail`: Copy for AI should
 * describe the evidence and recommendation the user sees, not dump storage
 * metadata that never appears in this workspace.
 */
export function competitorOpportunityCopyRow(
  row: CompetitorOpportunityRow,
) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    opportunity_type: row.opportunity_type,
    competitor: {
      id: row.competitor_id,
      domain: row.competitor_domain,
      url: row.competitor_url,
    },
    target_page: {
      id: row.target_page_id,
      url: row.target_page_url,
    },
    primary_keyword: row.primary_keyword,
    impact: row.impact,
    effort: row.effort,
    confidence: row.confidence,
    recommended_action: row.recommended_action,
    verdict: row.verdict,
    why_competitor_wins: row.why_competitor_wins,
    current_advantage: row.current_advantage,
    evidence: evidenceLines(row),
  };
}

export function competitorOpportunityHuman(
  row: CompetitorOpportunityRow,
): string {
  return humanLines([
    ["Opportunity", row.title],
    ["Status", row.status],
    ["Priority", row.priority],
    ["Type", row.opportunity_type],
    ["Competitor", row.competitor_domain],
    ["Your page", row.target_page_url ?? "New asset"],
    ["Primary keyword", row.primary_keyword],
    ["Impact", row.impact],
    ["Effort", row.effort],
    ["Confidence", row.confidence],
    ["Recommended action", row.recommended_action],
    ["Verdict", row.verdict],
    ["Why they win", row.why_competitor_wins],
    ["What you already have", row.current_advantage],
    ["Evidence", evidenceLines(row).join("; ")],
  ]);
}
