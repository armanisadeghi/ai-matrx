export type AuthorityVerdict = "healthy" | "opportunities" | "urgent";
export type CannibalizationRisk = "none" | "low" | "medium" | "high";

export interface AuthorityPage {
  page_id: string;
  url: string;
  path: string | null;
  title: string | null;
  target_keyword: string | null;
  role: string;
  cluster: string | null;
  plan_priority: number | null;
  link_score: number | null;
  inbound_links: number;
  outbound_links: number;
  active_backlinks: number;
  dofollow_backlinks: number;
  backlink_quality: number | null;
  clicks: number;
  impressions: number;
  average_position: number | null;
  educational_clicks: number;
}

export interface AuthorityCandidate {
  candidate_key: string;
  source_page_id: string;
  target_page_id: string;
  source_url: string;
  target_url: string;
  score: number;
  source_supply: number;
  target_need: number;
  topical_overlap: number;
  estimated_equity_share: number;
  deterministic_cannibalization_risk: CannibalizationRisk;
  reasons: string[];
}

export interface AuthorityRecommendation {
  candidate_key: string;
  source_page_id: string;
  target_page_id: string;
  source_url: string;
  target_url: string;
  score: number;
  anchor_text: string;
  placement_quote: string | null;
  placement_instruction: string;
  rationale: string;
  expected_benefit: string;
  confidence: number;
  topical_relevance: "strong" | "moderate" | "weak" | "conflict";
  cannibalization_risk: CannibalizationRisk;
  cannibalization_reason: string | null;
  evidence: string[];
  warnings: string[];
}

export interface AuthorityRouterResult {
  result_kind: "authority.route";
  site_id: string;
  router_version: string;
  generated_at: string;
  pages_analyzed: number;
  edges_analyzed: number;
  edge_scan_truncated: boolean;
  backlink_scan_truncated: boolean;
  gsc_scan_truncated: boolean;
  executive_summary: string;
  overall_verdict: AuthorityVerdict;
  pages: AuthorityPage[];
  candidates: AuthorityCandidate[];
  recommendations: AuthorityRecommendation[];
  warnings: string[];
}

export interface AuthorityRunState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  requestId?: string;
  runId?: string;
  result?: AuthorityRouterResult;
  error?: string;
}
