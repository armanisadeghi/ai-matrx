import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "decisions",
    label: "Decisions",
    description: "Evidence-gated reputation and digital PR cases.",
    sortOrder: 100,
  },
  {
    key: "opportunities",
    label: "Opportunities",
    description: "Publications and narratives grounded in observed evidence.",
    sortOrder: 200,
  },
  {
    key: "quality",
    label: "Evidence quality",
    description: "Coverage, exclusions, limitations, and run state.",
    sortOrder: 300,
  },
];

const values: SurfaceValue[] = [
  {
    group: "decisions",
    name: "reputation_cases",
    label: "Reputation cases",
    description:
      "Durable accepted cases with protect/correct/respond/request-update/leave-alone/pitch decisions, facts, inferences, evidence references, scores, and human lifecycle state.",
    valueType: "array",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 7000,
    sortOrder: 400,
  },
  {
    group: "opportunities",
    name: "publication_opportunities",
    label: "Publication opportunities",
    description:
      "Publications with demonstrated prior interest, topical overlap, a supportable angle, available assets, confidence, and resolvable evidence.",
    valueType: "array",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 3500,
    sortOrder: 410,
  },
  {
    group: "opportunities",
    name: "reputation_narratives",
    label: "Observed narratives",
    description:
      "Recurring narratives with stance, verification status, prevalence, severity, handling, and exact evidence references.",
    valueType: "array",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 3000,
    sortOrder: 420,
  },
  {
    group: "quality",
    name: "reputation_brief",
    label: "Latest evidence brief",
    description:
      "The latest validated Content IR brief. Model output is admitted only after deterministic provenance, confidence, correction, and outreach gates.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 430,
  },
  {
    group: "quality",
    name: "evidence_inventory",
    label: "Evidence inventory",
    description:
      "Live counts of enriched backlinks, known referring domains, competitor opportunities, AI citations/claims, and first-party business facts.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 440,
  },
  {
    group: "quality",
    name: "reputation_run_state",
    label: "Analysis run state",
    description:
      "The current streamed analysis stage and durable run identity when a run exists in this browser session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 450,
  },
];

export const marketingReputationManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-reputation",
  readiness: "verified",
  label: "Digital PR & Reputation",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/reputation",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are in the Digital PR & Reputation command center for one managed site. Read brand_context and site_context first, then use the evidence brief and durable cases.
This surface is evidence-closed. Facts, model inferences, and human rulings are separate. Never turn an allegation into fact, invent a publication relationship, infer control from a provider score, or recommend correction without the disputed source and contrary authoritative evidence.
Protect accurate positive coverage. Outreach requires demonstrated editorial interest, topic overlap, a genuinely supportable angle, an available source asset, and resolvable evidence. Negative coverage can be protect, correct, respond, request update, leave alone, monitor, or investigate; choose the least risky action the evidence supports.
The evidence_inventory states what the platform actually has. Missing lanes and the brief's limitations are part of the answer, not details to hide.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  agentRoles: [
    {
      name: "reputation_adjudicator",
      label: "Reputation adjudicator",
      description:
        "Separates facts from inferences and issues defensible handling decisions from closed evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "digital_pr_strategist",
      label: "Digital PR strategist",
      description:
        "Finds genuinely relevant publication opportunities and evidence-backed resource angles.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

export function createMarketingReputationScope(values: {
  brand_id: string;
  site_id: string;
  reputation_cases?: Array<Record<string, unknown>>;
  publication_opportunities?: Array<Record<string, unknown>>;
  reputation_narratives?: Array<Record<string, unknown>>;
  reputation_brief?: Record<string, unknown>;
  evidence_inventory?: Record<string, unknown>;
  reputation_run_state?: Record<string, unknown>;
  brand_name?: string;
  gsc_synced_at?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
