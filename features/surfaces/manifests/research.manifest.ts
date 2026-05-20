/**
 * Surface manifest — Research workspace (`matrx-user/research`).
 *
 * The research & analysis views (route `/research/topics/[topicId]`). A topic
 * gathers keywords, sources, content analyses, and synthesis documents through
 * an autonomous-or-manual research pipeline.
 *
 * Agents bound here operate on the topic (refine the question, generate more
 * keywords, critique the synthesis) or on the gathered material (summarize
 * sources, extract themes).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "topic_id",
    label: "Topic ID",
    description:
      "UUID of the research topic being viewed. Empty when on the research landing with no topic open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "topic_name",
    label: "Topic name",
    description:
      "Title of the active research topic. Empty when no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 310,
  },
  {
    name: "topic_description",
    label: "Topic description",
    description:
      "Structured description / research question for the topic. Empty when unset or no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 320,
  },
  {
    name: "topic_status",
    label: "Topic status",
    description:
      '"draft", "searching", "scraping", "curating", "analyzing", or "complete". Empty when no topic is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 325,
  },
  {
    name: "autonomy_level",
    label: "Autonomy level",
    description:
      '"auto", "semi", or "manual" — how much the research pipeline runs without user intervention. Empty when no topic is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 330,
  },
  {
    name: "keyword_list",
    label: "Keywords",
    description:
      "Array of keyword strings driving the topic's searches. Empty array when none or no topic is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 340,
  },
  {
    name: "source_count",
    label: "Source count",
    description:
      "Total number of sources discovered for the topic. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 350,
  },
  {
    name: "included_source_count",
    label: "Included source count",
    description:
      "Number of non-excluded sources retained for analysis. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 355,
  },
  {
    name: "analysis_count",
    label: "Analysis count",
    description:
      "Number of completed content analyses for the topic. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 360,
  },
  {
    name: "current_synthesis_text",
    label: "Current synthesis",
    description:
      "Body of the most recent topic-level synthesis document. Empty when no synthesis exists yet or no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 370,
  },
  {
    name: "synthesis_documents",
    label: "Synthesis documents",
    description:
      "Array of `{ id, title, created_at }` for every generated research document. Empty array when none or no topic is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 375,
  },
];

export const researchManifest: SurfaceManifest = {
  surfaceName: "matrx-user/research",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createResearchScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  topic_id?: string;
  topic_name?: string;
  topic_description?: string;
  topic_status?: string;
  autonomy_level?: string;
  keyword_list?: string[];
  source_count?: number;
  included_source_count?: number;
  analysis_count?: number;
  current_synthesis_text?: string;
  synthesis_documents?: Array<{ id: string; title: string; created_at?: string }>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
