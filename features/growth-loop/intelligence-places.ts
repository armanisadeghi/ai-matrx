// features/growth-loop/intelligence-places.ts
//
// WHERE EACH GROWTH LOOP JOB RUNS — drawn on /intelligence/growth_loop. Every
// job here runs on the server: a 30-second supervisor tick hands each open step
// of a live loop to its agent, and a judge scores each step the moment it
// finishes. The person sees both on the site's growth-loop workspace. Proved
// against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;
const WORKSPACE = "features/growth-loop/run/components/SiteGrowthLoopWorkspace.tsx";
const LOOP_URL = "/marketing/[brandId]/seo/[siteId]/growth-loop";

export const GROWTH_LOOP_PLACES: FeaturePlaces = {
  feature: "growth_loop",
  label: "Growth Loop",
  roots: ["features/growth-loop"],
  places: [
    {
      id: "running-loop",
      label: "Site growth loop",
      trigger: "Each step of a running loop is handed to an agent",
      urlPattern: LOOP_URL,
      mandateKeys: [K.growth_loop__supervisor],
      sources: [WORKSPACE],
    },
    {
      id: "step-scores",
      label: "Site growth loop history",
      trigger: "Each finished step is scored",
      urlPattern: LOOP_URL,
      mandateKeys: [
        K.growth_loop__quality_research,
        K.growth_loop__quality_plan,
        K.growth_loop__quality_brief,
        K.growth_loop__quality_realize,
        K.growth_loop__quality_fill,
        K.growth_loop__quality_publish,
        K.growth_loop__quality_serve,
        K.growth_loop__quality_crawl,
        K.growth_loop__quality_analyze,
        K.growth_loop__quality_suggest,
        K.growth_loop__quality_writeback,
      ],
      sources: [WORKSPACE],
    },
  ],
};
