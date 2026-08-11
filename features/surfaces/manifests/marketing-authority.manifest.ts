import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "authority_model",
    label: "Authority model",
    sortOrder: 100,
    description: "The joined evidence and deterministic authority-flow model.",
  },
  {
    key: "authority_actions",
    label: "Recommended routes",
    sortOrder: 200,
    description:
      "Exact source-to-target actions proposed by the grounded strategist.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "authority_summary",
    label: "Authority verdict",
    description:
      "Latest authority-router verdict, evidence coverage, warnings, and calculation time.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "authority_model",
    sortOrder: 100,
  },
  {
    name: "authority_pages",
    label: "Modeled pages",
    description:
      "Canonical pages with Link Score, backlink entry signals, GSC demand, role, keyword, and current in/out link counts.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    group: "authority_model",
    sortOrder: 110,
  },
  {
    name: "authority_candidates",
    label: "Grounded candidate routes",
    description:
      "The deterministic allowlist of missing source-to-target edges the strategist was permitted to judge.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "authority_actions",
    sortOrder: 200,
  },
  {
    name: "authority_recommendations",
    label: "Authority route recommendations",
    description:
      "Ranked exact source, target, anchor, placement, expected benefit, evidence, confidence, and cannibalization risk.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "authority_actions",
    sortOrder: 210,
  },
];

export const marketingAuthorityManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-authority",
  readiness: "verified",
  label: "Internal Authority Router",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/authority",
  inheritsFrom: "matrx-user/marketing-site",
  groups,
  intro: `<surface_intro>
You are on the Internal Authority Router for one managed website. This surface joins observed backlink entry points, the current crawl link graph and Link Score, Search Console demand and educational traffic, page roles, keyword mapping, content plans, and cannibalization evidence.
Recommendations are grounded actions, not invented strategy: every source and target is a real canonical page and every pair came from the deterministic candidate allowlist. Use authority_recommendations for exact anchors and placements; use authority_pages and authority_candidates when challenging the rationale. When a scan warning says evidence was truncated, state that limitation.
Approved recommendations enter the existing bidirectional page link plan; the observed link graph changes only after the live site is edited and crawled again.
</surface_intro>`,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  agentRoles: [
    {
      name: "authority_routing_strategist",
      label: "Authority routing strategist",
      description:
        "Explains and refines grounded internal-authority routes without inventing pages or evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

export function createMarketingAuthorityScope(values: {
  brand_id: string;
  site_id: string;
  authority_summary?: Record<string, unknown>;
  authority_pages?: Array<Record<string, unknown>>;
  authority_candidates?: Array<Record<string, unknown>>;
  authority_recommendations?: Array<Record<string, unknown>>;
  brand_name?: string;
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
