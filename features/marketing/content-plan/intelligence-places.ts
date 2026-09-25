// features/marketing/content-plan/intelligence-places.ts
//
// WHERE EACH CONTENT PLAN JOB RUNS — drawn on /intelligence/content_plan.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const CONTENT_PLAN_PLACES: FeaturePlaces = {
  feature: "content_plan",
  label: "Content plan",
  roots: ["features/marketing/content-plan"],
  places: [
    {
      id: "setup",
      label: "Plan setup",
      trigger: "Setup passes: page shapes, families, entities, keywords, review",
      urlPattern: "/marketing/content-plan/[siteId]?view=setup",
      mandateKeys: [
        K.content_plan__shape_planner,
        K.content_plan__family_namer,
        K.content_plan__entity_curator,
        K.content_plan__plan_reviewer,
        K.content_plan__keyword_strategist,
        K.content_plan__entity_attacher,
      ],
      sources: [
        "features/marketing/content-plan/setup/ai.ts",
        "features/surfaces/manifests/content-plan-setup.manifest.ts",
      ],
    },
    {
      id: "plan",
      label: "A content plan",
      trigger: "Plan review, entity curation",
      urlPattern: "/marketing/content-plan/[siteId]",
      mandateKeys: [K.content_plan__plan_reviewer, K.content_plan__entity_curator],
      sources: [
        "features/surfaces/manifests/content-plan.manifest.ts",
        "features/surfaces/manifests/content-plan-entities.manifest.ts",
      ],
    },
    {
      id: "brief",
      label: "A planned page",
      trigger: "Write the page brief",
      urlPattern: "/marketing/content-plan/nodes/[nodeId]",
      mandateKeys: [K.content_plan__brief_writer],
      sources: [
        "features/marketing/content-plan/hooks/useBriefWriter.ts",
        "features/surfaces/manifests/content-plan-node.manifest.ts",
      ],
    },
    {
      id: "families",
      label: "Plan index",
      trigger: "Page family grouping",
      urlPattern: "/marketing/content-plan/[siteId]",
      mandateKeys: [K.content_plan__p3_family],
      sources: ["features/marketing/content-plan/hooks/usePlanIndex.ts"],
    },
  ],
};
