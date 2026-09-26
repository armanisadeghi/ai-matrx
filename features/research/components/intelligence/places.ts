// features/research/components/intelligence/places.ts
//
// WHERE EACH RESEARCH JOB RUNS — the places the feature intelligence page
// draws. Research jobs run on the server, started by the buttons below; each
// place names the component that calls the research endpoint whose server
// function runs the job (endpoint → job per `admin/types.ts` AGENT_CONFIG_META
// `usedBy`). `__tests__/intelligence-places.test.ts` proves every named
// component still makes that call.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

/** Research API method → the jobs its server function runs. */
export const RESEARCH_CALL_JOBS = {
  analyzeAll: [K.research__structured_page_summary],
  analyzeSource: [K.research__structured_page_summary],
  autoTag: [K.research__auto_tagger],
  suggestTags: [K.research__auto_tagger],
  synthesize: [
    K.research__keyword_synthesis,
    K.research__report,
    K.research__report_updater,
  ],
  consolidateTag: [K.research__tag_consolidation],
  generateTagSuggestions: [K.research__cross_cutting_tags],
  generateDocument: [K.research__document_assembly],
  suggest: [K.research__suggest_setup],
  // Not a research endpoint: the Agents page's Deep research card launches
  // this job through the mandate door itself (`launcher.launchMandate(`).
  launchMandate: [K.research__topic_deep_research],
} as const;

export type ResearchCall = keyof typeof RESEARCH_CALL_JOBS;

/** Which calls each place's components make — the test reads these. */
export const RESEARCH_PLACE_CALLS: Record<string, Record<string, readonly ResearchCall[]>> = {
  overview: {
    "features/research/components/overview/pipeline-graph/PipelineGraph.tsx": [
      "analyzeAll",
      "autoTag",
      "synthesize",
    ],
  },
  sources: {
    "features/research/components/sources/SourceList.tsx": ["analyzeSource"],
  },
  source: {
    "features/research/components/sources/SourceDetail.tsx": ["analyzeSource"],
    "features/research/components/sources/SourceTagPicker.tsx": ["suggestTags"],
  },
  analysis: {
    "features/research/components/analysis/AnalysisList.tsx": ["analyzeAll"],
  },
  synthesis: {
    "features/research/components/synthesis/SynthesisList.tsx": ["synthesize"],
  },
  tags: {
    "features/research/components/tags/TagManager.tsx": ["consolidateTag"],
    "features/research/components/tags/CrossCuttingTagsPanel.tsx": [
      "generateTagSuggestions",
    ],
  },
  tag: {
    "features/research/components/consolidation/ConsolidationView.tsx": [
      "consolidateTag",
    ],
  },
  document: {
    "features/research/components/document/DocumentViewer.tsx": [
      "generateDocument",
    ],
  },
  new: {
    "features/research/components/init/ResearchInitForm.tsx": ["suggest"],
  },
  agents: {
    "features/research/components/agents/DeepResearchMandateCard.tsx": [
      "launchMandate",
    ],
  },
};

function jobsOf(placeId: string): string[] {
  const calls = Object.values(RESEARCH_PLACE_CALLS[placeId] ?? {}).flat();
  return [...new Set(calls.flatMap((call) => RESEARCH_CALL_JOBS[call]))];
}

function sourcesOf(placeId: string): string[] {
  return Object.keys(RESEARCH_PLACE_CALLS[placeId] ?? {});
}

const place = (
  id: string,
  label: string,
  trigger: string,
  urlPattern: string,
) => ({
  id,
  label,
  trigger,
  urlPattern,
  mandateKeys: jobsOf(id),
  sources: sourcesOf(id),
});

export const RESEARCH_PLACES: FeaturePlaces = {
  feature: "research",
  label: "Research",
  // The topic Outputs studio's jobs (blog, slides, SEO package, reviews…).
  extraPrefixes: ["research_client"],
  places: [
    place("new", "New topic", "Suggest setup", "/research/topics/new"),
    place(
      "overview",
      "Topic overview",
      "Pipeline: analyze, auto-tag, synthesize",
      "/research/topics/[topicId]",
    ),
    place("sources", "Sources", "Analyze", "/research/topics/[topicId]/sources"),
    place(
      "source",
      "One source",
      "Analyze, suggest tags",
      "/research/topics/[topicId]/sources/[sourceId]",
    ),
    place("analysis", "Analysis", "Analyze all", "/research/topics/[topicId]/analysis"),
    place("synthesis", "Synthesis", "Synthesize", "/research/topics/[topicId]/synthesis"),
    place(
      "tags",
      "Tags",
      "Consolidate, cross-cutting suggestions",
      "/research/topics/[topicId]/tags",
    ),
    place("tag", "One tag", "Consolidate", "/research/topics/[topicId]/tags/[tagId]"),
    place("document", "Document", "Generate document", "/research/topics/[topicId]/document"),
    place("agents", "Agents", "Deep research", "/research/topics/[topicId]/agents"),
  ],
};
