/**
 * Cross-cutting tag-input export.
 *
 * Mirrors `authorityExport.ts`, but for the Cross-Cutting Tag Generator agent.
 * The server hands back the EXACT agent input — the topic's keyword list plus a
 * formatted blob of the search results — and this module shapes that into the
 * three things a user actually wants: a Copy-for-AI envelope, a plain-text dump,
 * and a downloadable file.
 *
 * Every agent in this product also accepts a trailing user prompt, so a user can
 * paste this into the agent themselves and append their own steer at the end —
 * which is why "Export search results" exists alongside the in-app generator.
 */

import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import type { TagInputExportResponse } from "../types";

/** Plain-language task the receiving agent should perform on the exported input. */
const TAG_INSTRUCTIONS =
  "Identify the cross-cutting tag dimensions for this research topic. A " +
  "cross-cutting dimension is a single theme that spans several of the " +
  "keywords below rather than belonging to just one — the angles a reader " +
  "would want to slice every source by. Use the keyword list and the search " +
  "results to propose a tight set of such dimensions. For each, give a short " +
  "name, the keywords it spans, a 0–1 confidence, and a one-line reason.";

/**
 * The human-readable text body: keyword list followed by the search-results
 * blob, exactly as the agent receives them. Used for "Copy text" and "Download".
 */
export function tagInputToText(
  topicName: string | null,
  data: TagInputExportResponse,
): string {
  const header = topicName ? `# Topic: ${topicName}\n\n` : "";
  return (
    `${header}## Keywords\n\n${data.keywords_text.trim()}\n\n` +
    `## Search results\n\n${data.search_results_text.trim()}\n`
  );
}

/**
 * The Copy-for-AI envelope: the same keyword + search-results input wrapped in
 * the standard agent payload with instructions and topic context, so it can be
 * pasted straight into a fresh chat.
 */
export function tagInputToAiText(
  topicId: string,
  topicName: string | null,
  data: TagInputExportResponse,
): string {
  return buildAgentPayload({
    kind: "research-cross-cutting-tags",
    location: "AI Matrx — Research · Tags",
    description: TAG_INSTRUCTIONS,
    data: {
      keywords: data.keywords_text,
      search_results: data.search_results_text,
    },
    attributes: {
      topicId,
    },
    context: {
      topic: topicName,
    },
  });
}

/** Suggested download filename for the exported tag input. */
export function tagInputExportFilename(
  topicId: string,
  topicName: string | null,
): string {
  const slug = (topicName ?? topicId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const date = new Date().toISOString().slice(0, 10);
  return `cross-cutting-tag-input-${slug || "topic"}-${date}.txt`;
}
