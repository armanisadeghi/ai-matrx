// features/marketing/intelligence-places.ts
//
// WHERE EACH MARKETING & SEO JOB RUNS — drawn on /intelligence/marketing
// (covers both `marketing.*` and `seo.*` jobs; content plans have their own
// page). Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const MARKETING_PLACES: FeaturePlaces = {
  feature: "marketing",
  label: "Marketing & SEO",
  extraPrefixes: ["seo"],
  roots: [
    "features/marketing/seo",
    "features/marketing/components",
    "features/marketing/competitors",
    "features/marketing/local",
  ],
  places: [
    {
      id: "topical-map",
      label: "Topical map",
      trigger: "Draft the map, propose page intents, map pages",
      urlPattern: "/marketing/[brandId]/content/map/[mapId]",
      mandateKeys: [K.seo__map_author, K.seo__page_intent_proposer, K.seo__page_mapper],
      sources: [
        "features/marketing/seo/topical-map/map-author.ts",
        "features/marketing/seo/topical-map/map-intents.ts",
        "features/marketing/seo/topical-map/map-pages.ts",
      ],
    },
    {
      id: "topic",
      label: "A topic on the map",
      trigger: "Topic curation",
      urlPattern: "/marketing/topical-maps/topics/[topicId]",
      mandateKeys: [K.seo__topic_curation],
      sources: ["features/marketing/seo/topical-map/panel/sections/TopicAgentControls.tsx"],
    },
    {
      id: "start-map",
      label: "Start a topical map",
      trigger: "Build my map",
      urlPattern: "/marketing/topical-maps/start",
      mandateKeys: [K.seo__map_author],
      sources: ["features/marketing/seo/topical-map/start/StartMapResult.tsx"],
    },
    {
      id: "finding",
      label: "An SEO finding",
      trigger: "Fix it for me",
      urlPattern: "/marketing/[brandId]/seo/[siteId]/findings/[findingId]",
      mandateKeys: [K.seo__finding_fixer],
      sources: ["features/marketing/components/analysis/FindingFixCard.tsx"],
    },
    {
      id: "competitors",
      label: "Competitors",
      trigger: "Landscape brief",
      urlPattern: "/marketing/[brandId]/intelligence/competitors",
      mandateKeys: [K.seo__landscape_brief],
      sources: ["features/marketing/competitors/LandscapeBriefCard.tsx"],
    },
    {
      id: "value-settings",
      label: "Keyword value settings",
      trigger: "Autonomy modes for the classifier and topic assigner",
      urlPattern: "/marketing/[brandId]/seo/[siteId]/keywords/value/settings",
      mandateKeys: [K.seo__keyword_classifier, K.seo__topic_assigner],
      sources: ["features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx"],
    },
    {
      id: "ruling-session",
      label: "Keyword ruling session",
      trigger: "Trial: rule writer and stamp proposer",
      mandateKeys: [K.seo__session_rule_writer, K.seo__session_stamp_proposer],
      sources: ["features/marketing/seo/value-system/workbench/session/TrialPanel.tsx"],
    },
    {
      id: "automations",
      label: "Automations",
      trigger: "Topic assignment runs",
      urlPattern: "/marketing/automations",
      mandateKeys: [K.seo__topic_assigner],
      sources: ["features/surfaces/manifests/marketing-automations.manifest.ts"],
    },
    {
      id: "backlinks",
      label: "Backlinks",
      trigger: "Keyword expansion, work plan suggestions",
      urlPattern: "/marketing/[brandId]/seo/[siteId]/backlinks",
      mandateKeys: [K.seo__keyword_expander, K.seo__backlink_work_planner],
      sources: [
        "features/surfaces/manifests/marketing-backlinks.manifest.ts",
        "features/marketing/components/backlinks/backlinks-assists-producer.ts",
      ],
    },
    {
      id: "search-console",
      label: "Search Console insights",
      trigger: "Page analysis suggestions",
      urlPattern: "/marketing/reports/search-console/insights",
      mandateKeys: [K.seo__page_analyzer],
      sources: ["features/marketing/search-console/insights-assists-producer.ts"],
    },
    {
      id: "media",
      label: "Site media",
      trigger: "Generate page images, video details",
      mandateKeys: [
        K.marketing__image_prompt,
        K.marketing__page_image,
        K.marketing__page_image_all_in_one,
        K.marketing__video_metadata,
      ],
      sources: [
        "features/marketing/lib/generate-page-image.ts",
        "features/marketing/lib/generate-video-metadata.ts",
      ],
    },
    {
      id: "local",
      label: "Local listings",
      trigger: "Endowment analysis",
      urlPattern: "/marketing/local",
      mandateKeys: [K.marketing__endowment_analysis, K.marketing__endowment_portfolio],
      sources: ["features/marketing/local/EndowmentAnalysisCard.tsx"],
    },
  ],
};
