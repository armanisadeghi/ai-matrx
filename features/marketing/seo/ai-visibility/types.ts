import type { Database } from "@/types/database.types";
import type { components } from "@/types/python-generated/api-types";

type SeoTables = Database["seo"]["Tables"];

export type AiVisibilityResponse = SeoTables["ai_visibility_response"]["Row"];
export type AiVisibilityClaim = SeoTables["ai_visibility_claim"]["Row"];
export type AiVisibilityCitation = SeoTables["ai_visibility_citation"]["Row"];
export type AiVisibilitySignal = SeoTables["ai_visibility_signal"]["Row"];

export type AiVisibilityAnalyzeBody =
  components["schemas"]["AiVisibilityAnalyzeBody"];
export type AiVisibilityEngine = NonNullable<
  AiVisibilityAnalyzeBody["engines"]
>[number];
export type AiVisibilityResult = components["schemas"]["AiVisibilityResult"];
export type AiVisibilityProviderResult =
  components["schemas"]["AiVisibilityProviderResult"];

export interface AiVisibilityEvidence {
  responses: AiVisibilityResponse[];
  claims: AiVisibilityClaim[];
  citations: AiVisibilityCitation[];
  signals: AiVisibilitySignal[];
}

export interface AiVisibilityLiveAnswer {
  engine: AiVisibilityEngine;
  responseId?: string;
  modelName?: string | null;
  answerText: string;
  targetMentioned: boolean;
  targetCited: boolean;
  citationCount: number;
  analysis?: Record<string, unknown>;
  error?: string;
}

export interface AiVisibilityRunState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  runId?: string;
  requestId?: string;
  hasStreamedContent?: boolean;
  answers: Partial<Record<AiVisibilityEngine, AiVisibilityLiveAnswer>>;
  result?: AiVisibilityResult;
  error?: string;
}

export const AI_VISIBILITY_ENGINES: Array<{
  id: AiVisibilityEngine;
  label: string;
  shortLabel: string;
}> = [
  { id: "chat_gpt", label: "ChatGPT", shortLabel: "GPT" },
  { id: "claude", label: "Claude", shortLabel: "Claude" },
  { id: "gemini", label: "Gemini", shortLabel: "Gemini" },
  { id: "perplexity", label: "Perplexity", shortLabel: "Perplexity" },
];
