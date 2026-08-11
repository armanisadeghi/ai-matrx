import type { Database } from "@/types/database.types";

export type ReputationCaseRow =
  Database["seo"]["Tables"]["reputation_case"]["Row"];

export type ReputationVerdict =
  | "protect"
  | "correct"
  | "respond"
  | "request_update"
  | "leave_alone"
  | "pitch"
  | "strengthen"
  | "monitor"
  | "investigate";

export type ReputationCaseStatus =
  | "open"
  | "accepted"
  | "in_progress"
  | "completed"
  | "dismissed"
  | "monitoring";

export interface ReputationEvidenceRef {
  source_kind: string;
  source_id: string | null;
  url: string | null;
  title: string | null;
  exact_excerpt: string;
  observed_at: string | null;
  supports: string;
}

export interface ReputationCaseArtifact {
  case_key: string;
  source_kind: string;
  source_id: string | null;
  source_url: string | null;
  source_domain: string | null;
  source_title: string | null;
  case_type: string;
  sentiment: string;
  verdict: ReputationVerdict;
  headline: string;
  summary: string;
  controllability: string;
  priority: number;
  confidence: number;
  evidence_quality: number;
  risk_score: number;
  opportunity_score: number;
  recommended_action: string;
  action_reason: string;
  pitch_angle: string | null;
  target_page_id: string | null;
  target_page_url: string | null;
  facts: string[];
  inferences: string[];
  evidence_refs: ReputationEvidenceRef[];
  contradictions: string[];
  missing_evidence: string[];
  requires_human_review: boolean;
}

export interface PublicationOpportunity {
  domain: string;
  publication_name: string;
  referring_domain_profile_id: string | null;
  relationship_basis: string;
  demonstrated_topics: string[];
  suggested_angle: string;
  supporting_assets: string[];
  confidence: number;
  evidence_refs: ReputationEvidenceRef[];
}

export interface ReputationNarrative {
  narrative: string;
  stance: string;
  verification_status: string;
  prevalence: string;
  severity: string;
  recommended_handling: string;
  evidence_refs: ReputationEvidenceRef[];
}

export interface ReputationBrief {
  __kind: "digital_pr_reputation_brief_v1";
  analyst_version: string;
  site_id: string;
  site_domain: string;
  executive_verdict: string;
  evidence_coverage: ReputationEvidenceHealth;
  cases: ReputationCaseArtifact[];
  publication_opportunities: PublicationOpportunity[];
  narratives: ReputationNarrative[];
  quality: {
    overall_confidence: number;
    accepted_cases: number;
    rejected_cases: number;
    accepted_publication_opportunities: number;
    rejected_publication_opportunities: number;
  };
  limitations: string[];
}

export interface ReputationEvidenceHealth {
  backlinks_reviewed: number;
  domains_reviewed: number;
  competitor_intersections_reviewed: number;
  ai_citations_reviewed: number;
  brand_facts_reviewed: number;
  rag_hits_reviewed: number;
  captured_pages_reviewed: number;
  excluded_low_quality_inputs: number;
}

export interface ReputationInventory {
  enrichedBacklinks: number;
  referringDomains: number;
  competitorOpportunities: number;
  aiCitations: number;
  aiClaims: number;
  businessFacts: number;
}

export interface ReputationWorkspaceData {
  cases: ReputationCaseRow[];
  latestBrief: ReputationBrief | null;
  latestKindInstanceId: string | null;
  inventory: ReputationInventory;
}
